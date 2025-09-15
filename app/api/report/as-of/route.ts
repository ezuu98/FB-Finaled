import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

function pickWarehouseColumn(movement: string): "warehouse_id" | "warehouse_dest_id" {
  switch (movement) {
    case "purchase":
    case "manufacturing":
    case "transfer_in":
      return "warehouse_dest_id";
    case "transfer_out":
      return "warehouse_id";
    case "sales":
    case "sales_returns":
    case "purchase_return":
    case "wastages":
    case "consumption":
      return "warehouse_id";
    default:
      return "warehouse_id";
  }
}

function toUtcStart(dateStr?: string | null) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function nextUtcStart(dateStr?: string | null) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

const MOVEMENT_ALIASES: Record<string, string[]> = {
  purchase: ["purchase", "purchases"],
  sales: ["sales"],
  sales_returns: ["sales_returns"],
  purchase_return: ["purchase_return", "purchase_returns"],
  manufacturing: ["manufacturing", "manufacture"],
  wastages: ["wastages", "wastage"],
  consumption: ["consumption", "consumptions"],
  // Backend uses 'transfer_in' for both directions; map accordingly
  transfer_in: ["transfer_in"],
  transfer_out: ["transfer_in"],
};

export async function POST(req: Request) {
  try {
    const { productIds, warehouseIds, fromDate, toDate, movements } = await req.json();

    // Hard-coded From date per requirements
    const today = new Date();
    const y = today.getUTCFullYear();
    const m = String(today.getUTCMonth() + 1).padStart(2, "0");
    const d = String(today.getUTCDate()).padStart(2, "0");
    const useFromDate = "2025-07-01";
    const useToDate = toDate || `${y}-${m}-${d}`;

    if (!Array.isArray(productIds) || productIds.length === 0)
      return NextResponse.json({ error: "Select at least one product" }, { status: 400 });
    if (!Array.isArray(warehouseIds) || warehouseIds.length === 0)
      return NextResponse.json({ error: "Select at least one warehouse" }, { status: 400 });

    const supabase = supabaseServer;

    type RowAgg = {
      warehouseId: string;
      productId: string;
      opening: number;
      adjustments: number;
      moves: Record<string, number>;
    };
    const map = new Map<string, RowAgg>();
    const totals: Record<string, number> = {};

    const startISO = toUtcStart(useFromDate || null);
    const endISO = nextUtcStart(useToDate || null);

    // 1) Opening stock from warehouse_inventory (wh_id, product_id, quantity)
    {
      const pageSize = 1000;
      let offset = 0;
      while (true) {
        const { data, error } = await supabase
          .from("warehouse_inventory")
          .select("wh_id, product_id, quantity")
          .in("product_id", productIds)
          .in("wh_id", warehouseIds)
          .order("product_id", { ascending: true })
          .order("wh_id", { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        for (const row of data ?? []) {
          const warehouseId = String(row.wh_id);
          const productId = String(row.product_id);
          const key = `${warehouseId}|${productId}`;
          const opening = Number(row.quantity || 0);
          let agg = map.get(key);
          if (!agg) {
            agg = { warehouseId, productId, opening: 0, adjustments: 0, moves: {} };
            map.set(key, agg);
          }
          agg.opening += opening;
          totals.opening = (totals.opening ?? 0) + opening;
        }
        if (!data || data.length < pageSize) break;
        offset += pageSize;
        if (offset > 500000) break; // safety cap
      }
    }

    // 2) Movements details (use provided movements or default list)
    const movementList: string[] = Array.isArray(movements) && movements.length
      ? movements
      : [
          "purchase",
          "purchase_return",
          "sales",
          "sales_returns",
          "transfer_in",
          "transfer_out",
          "wastages",
          "manufacturing",
          "consumption",
        ];

    for (const mv of movementList) {
      const col = pickWarehouseColumn(mv);
      const pageSize = 1000;
      let offset = 0;
      while (true) {
        let query = supabase
          .from("stock_movements")
          .select("id, product_id, warehouse_id, warehouse_dest_id, movement_type, quantity, created_at")
          .in("movement_type", MOVEMENT_ALIASES[mv] ?? [mv])
          .in("product_id", productIds)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (warehouseIds?.length) {
          // @ts-ignore dynamic column name
          query = query.in(col as any, warehouseIds);
        }
        if (startISO) query = query.gte("created_at", startISO);
        if (endISO) query = query.lt("created_at", endISO);
        const { data, error } = await query;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        for (const row of data ?? []) {
          const warehouseId = String(row[col as keyof typeof row]);
          const productId = String(row.product_id);
          const key = `${warehouseId}|${productId}`;
          const qty = Math.abs(Number(row.quantity ?? 0));
          let agg = map.get(key);
          if (!agg) {
            agg = { warehouseId, productId, opening: 0, adjustments: 0, moves: {} };
            map.set(key, agg);
          }
          agg.moves[mv] = (agg.moves[mv] ?? 0) + qty;
          totals[mv] = (totals[mv] ?? 0) + qty;
        }
        if (!data || data.length < pageSize) break;
        offset += pageSize;
        if (offset > 500000) break;
      }
    }

    // 3) Stock adjustments from stock_corrections (product_id, warehouse_id, variance_quantity)
    {
      // Build UUID mapping if present, but also support numeric warehouse_id
      let wrows: any[] = [];
      {
        let res = await supabase
          .from("warehouses")
          .select("id, uuid, warehouse_uuid");
        if (res.error) {
          res = await supabase
            .from("warehouses")
            .select("id, uuid, warehouse_uuid");
        }
        if (res.error || !res.data || res.data.length === 0) {
          let res2 = await supabase
            .from("warehouse")
            .select("id, uuid, warehouse_uuid");
          if (res2.error) {
            res2 = await supabase
              .from("warehouse")
              .select("id, uuid, warehouse_uuid");
          }
          wrows = res2.data ?? [];
        } else {
          wrows = res.data ?? [];
        }
      }
      const idToUuid = new Map<string, string>();
      const uuidToId = new Map<string, string>();
      for (const w of wrows ?? []) {
        const id = String(w.id);
        const uuid = String((w as any).uuid ?? (w as any).warehouse_uuid ?? "");
        if (uuid) {
          idToUuid.set(id, uuid);
          uuidToId.set(uuid, id);
        }
      }
      const uuidList = Array.from(idToUuid.values());
      const numericIdSet = new Set((warehouseIds || []).map((v: any) => String(v)));

      const pageSize = 1000;
      let offset = 0;
      const runAndAccumulate = async (table: string) => {
        let query = supabase
          .from(table)
          .select("id, product_id, warehouse_id, variance_quantity, correction_date")
          .in("product_id", productIds)
          .order("correction_date", { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (useFromDate) query = query.gte("correction_date", useFromDate);
        if (useToDate) query = query.lte("correction_date", useToDate);
        const { data, error } = await query;
        if (error) return { data: [] as any[], error };
        return { data: (data as any[]) ?? [], error: null };
      };

      // We'll try multiple variants and merge results
      while (true) {
        let rows: any[] = [];
        let err: any = null;

        // Try stock_corrections (uuid, correction_date)
        ({ data: rows, error: err } = await runAndAccumulate("stock_corrections"));

        if (err && !rows.length) {
          // If truly an error and no data, surface it
          return NextResponse.json({ error: err.message }, { status: 500 });
        }

        for (const row of rows) {
          const rawWh = (row as any).warehouse_id;
          const whUuid = typeof rawWh === "string" ? rawWh : "";
          let warehouseId = "";
          if (whUuid) warehouseId = uuidToId.get(whUuid) || whUuid; // map uuid->id or keep uuid
          // If we still don't have a numeric match to the selected list, skip
          if (warehouseId && !numericIdSet.has(String(warehouseId))) {
            if (whUuid) {
              const mapped = uuidToId.get(whUuid);
              if (!mapped || !numericIdSet.has(String(mapped))) continue;
              warehouseId = String(mapped);
            } else {
              continue;
            }
          }
          const productId = String((row as any).product_id);
          const key = `${warehouseId}|${productId}`;
          const qty = Number((row as any).variance_quantity ?? 0);
          if (!Number.isFinite(qty)) continue;
          let agg = map.get(key);
          if (!agg) {
            agg = { warehouseId, productId, opening: 0, adjustments: 0, moves: {} };
            map.set(key, agg);
          }
          agg.adjustments = (agg.adjustments ?? 0) + qty;
          totals.adjustments = (totals.adjustments ?? 0) + qty;
        }

        if (!rows || rows.length < pageSize) break;
        offset += pageSize;
        if (offset > 500000) break;
      }
    }

    const rows = Array.from(map.values());

    return NextResponse.json({ rows, totals });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
