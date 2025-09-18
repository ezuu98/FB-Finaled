"use client";

import ProductPickers from "@/components/product-pickers";
import { supabase } from "@/lib/supabase-client";
import { useEffect, useMemo, useState } from "react";

type Warehouse = { id: number; display_name: string };

type Item = { id: string; label: string; code?: string | null; category?: string | null };

function productLabel(row: Record<string, any>) {
  return row.name ?? String(row.id ?? "Unknown");
}

function productCode(row: Record<string, any>) {
  return row.barcode;
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

async function fetchAllInventoryWithCategories(): Promise<any[]> {
  let allProducts: any[] = [];
  let from = 0;
  const pageSize = 1000;
  
  while (true) {
    const { data, error } = await supabase
      .rpc("get_inventory_with_categories")
      .range(from, from + pageSize - 1);
    
    if (error) throw error;
    
    if (!data || data.length === 0) break;
    
    allProducts.push(...data);
    
    // If we got less than pageSize, we've reached the end
    if (data.length < pageSize) break;
    
    from += pageSize;
  }
  
  return allProducts;
}

export default function ProductWiseDetailsPageClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("Loading products...");

  useEffect(() => {
    const abortController = new AbortController();
    (async () => {
      setLoading(true);
      setError(null);
      try {
        setLoadingMessage("Fetching inventory data...");
        
        const [allProducts, fetchedWarehouses] = await Promise.all([
          fetchAllInventoryWithCategories(),
          fetchWarehousesAnon([8, 9, 10, 11, 12, 18]),
        ]);

        console.log("Raw products from RPC:", allProducts.length); // Debug log
        
        setLoadingMessage("Processing products...");

        const mapped: Item[] = allProducts.map((p: any, index: number) => {
          // Create a more robust unique ID
          let uniqueId: string;
          
          // Check for odoo_id or id with proper null/undefined checking
          if (p.odoo_id != null && p.odoo_id !== '') {
            uniqueId = String(p.odoo_id);
          } else if (p.id != null && p.id !== '') {
            uniqueId = String(p.id);
          } else {
            // Fallback to index-based ID to ensure uniqueness
            uniqueId = `product_${index}_${Date.now()}`;
          }

          const label = productLabel(p);
          const code = productCode(p);
          
          return {
            id: uniqueId,
            label: label,
            code: code,
            category: p.complete_name ?? null,
          };
        });

        console.log("Mapped products:", mapped.length); // Debug log
        
        // Check for duplicate IDs
        const ids = mapped.map(item => item.id);
        const uniqueIds = new Set(ids);
        if (ids.length !== uniqueIds.size) {
          console.warn("Duplicate IDs detected:", ids.length - uniqueIds.size);
        }

        setItems(mapped);
        setWarehouses(fetchedWarehouses);
      } catch (e: any) {
        if (abortController.signal.aborted) return;
        console.error("Error loading products:", e); // Debug log
        setError(e?.message || "Failed to load products");
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
          setLoadingMessage("");
        }
      }
    })();
    return () => abortController.abort();
  }, []);

  const hasNoProducts = useMemo(() => !loading && !error && items.length === 0, [loading, error, items]);

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <section className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="mt-6 w-full">
          {loading && (
            <div className="mb-4 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-700">{loadingMessage}</p>
              <div className="mt-2 w-full bg-blue-200 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full animate-pulse"></div>
              </div>
            </div>
          )}
          
          <ProductPickers items={items} warehouses={warehouses} />
          
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {hasNoProducts && (
            <p className="mt-2 text-sm text-gray-600">No products found in inventory.</p>
          )}
          {/* Debug info - remove in production */}
          {!loading && !error && (
            <p className="mt-2 text-sm text-gray-500">
              Loaded {items.length} products
            </p>
          )}
        </div>
      </section>
    </main>
  );
}