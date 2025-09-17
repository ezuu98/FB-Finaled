"use client";

import ProductPickers from "@/components/product-pickers";
import { supabase } from "@/lib/supabase-client";
import { useEffect, useMemo, useState } from "react";

type Warehouse = { id: number; display_name: string };

type Item = { id: string; label: string; code?: string | null; category?: string | null };

function productLabel(row: Record<string, any>) {
  return row.name ??  String(row.id ?? "Unknown");
}

function productCode(row: Record<string, any>) {
  return (
    row.barcode
  );
}

async function fetchWarehousesAnon(ids: number[]): Promise<Warehouse[]> {
  try {
    const { data, error } = await supabase
      .from("warehouses")
      .select("id, display_name")
      .in("id", ids as any)
      .order("display_name", { ascending: true });
    if (!error && data && data.length) {
      return data.map((w: any) => ({ id: Number(w.id), display_name: String(w.display_name) }));
    }
  } catch { }
  try {
    const { data, error } = await supabase
      .from("warehouse")
      .select("id, display_name")
      .in("id", ids as any)
      .order("display_name", { ascending: true });
    if (!error && data && data.length) {
      return data.map((w: any) => ({ id: Number(w.id), display_name: String(w.display_name) }));
    }
  } catch { }
  return ids.map((id) => ({ id, display_name: String(id) }));
}

export default function ProductWiseDetailsPageClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const abortController = new AbortController();
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [inventoryResult, fetchedWarehouses] = await Promise.all([
          supabase.rpc("get_inventory_with_categories"),
          fetchWarehousesAnon([8, 9, 10, 11, 12, 18]),
        ]);

        if (inventoryResult.error) throw inventoryResult.error;
        const products = inventoryResult.data ?? [];

        const mapped: Item[] = (products as any[]).map((p: any) => ({
          id: String(p.odoo_id || p.id || productLabel(p) || productCode(p) || crypto.randomUUID()),
          label: productLabel(p),
          code: productCode(p),
          category: p.complete_name ?? null,
        }));

        setItems(mapped);
        setWarehouses(fetchedWarehouses);
      } catch (e: any) {
        if (abortController.signal.aborted) return;
        setError(e?.message || "Failed to load products");
      } finally {
        if (!abortController.signal.aborted) setLoading(false);
      }
    })();
    return () => abortController.abort();
  }, []);

  const hasNoProducts = useMemo(() => !loading && !error && items.length === 0, [loading, error, items]);

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <section className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="mt-6 w-full">
          <ProductPickers items={items} warehouses={warehouses} />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {hasNoProducts && (
            <p className="mt-2 text-sm text-gray-600">No products found in inventory.</p>
          )}
        </div>
      </section>
    </main>
  );
}
