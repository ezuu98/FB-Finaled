"use client";

import FreshBasketHeader from "@/components/freshbasket-header";
import ProductPickers from "@/components/product-pickers";
import { supabase } from "@/lib/supabase-client";
import { useEffect, useMemo, useState } from "react";

type Warehouse = { id: number; display_name: string };

type Item = { id: string; label: string; code?: string | null; category?: string | null };

function productLabel(row: Record<string, any>) {
  return row.name ?? row.product_name ?? row.title ?? row.sku ?? String(row.id ?? "Unknown");
}

function productCode(row: Record<string, any>) {
  return (
    row.barcode ?? row.bar_code ?? row.code ?? row.sku ?? row.ean ?? row.upc ?? row.product_code ?? null
  );
}

const chunk = <T,>(arr: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

async function fetchAllInventory() {
  const pageSize = 1000;
  const all: any[] = [];
  let offset = 0;
  let lastError: any = null;

  while (true) {
    const { data, error } = await supabase
      .from("inventory")
      .select("*")
      .order("name", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      lastError = error;
      break;
    }

    if (data && data.length) all.push(...data);
    if (!data || data.length < pageSize) break;
    offset += pageSize;
    if (offset > 100000) break;
  }

  return { data: all, error: lastError } as { data: any[]; error: any };
}

async function fetchCategoriesAnon(ids: Array<string | number>) {
  try {
    const unique = Array.from(new Set(ids.filter((v) => v !== null && v !== undefined)));
    const map = new Map<number, string>();
    for (const idsChunk of chunk(unique, 500)) {
      const numbers = idsChunk
        .map((v) => (typeof v === "number" ? v : Number(v)))
        .filter((v) => Number.isFinite(v));
      if (!numbers.length) continue;
      const { data, error } = await supabase
        .from("categories")
        .select("categ_id, complete_name")
        .in("categ_id", numbers as any);
      if (error) throw error;
      data?.forEach((row: any) => map.set(row.categ_id as number, row.complete_name as string));
    }
    return map;
  } catch {
    return new Map<number, string>();
  }
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
  } catch {}
  try {
    const { data, error } = await supabase
      .from("warehouse")
      .select("id, display_name")
      .in("id", ids as any)
      .order("display_name", { ascending: true });
    if (!error && data && data.length) {
      return data.map((w: any) => ({ id: Number(w.id), display_name: String(w.display_name) }));
    }
  } catch {}
  return ids.map((id) => ({ id, display_name: String(id) }));
}

export default function ProductWiseDetailsPageClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [{ data: products, error: invErr }, fetchedWarehouses] = await Promise.all([
          fetchAllInventory(),
          fetchWarehousesAnon([8, 9, 10, 11, 12, 18]),
        ]);
        if (invErr) throw invErr;
        const categoryIds = (products ?? []).map((p: any) => p.category_id);
        const categoryMap = await fetchCategoriesAnon(categoryIds);
        const mapped: Item[] = (products ?? []).map((p: any) => ({
          id: String(p.odoo_id ?? p.id ?? productLabel(p) ?? productCode(p) ?? Math.random()),
          label: productLabel(p),
          code: productCode(p),
          category:
            categoryMap.get(Number(p.category_id)) ??
            p.complete_name ??
            p.category_name ??
            p.category ??
            p.categ_name ??
            p.category_full_name ??
            null,
        }));
        if (!mounted) return;
        setItems(mapped);
        setWarehouses(fetchedWarehouses);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || "Failed to load products");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const hasNoProducts = useMemo(() => !loading && !error && items.length === 0, [loading, error, items]);

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <FreshBasketHeader />
      <section className="mx-auto w-full max-w-6xl px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Live Inventory Tracking</h1>
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
