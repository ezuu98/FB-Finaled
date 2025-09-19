import { useMemo, useState, useEffect } from "react";
import { supabase } from "@/lib/supabase-client";

type Item = { id: string; label: string; code?: string | null; category?: string | null };

type Warehouse = { id: number; display_name: string };

type Props = {
  items: Item[];
  warehouses?: Warehouse[];
};

type Option = { value: string; label: string };

function ChipMultiSelect({
  id,
  label,
  options,
  selected,
  onChange,
}: {
  id: string;
  label: string;
  options: Option[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedCount = selected.length;
  const selectedPreview = useMemo(() => {
    if (selected.length === 0) return [] as Option[];
    const set = new Set(selected);
    const preview: Option[] = [];
    for (const opt of options) {
      if (set.has(opt.value)) {
        preview.push(opt);
        if (preview.length >= 20) break;
      }
    }
    return preview;
  }, [selected, options]);
  const allSelected = options.length > 0 && selectedSet.size === options.length;
  const someSelected = selectedSet.size > 0 && selectedSet.size < options.length;

  const toggleAll = () => {
    if (allSelected) {
      onChange([]);
    } else {
      onChange(options.map((o) => o.value));
    }
  };

  const toggle = (val: string) => {
    if (selectedSet.has(val)) {
      onChange(selected.filter((v) => v !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  const remove = (val: string) => onChange(selected.filter((v) => v !== val));

  return (
    <div
      className="relative"
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        const rt = e.relatedTarget as Node | null;
        if (!rt || !e.currentTarget.contains(rt)) setOpen(false);
      }}
    >
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      <button
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-2 flex w-full min-h-[42px] flex-wrap items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-left text-gray-900 shadow-sm focus:border-gray-400 focus:outline-none"
      >
        {selectedCount === 0 ? (
          <span className="text-sm text-gray-500">Select...</span>
        ) : selectedCount > 50 ? (
          <span className="text-sm text-gray-700">{selectedCount} selected</span>
        ) : (
          selectedPreview.map((opt) => (
            <span
              key={opt.value}
              className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-800"
            >
              {opt.label}
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  remove(opt.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    remove(opt.value);
                  }
                }}
                className="ml-1 rounded-full p-0.5 text-gray-500 hover:bg-gray-200 hover:text-gray-700 cursor-pointer"
                aria-label={`Remove ${opt.label}`}
              >
                ×
              </span>
            </span>
          ))
        )}
        <span className="ml-auto text-gray-500">▾</span>
      </button>
      {open ? (
        <ul
          className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-gray-200 bg-white p-1 shadow-lg"
          role="listbox"
          aria-multiselectable
          onMouseDown={(e) => e.preventDefault()}
        >
          <li>
            <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50">
              <input
                type="checkbox"
                checked={allSelected}
                aria-checked={someSelected ? "mixed" : allSelected}
                onChange={toggleAll}
                className="h-4 w-4 rounded border-gray-300 text-gray-700 focus:ring-gray-400"
              />
              <span className="text-gray-800">Select all</span>
            </label>
          </li>
          {options.map((opt) => (
            <li key={opt.value}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={selectedSet.has(opt.value)}
                  onChange={() => toggle(opt.value)}
                  className="h-4 w-4 rounded border-gray-300 text-gray-700 focus:ring-gray-400"
                />
                <span className="text-gray-800">{opt.label}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function ProductPickers({ items, warehouses = [] }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const [selectedWarehouses, setSelectedWarehouses] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedMovements, setSelectedMovements] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  type ReportRow = { warehouseId: string; productId: string; moves: Record<string, number> };
  type Report = { rows: ReportRow[]; totals: Record<string, number> } | null;
  const [report, setReport] = useState<Report>(null);
  type AsOfRow = { warehouseId: string; productId: string; opening: number; adjustments: number; moves: Record<string, number> };
  type AsOfReport = { rows: AsOfRow[]; totals: Record<string, number> } | null;
  const [asOfReport, setAsOfReport] = useState<AsOfReport>(null);
  const [page, setPage] = useState(1);
  const fmt = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(2) : "0.00";
  };
  const htmlEscape = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
  const movementLabel = (k: string) => {
    const pretty = k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    // MOVEMENT_LABELS will override when available
    // @ts-ignore - type will be enforced where used
    return (MOVEMENT_LABELS as Record<string, string>)[k] ?? pretty;
  };

  const MOVEMENT_ORDER = [
    "purchase",
    "purchase_return",
    "sales",
    "sales_returns",
    "transfer_in",
    "transfer_out",
    "wastages",
    "manufacturing",
    "consumption",
  ] as const;
  type MovementKey = typeof MOVEMENT_ORDER[number];
  const MOVEMENT_LABELS: Record<MovementKey, string> = {
    purchase: "Purchases",
    purchase_return: "Purchase Returns",
    sales: "Sales",
    sales_returns: "Sales Returns",
    transfer_in: "Transfer In",
    transfer_out: "Transfer Out",
    wastages: "Wastages",
    manufacturing: "Manufacturing",
    consumption: "Consumption",
  };
  const movementOptions: Option[] = useMemo(
    () => MOVEMENT_ORDER.map((k) => ({ value: k, label: MOVEMENT_LABELS[k] })),
    []
  );
  const POSITIVE_MVS = new Set<MovementKey>(["purchase", "sales_returns", "transfer_in", "manufacturing"]);
  const NEGATIVE_MVS = new Set<MovementKey>(["sales", "purchase_return", "wastages", "consumption", "transfer_out"]);

  const orderedMovements = useMemo(() => {
    return [...selectedMovements].sort((a, b) => MOVEMENT_ORDER.indexOf(a) - MOVEMENT_ORDER.indexOf(b));
  }, [selectedMovements]);

  const warehouseOptions: Option[] = useMemo(
    () => warehouses.map((w) => ({ value: String(w.id), label: w.display_name })),
    [warehouses]
  );

  const categoryOptions: Option[] = useMemo(() => {
    const base = allCategories.length
      ? allCategories
      : Array.from(new Set(items.map((i) => (i.category ? String(i.category) : "")).filter(Boolean)));
    return base
      .slice()
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name }));
  }, [allCategories, items]);

  const norm = (s: string) => s.normalize("NFKD").toLowerCase();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_all_categories');
        if (!cancelled && !error && Array.isArray(data)) {
          const list = (data as any[])
            .map((row) => typeof row === 'string' ? row : (row?.name ?? row?.display_name ?? row?.label ?? ''))
            .filter((v) => typeof v === 'string' && v.trim().length > 0);
          const uniq = Array.from(new Set(list));
          setAllCategories(uniq);
          return;
        }
      } catch {}
      try {
        const { data } = await supabase.from('categories').select('display_name, name, active, is_active');
        if (!cancelled && Array.isArray(data)) {
          const list = data
            .filter((r: any) => r && (r.active === true || r.is_active === true || (r.active == null && r.is_active == null)))
            .map((r: any) => String(r.display_name || r.name || ''))
            .filter((v: string) => v.trim().length > 0);
          const uniq = Array.from(new Set(list));
          setAllCategories(uniq);
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const combinedPool = useMemo(() => {
    const q = norm(query.trim());
    const base = selectedCategories.length
      ? items.filter((i) => !!i.category && selectedCategories.includes(String(i.category)))
      : items;
    if (!q) return base;
    return base.filter((i) => norm(i.label).startsWith(q) || norm(i.code ?? "").startsWith(q));
  }, [items, query, selectedCategories]);

  const comboSize = useMemo(() => Math.min(10, Math.max(6, combinedPool.length)), [combinedPool.length]);

  const onComboChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const ids = Array.from(e.currentTarget.selectedOptions).map((o) => o.value);
    setSelected((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const baseSelectedSet = useMemo(() => new Set(selected), [selected]);

  const unionIds = useMemo(() => {
    const s = new Set<string>();
    combinedPool.forEach((i) => s.add(i.id));
    return s;
  }, [combinedPool]);

  const selectedSet = useMemo(() => {
    if (!selectAll) return baseSelectedSet;
    const s = new Set(baseSelectedSet);
    unionIds.forEach((id) => s.add(id));
    return s as Set<string>;
  }, [baseSelectedSet, selectAll, unionIds]);

  const SELECT_VALUE_LIMIT = 500;
  const comboSelectValue = useMemo(() => {
    const vals: string[] = [];
    for (const it of combinedPool) {
      if (selectedSet.has(it.id)) {
        if (vals.length >= SELECT_VALUE_LIMIT) return [] as string[];
        vals.push(it.id);
      }
    }
    return vals;
  }, [combinedPool, selectedSet]);

  const allUnionSelected = useMemo(() => {
    if (unionIds.size === 0) return false;
    for (const id of unionIds) if (!selectedSet.has(id)) return false;
    return true;
  }, [unionIds, selectedSet]);

  const toggleUnionSelection = () => {
    if (unionIds.size === 0) return;
    if (allUnionSelected) {
      setSelectAll(false);
      setSelected((prev) => prev.filter((id) => !unionIds.has(id)));
    } else {
      setSelectAll(true);
    }
  };

  const selectedItems = useMemo(() => items.filter((i) => selectedSet.has(i.id)), [items, selectedSet]);

  const PAGE_SIZE = 20;
  const totalReports = selectedItems.length;
  const totalPages = Math.max(1, Math.ceil(totalReports / PAGE_SIZE));
  const canPaginate = totalReports > PAGE_SIZE;
  const paginatedItems = useMemo(() => {
    if (!canPaginate) return selectedItems;
    const start = (page - 1) * PAGE_SIZE;
    return selectedItems.slice(start, start + PAGE_SIZE);
  }, [selectedItems, page, canPaginate]);

  useEffect(() => {
    // Reset to first page whenever the set of items or reports changes
    setPage(1);
  }, [totalReports, !!report, !!asOfReport]);

  const toNumericIds = (ids: Iterable<string>) => Array.from(ids).map((v) => (Number(v) || v)).map(Number).filter((n) => Number.isFinite(n)) as number[];

  const chunk = <T,>(arr: T[], size: number) => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  const aggregateMovementRows = (rows: Array<{ warehouse_id: number | string; product_id: number | string; moves: Record<string, number> }>): ReportRow[] => {
    const map = new Map<string, ReportRow>();
    for (const r of rows) {
      const wid = String(r.warehouse_id);
      const pid = String(r.product_id);
      const key = `${wid}:${pid}`;
      const cur = map.get(key) || { warehouseId: wid, productId: pid, moves: {} };
      for (const [k, v] of Object.entries(r.moves || {})) {
        const num = Number(v || 0);
        if (Number.isFinite(num)) cur.moves[k] = (cur.moves[k] || 0) + num;
      }
      map.set(key, cur);
    }
    return Array.from(map.values());
  };

  const aggregateAsOfRows = (rows: Array<{ warehouse_id: number | string; product_id: number | string; opening?: number; adjustments?: number; moves: Record<string, number> }>): AsOfRow[] => {
    const map = new Map<string, AsOfRow>();
    for (const r of rows) {
      const wid = String(r.warehouse_id);
      const pid = String(r.product_id);
      const key = `${wid}:${pid}`;
      const cur = map.get(key) || { warehouseId: wid, productId: pid, opening: 0, adjustments: 0, moves: {} };
      cur.opening += Number(r.opening || 0);
      cur.adjustments += Number(r.adjustments || 0);
      for (const [k, v] of Object.entries(r.moves || {})) {
        const num = Number(v || 0);
        if (Number.isFinite(num)) cur.moves[k] = (cur.moves[k] || 0) + num;
      }
      map.set(key, cur);
    }
    return Array.from(map.values());
  };

  const fetchMovementBatched = async (
    pids: number[],
    wids: number[],
    moves: string[],
    fromTs: string | null,
    toTs: string | null,
  ) => {
    const CHUNK_SIZE = 250;
    const chunks = chunk(pids, CHUNK_SIZE);
    const allRows: any[] = [];
    for (const c of chunks) {
      const { data, error } = await supabase.rpc("get_product_movement_report", {
        product_ids: c,
        warehouse_ids: wids,
        movements: moves,
        from_ts: fromTs,
        to_ts: toTs,
      });
      if (error) throw error;
      allRows.push(...(data || []));
    }
    const rows = aggregateMovementRows(allRows);
    const totals: Record<string, number> = {};
    for (const r of rows) {
      for (const [k, v] of Object.entries(r.moves)) {
        const num = Number(v || 0);
        if (Number.isFinite(num)) totals[k] = (totals[k] || 0) + num;
      }
    }
    return { rows, totals } as Report;
  };

  const fetchAsOfBatched = async (
    pids: number[],
    wids: number[],
    fromDateStr: string | null,
    toDateStr: string | null,
  ) => {
    const CHUNK_SIZE = 250;
    const chunks = chunk(pids, CHUNK_SIZE);
    const allRows: any[] = [];
    for (const c of chunks) {
      const { data, error } = await supabase.rpc("get_product_as_of_report", {
        product_ids: c,
        warehouse_ids: wids,
        from_date: fromDateStr,
        to_date: toDateStr,
      });
      if (error) throw error;
      allRows.push(...(data || []));
    }
    const rows = aggregateAsOfRows(allRows);
    const totals: Record<string, number> = { opening: 0, adjustments: 0 } as any;
    for (const r of rows) {
      totals.opening += Number((r as any).opening || 0);
      totals.adjustments += Number((r as any).adjustments || 0);
      for (const [k, v] of Object.entries((r as any).moves)) {
        const num = Number(v || 0);
        if (Number.isFinite(num)) totals[k] = (totals as any)[k] ? (totals as any)[k] + num : num;
      }
    }
    return { rows, totals } as AsOfReport;
  };

  const showDropdown = true;

  return (
    <div className="w-full">
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleUnionSelection}
          disabled={unionIds.size === 0}
          className="inline-flex items-center rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          {allUnionSelected ? "Deselect all" : "Select all"}
        </button>
      </div>

      <div>
        <label htmlFor="search-combo" className="block text-sm font-medium text-gray-700">
          Search by name or barcode
        </label>
        <input
          id="search-combo"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type name or barcode..."
          className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-gray-400 focus:outline-none"
        />
        {showDropdown ? (
          <select
            aria-label="Results"
            multiple
            size={comboSize}
            className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-gray-400 focus:outline-none"
            value={comboSelectValue}
            onChange={onComboChange}
          >
            {combinedPool.map((it) => {
              const isSel = selectedSet.has(it.id);
              const label = `${it.code ? `${it.code} — ` : ""}${it.label}`;
              return (
                <option key={it.id} value={it.id}>
                  {`${label}${isSel ? " ●" : ""}`}
                </option>
              );
            })}
          </select>
        ) : null}
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-4">
        <ChipMultiSelect
          id="cat-multi"
          label="Categories"
          options={categoryOptions}
          selected={selectedCategories}
          onChange={setSelectedCategories}
        />
        <ChipMultiSelect
          id="wh-multi"
          label="Warehouses"
          options={warehouseOptions}
          selected={selectedWarehouses}
          onChange={setSelectedWarehouses}
        />
        <ChipMultiSelect
          id="move-multi"
          label="Type of movement"
          options={movementOptions}
          selected={selectedMovements}
          onChange={setSelectedMovements}
        />
        <div>
          <label htmlFor="from-date" className="block text-sm font-medium text-gray-700">
            From date
          </label>
          <input
            id="from-date"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-gray-400 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="to-date" className="block text-sm font-medium text-gray-700">
            To date
          </label>
          <input
            id="to-date"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-gray-400 focus:outline-none"
          />
        </div>
      </div>
      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={async () => {
            setLoading(true);
            setError(null);
            setReport(null);
            setAsOfReport(null);
            try {
              if (selectedSet.size === 0) throw new Error("Select at least one product");
              if (selectedWarehouses.length === 0) throw new Error("Select at least one warehouse");
              if (selectedMovements.length === 0) throw new Error("Select at least one movement type");

              const pids = toNumericIds(selectedSet);
              const wids = selectedWarehouses.map((v) => (Number(v) || v)).map(Number).filter((n) => Number.isFinite(n)) as number[];
              const fromTs = fromDate ? new Date(`${fromDate}T00:00:00Z`).toISOString() : null;
              const toTs = toDate ? (() => { const d = new Date(`${toDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString(); })() : null;

              const rep = await fetchMovementBatched(pids, wids, selectedMovements, fromTs, toTs);
              setReport(rep);
            } catch (e: any) {
              const msg = String(e?.message || e || "");
              if (/statement timeout/i.test(msg)) setError("Query timed out. Try narrowing the date range or fewer products.");
              else setError(msg || "Something went wrong");
            } finally {
              setLoading(false);
            }
          }}
          disabled={loading}
          className="inline-flex items-center rounded-md bg-[rgb(37_99_235)] px-4 py-2 text-sm font-medium text-white hover:bg-[rgb(29_78_216)] focus:outline-none focus:ring-2 focus:ring-[rgb(37_99_235)] focus:ring-offset-1 disabled:opacity-60"
        >
          {loading ? "Creating..." : "Create Report"}
        </button>
        <button
          type="button"
          onClick={async () => {
            setLoading(true);
            setError(null);
            setReport(null);
            setAsOfReport(null);
            try {
              if (selectedSet.size === 0) throw new Error("Select at least one product");
              if (selectedWarehouses.length === 0) throw new Error("Select at least one warehouse");

              const pids = toNumericIds(selectedSet);
              const wids = selectedWarehouses.map((v) => (Number(v) || v)).map(Number).filter((n) => Number.isFinite(n)) as number[];

              const rep = await fetchAsOfBatched(pids, wids, '2025-07-01', toDate || null);
              setAsOfReport(rep);
            } catch (e: any) {
              const msg = String(e?.message || e || "");
              if (/statement timeout/i.test(msg)) setError("Query timed out. Try fewer products or a shorter range.");
              else setError(msg || "Something went wrong");
            } finally {
              setLoading(false);
            }
          }}
          className="inline-flex items-center rounded-md bg-[rgb(37_99_235)] px-4 py-2 text-sm font-medium text-white hover:bg-[rgb(29_78_216)] focus:outline-none focus:ring-2 focus:ring-[rgb(37_99_235)] focus:ring-offset-1"
        >
          {loading ? "Creating..." : "Create As of Report"}
        </button>
        <button
          type="button"
          onClick={() => {
            const hasStd = !!report;
            const hasAsOf = !!asOfReport;
            if (!hasStd && !hasAsOf) return;
            const warehousesToUse = selectedWarehouses.length ? selectedWarehouses : warehouses.map((w) => String(w.id));
            const style = `
              <style>
                table { border-collapse: collapse; width: 100%; }
                th, td { border: 1px solid #d1d5db; padding: 6px; font-family: Arial, sans-serif; font-size: 12px; text-align: center; }
                thead th { background: #f9fafb; color: #374151; }
                .title { background: #f3f4f6; font-weight: 600; font-size: 14px; text-align: left; }
                tfoot td { background: #f9fafb; font-weight: 600; }
              </style>
            `;
            let html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>${style}</head><body>`;
            html += `<div style="text-align:left;font-family:Arial,sans-serif;font-size:12px;margin:0 0 8px 0;"><div><strong>From:</strong> ${htmlEscape(fromDate || "—")}</div><div><strong>To:</strong> ${htmlEscape(toDate || "—")}</div></div>`;
            for (const prod of selectedItems) {
              const pid = String(prod.id);
              const prodLabel = items.find((i) => i.id === prod.id)?.label || prod.id;
              const prodCat = prod.category ?? "";
              const prodCode = prod.code ?? "";
              const rowsForProductStd = hasStd ? (report!.rows || []).filter((r) => String(r.productId) === pid) : [];
              const rowsForProductAsOf = hasAsOf ? (asOfReport!.rows || []).filter((r) => String(r.productId) === pid) : [];
              const mvs = hasAsOf ? Array.from(MOVEMENT_ORDER) : orderedMovements;
              const productTotals: Record<string, number> = {};
              let openingTotal = 0;
              let adjustmentsTotal = 0;
              if (hasAsOf) {
                for (const r of rowsForProductAsOf) {
                  openingTotal += Number(r.opening || 0);
                  adjustmentsTotal += Number(r.adjustments || 0);
                  for (const mv of mvs) productTotals[mv] = (productTotals[mv] ?? 0) + Number(r.moves[mv] || 0);
                }
              } else {
                for (const r of rowsForProductStd) {
                  for (const mv of mvs) productTotals[mv] = (productTotals[mv] ?? 0) + Number(r.moves[mv] || 0);
                }
              }
              const colCount = 1 + (hasAsOf ? 3 : 0) + mvs.length;
              html += `<table>`;
              html += `<thead>`;
              html += `<tr class="title"><th colspan="${colCount}" style="text-align:left">${htmlEscape(prodLabel)}${prodCat ? ` — ${htmlEscape(prodCat)}` : ""}${prodCode ? ` — ${htmlEscape(prodCode)}` : ""}</th></tr>`;
              html += `<tr>`;
              html += `<th style="text-align:left">Warehouse</th>`;
              if (hasAsOf) html += `<th>Opening Stock</th>`;
              for (const mv of mvs) html += `<th>${htmlEscape(movementLabel(mv))}</th>`;
              if (hasAsOf) html += `<th>Stock Adjustments</th><th>Closing Stock</th>`;
              html += `</tr>`;
              html += `</thead>`;
              html += `<tbody>`;
              for (const wid of warehousesToUse) {
                const whName = warehouses.find((w) => String(w.id) === String(wid))?.display_name || String(wid);
                const rowStd = rowsForProductStd.find((r) => String((r as any).warehouseId) === String(wid)) || null;
                const rowAsOf = rowsForProductAsOf.find((r) => String((r as any).warehouseId) === String(wid)) || null;
                html += `<tr>`;
                html += `<td style="text-align:left">${htmlEscape(whName)}</td>`;
                if (hasAsOf) html += `<td>${htmlEscape(fmt(rowAsOf?.opening ?? 0))}</td>`;
                let __plus = 0, __minus = 0;
                for (const mv of mvs) {
                  const val = (hasAsOf ? rowAsOf?.moves[mv] : rowStd?.moves[mv]);
                  const num = Number(val || 0);
                  if (["purchase","sales_returns","transfer_in","manufacturing"].includes(mv)) __plus += num; else if (["sales","purchase_return","wastages","consumption","transfer_out"].includes(mv)) __minus += num;
                  html += `<td>${val === undefined ? "" : htmlEscape(fmt(num))}</td>`;
                }
                if (hasAsOf) {
                  const __adj = Number(rowAsOf?.adjustments ?? 0);
                  const __open = Number(rowAsOf?.opening ?? 0);
                  html += `<td>${htmlEscape(fmt(__adj))}</td>`;
                  const __total = __open + __plus + __adj - __minus;
                  html += `<td>${htmlEscape(fmt(__total))}</td>`;
                }
                html += `</tr>`;
              }
              html += `</tbody>`;
              html += `<tfoot><tr><td style="text-align:left">Totals</td>`;
              if (hasAsOf) html += `<td>${htmlEscape(fmt(openingTotal))}</td>`;
              for (const mv of mvs) html += `<td>${htmlEscape(fmt(productTotals[mv] || 0))}</td>`;
              if (hasAsOf) {
                html += `<td>${htmlEscape(fmt(adjustmentsTotal))}</td>`;
                const __plusFooter = Number(productTotals["purchase"]||0) + Number(productTotals["sales_returns"]||0) + Number(productTotals["transfer_in"]||0) + Number(productTotals["manufacturing"]||0);
                const __minusFooter = Number(productTotals["sales"]||0) + Number(productTotals["purchase_return"]||0) + Number(productTotals["wastages"]||0) + Number(productTotals["consumption"]||0) + Number(productTotals["transfer_out"]||0);
                const __footerTotal = openingTotal + __plusFooter + adjustmentsTotal - __minusFooter;
                html += `<td>${htmlEscape(fmt(__footerTotal))}</td>`;
              }
              html += `</tr></tfoot>`;
              html += `</table><br/>`;
            }
            html += `</body></html>`;
            const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const ts = new Date().toISOString().replace(/[:.]/g, "-");
            a.download = `productwise-report-${ts}.xls`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }}
          disabled={!report && !asOfReport}
          className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-1 disabled:opacity-60"
        >
          Download Excel
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {(report || asOfReport) && (
        <>
          {canPaginate && (
            <div className="mt-6 flex items-center justify-between gap-3">
              <div className="text-sm text-gray-600">Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, totalReports)} of {totalReports}</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="inline-flex items-center rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  Prev
                </button>
                <span className="text-sm text-gray-700">Page {page} / {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="inline-flex items-center rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  Next
                </button>
              </div>
            </div>
          )}
          {paginatedItems.map((prod) => {
            const pid = String(prod.id);
            const rowsForProductStd = report ? (report.rows || []).filter((r) => String(r.productId) === pid) : [];
            const rowsForProductAsOf = asOfReport ? (asOfReport.rows || []).filter((r) => String(r.productId) === pid) : [];
            const showAsOf = rowsForProductAsOf.length > 0 || (!!asOfReport && rowsForProductStd.length === 0);
            const mvs = showAsOf ? Array.from(MOVEMENT_ORDER) : orderedMovements;
            const productTotals: Record<string, number> = {};
            let openingTotal = 0;
            let adjustmentsTotal = 0;
            if (showAsOf) {
              for (const r of rowsForProductAsOf) {
                openingTotal += Number((r as any).opening || 0);
                adjustmentsTotal += Number((r as any).adjustments || 0);
                for (const mv of mvs) {
                  productTotals[mv] = (productTotals[mv] ?? 0) + Number((r as any).moves[mv] || 0);
                }
              }
            } else {
              for (const r of rowsForProductStd) {
                for (const mv of mvs) {
                  productTotals[mv] = (productTotals[mv] ?? 0) + Number((r as any).moves[mv] || 0);
                }
              }
            }
            return (
              <div key={pid} className="mt-6">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 border">
                    <thead>
                      <tr className="bg-gray-100">
                        <th
                          colSpan={1 + (showAsOf ? 2 : 0) + mvs.length}
                          className="px-4 py-2 text-left text-sm font-semibold text-gray-800"
                        >
                          {(items.find((i) => i.id === prod.id)?.label || prod.id)}
                          {prod.category ? ` — ${prod.category}` : ""}
                          {prod.code ? ` — ${prod.code}` : ""}
                        </th>
                      </tr>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Warehouse</th>
                        {showAsOf ? <th className="px-4 py-2 text-center text-xs font-medium text-gray-700">Opening Stock</th> : null}
                        {mvs.map((mv) => (
                          <th key={mv} className="px-4 py-2 text-center text-xs font-medium text-gray-700">{movementLabel(mv)}</th>
                        ))}
                        {showAsOf ? <><th className="px-4 py-2 text-center text-xs font-medium text-gray-700">Stock Adjustments</th><th className="px-4 py-2 text-center text-xs font-medium text-gray-700">Closing Stock</th></> : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {(selectedWarehouses.length ? selectedWarehouses : warehouses.map((w) => String(w.id))).map((wid) => {
                        const whName = warehouses.find((w) => String(w.id) === String(wid))?.display_name || String(wid);
                        const rowStd = rowsForProductStd.find((r) => String((r as any).warehouseId) === String(wid)) || null;
                        const rowAsOf = rowsForProductAsOf.find((r) => String((r as any).warehouseId) === String(wid)) || null;
                        return (
                          <tr key={`${wid}-${pid}`}>
                            <td className="px-4 py-2 text-sm text-gray-900 text-left">{whName}</td>
                            {showAsOf ? (
                              <td className="px-4 py-2 text-sm text-gray-900 text-center">{fmt((rowAsOf as any)?.opening ?? 0)}</td>
                            ) : null}
                            {mvs.map((mv) => {
                              const val = showAsOf ? (rowAsOf as any)?.moves[mv] : (rowStd as any)?.moves[mv];
                              return (
                                <td key={mv} className="px-4 py-2 text-sm text-gray-900 text-center">{val === undefined ? "" : fmt(val)}</td>
                              );
                            })}
                            {showAsOf ? (
                              <>
                                <td className="px-4 py-2 text-sm text-gray-900 text-center">{fmt((rowAsOf as any)?.adjustments ?? 0)}</td>
                                {(() => {
                                  const values = mvs.map((mv) => Number((rowAsOf as any)?.moves[mv] || 0));
                                  let plus = 0, minus = 0;
                                  mvs.forEach((mv, i) => {
                                    const num = values[i];
                                    if (POSITIVE_MVS.has(mv as MovementKey)) plus += num; else if (NEGATIVE_MVS.has(mv as MovementKey)) minus += num;
                                  });
                                  const open = Number((rowAsOf as any)?.opening ?? 0);
                                  const adj = Number((rowAsOf as any)?.adjustments ?? 0);
                                  const total = open + plus + adj - minus;
                                  return <td className="px-4 py-2 text-sm text-gray-900 text-center">{fmt(total)}</td>;
                                })()}
                              </>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-left" colSpan={1}>Totals</td>
                        {showAsOf ? (
                          <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-center">{fmt(openingTotal)}</td>
                        ) : null}
                        {mvs.map((mv) => (
                          <td key={mv} className="px-4 py-2 text-sm font-semibold text-gray-900 text-center">{fmt(productTotals[mv] || 0)}</td>
                        ))}
                        {showAsOf ? (
                          <>
                            <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-center">{fmt(adjustmentsTotal)}</td>
                            {(() => {
                              const plusFooter = (productTotals["purchase"]||0) + (productTotals["sales_returns"]||0) + (productTotals["transfer_in"]||0) + (productTotals["manufacturing"]||0);
                              const minusFooter = (productTotals["sales"]||0) + (productTotals["purchase_return"]||0) + (productTotals["wastages"]||0) + (productTotals["consumption"]||0) + (productTotals["transfer_out"]||0);
                              const footerTotal = openingTotal + plusFooter + adjustmentsTotal - minusFooter;
                              return <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-center">{fmt(footerTotal)}</td>;
                            })()}
                          </>
                        ) : null}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })}
          {canPaginate && (
            <div className="mt-6 flex items-center justify-between gap-3">
              <div className="text-sm text-gray-600">Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, totalReports)} of {totalReports}</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="inline-flex items-center rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  Prev
                </button>
                <span className="text-sm text-gray-700">Page {page} / {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="inline-flex items-center rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
