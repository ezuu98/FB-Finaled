"use client";

import { useMemo, useState } from "react";

type Item = { id: string; label: string };

export default function ProductMultiSelect({ items }: { items: Item[] }) {
  const [selected, setSelected] = useState<string[]>([]);

  const size = useMemo(() => {
    const n = items.length;
    if (n <= 4) return Math.max(4, n);
    return Math.min(10, n);
  }, [items.length]);

  return (
    <div className="w-full">
      <label htmlFor="product-multi" className="block text-sm font-medium text-gray-700">
        Products
      </label>
      <select
        id="product-multi"
        multiple
        size={size}
        className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-gray-400 focus:outline-none"
        value={selected}
        onChange={(e) =>
          setSelected(Array.from(e.currentTarget.selectedOptions).map((o) => o.value))
        }
      >
        {items.map((it) => (
          <option key={it.id} value={it.id}>
            {it.label}
          </option>
        ))}
      </select>
      <p className="mt-2 text-sm text-gray-600">
        {selected.length === 0 ? "No products selected" : `${selected.length} selected`}
      </p>
    </div>
  );
}
