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
    const { productIds, warehouseIds, movements, fromDate, toDate } = await req.json();

    if (!Array.isArray(productIds) || productIds.length === 0)
      return NextResponse.json({ error: "Select at least one product" }, { status: 400 });
    if (!Array.isArray(warehouseIds) || warehouseIds.length === 0)
      return NextResponse.json({ error: "Select at least one warehouse" }, { status: 400 });
    if (!Array.isArray(movements) || movements.length === 0)
      return NextResponse.json({ error: "Select at least one movement type" }, { status: 400 });

    const supabase = supabaseServer;

    type RowAgg = { warehouseId: string; productId: string; moves: Record<string, number> };
    const map = new Map<string, RowAgg>();
    const totals: Record<string, number> = {};

    // Normalize date range to UTC day boundaries using provided values only
    const startISO = toUtcStart(fromDate || null);
    const endISO = nextUtcStart(toDate || null);

    const chunk = <T,>(arr: T[], size: number) => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    };

    for (const mv of movements as string[]) {
      const col = pickWarehouseColumn(mv);
      const pageSize = 1000;

      for (const pids of chunk(productIds, 200)) {
        let offset = 0;
        while (true) {
          let query = supabase
            .from("stock_movements")
            .select("id, product_id, warehouse_id, warehouse_dest_id, movement_type, quantity, created_at")
            .in("movement_type", MOVEMENT_ALIASES[mv] ?? [mv])
            .in("product_id", pids)
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
            const rawQty = Number(row.quantity ?? 0);
            const qty = Math.abs(rawQty);

            let agg = map.get(key);
            if (!agg) {
              agg = { warehouseId, productId, moves: {} };
              map.set(key, agg);
            }
            agg.moves[mv] = (agg.moves[mv] ?? 0) + qty;
            totals[mv] = (totals[mv] ?? 0) + qty;
          }

          if (!data || data.length < pageSize) break;
          offset += pageSize;
          if (offset > 500000) break; // safety cap
        }
      }
    }

    const rows = Array.from(map.values());

    return NextResponse.json({ rows, totals });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
