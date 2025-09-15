import type { Metadata } from "next";
import FreshBasketHeader from "@/components/freshbasket-header";
import { supabaseServer  } from "@/lib/supabase-server";
import { supabase } from "@/lib/supabase-client";
import ProductPickers from "@/components/product-pickers";
import Link from "next/link";

export const metadata: Metadata = {
  title: "FreshBasket — Live Inventory Tracking",
  description: "Live inventory tracking dashboard for ProductWise.",
};

function productLabel(row: Record<string, any>) {
  return row.name ?? row.product_name ?? row.title ?? row.sku ?? String(row.id ?? "Unknown");
}

function productCode(row: Record<string, any>) {
  return (
    row.barcode ?? row.bar_code ?? row.code ?? row.sku ?? row.ean ?? row.upc ?? row.product_code ?? null
  );
}

async function fetchAllInventory(supabase: ReturnType<typeof createServerSupabase>) {
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

    if (data && data.length) {
      all.push(...data);
    }

    if (!data || data.length < pageSize) break;
    offset += pageSize;
    if (offset > 100000) break;
  }

  return { data: all, error: lastError } as { data: any[]; error: any };
}

async function fetchCategories(
  _supabase: ReturnType<typeof createServerSupabase>,
  ids: Array<string | number>
) {
  const unique = Array.from(new Set(ids.filter((v) => v !== null && v !== undefined)));
  const chunkSize = 500;
  const map = new Map<number, string>();

  const admin = supabaseServer;

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const numbers = chunk
      .map((v) => (typeof v === "number" ? v : Number(v)))
      .filter((v) => Number.isFinite(v));

    if (numbers.length) {
      const { data } = await admin
        .from("categories")
        .select("categ_id, complete_name")
        .in("categ_id", numbers as any);
      data?.forEach((row: any) => map.set(row.categ_id as number, row.complete_name as string));
    }
  }

  return map;
}

async function fetchWarehouses(ids: number[]) {
  const admin = supabaseServer;

  // Try plural table first
  let { data, error } = await admin
    .from("warehouses")
    .select("id, display_name")
    .in("id", ids as any)
    .order("display_name", { ascending: true });

  if (error || !data || data.length === 0) {
    const fallback = await admin
      .from("warehouse")
      .select("id, display_name")
      .in("id", ids as any)
      .order("display_name", { ascending: true });
    data = fallback.data ?? null;
  }

  return (data ?? []).map((w: any) => ({ id: Number(w.id), display_name: String(w.display_name) }));
}

export default async function ProductWiseDetailsPage() {
  const supabase = supabaseServer;
  const { data: products, error } = await fetchAllInventory(supabase);

  const categoryIds = (products ?? []).map((p: any) => p.category_id);
  const categoryMap = await fetchCategories(supabase, categoryIds);

  const items = (products ?? []).map((p: any) => ({
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

  const warehouses = await fetchWarehouses([8, 9, 10, 11, 12, 18]);

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <FreshBasketHeader />

      <section className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="mb-4">
          <Link href="/" aria-label="Back" className="inline-flex items-center text-gray-700 hover:text-gray-900">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Live Inventory Tracking</h1>

        <div className="mt-6 w-full">
          <ProductPickers items={items} warehouses={warehouses} />
          {error && (
            <p className="mt-2 text-sm text-red-600">Failed to load products: {error.message}</p>
          )}
          {!error && products?.length === 0 && (
            <p className="mt-2 text-sm text-gray-600">No products found in inventory.</p>
          )}
        </div>

      </section>
    </main>
  );
}
