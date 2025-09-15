"use client";

import { useMemo, useState } from "react";

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
  const selectedOptions = useMemo(
    () => selected.map((v) => options.find((o) => o.value === v)).filter(Boolean) as Option[],
    [selected, options]
  );
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
        {selectedOptions.length === 0 ? (
          <span className="text-sm text-gray-500">Select...</span>
        ) : (
          selectedOptions.map((opt) => (
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
  const [qName, setQName] = useState("");
  const [qCode, setQCode] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [isNameOpen, setIsNameOpen] = useState(false);
  const [isCodeOpen, setIsCodeOpen] = useState(false);
  const [selectedWarehouses, setSelectedWarehouses] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedMovements, setSelectedMovements] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  type ReportRow = { warehouseId: string; productId: string; moves: Record<string, number> };
  type Report = { rows: ReportRow[]; totals: Record<string, number> } | null;
  const [report, setReport] = useState<Report>(null);
  type AsOfRow = { warehouseId: string; productId: string; opening: number; adjustments: number; moves: Record<string, number> };
  type AsOfReport = { rows: AsOfRow[]; totals: Record<string, number> } | null;
  const [asOfReport, setAsOfReport] = useState<AsOfReport>(null);
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

  const norm = (s: string) => s.normalize("NFKD").toLowerCase();

  const namePool = useMemo(() => {
    const q = norm(qName.trim());
    return q ? items.filter((i) => norm(i.label).startsWith(q)) : items;
  }, [items, qName]);

  const codePool = useMemo(() => {
    const q = norm(qCode.trim());
    return q
      ? items.filter((i) => norm(i.code ?? "").startsWith(q))
      : items.filter((i) => (i.code ?? "") !== "");
  }, [items, qCode]);

  const nameSize = useMemo(() => Math.min(10, Math.max(6, namePool.length)), [namePool.length]);
  const codeSize = useMemo(() => Math.min(10, Math.max(6, codePool.length)), [codePool.length]);

  const onNameChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const ids = Array.from(e.currentTarget.selectedOptions).map((o) => o.value);
    setSelected((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const onCodeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const ids = Array.from(e.currentTarget.selectedOptions).map((o) => o.value);
    setSelected((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const remove = (id: string) => setSelected((prev) => prev.filter((x) => x !== id));

  const selectedItems = selected
    .map((id) => items.find((i) => i.id === id))
    .filter(Boolean) as Item[];
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const namePoolIds = new Set(namePool.map((i) => i.id));
  const codePoolIds = new Set(codePool.map((i) => i.id));

  const showNameDropdown = isNameOpen && namePool.length > 0;
  const showCodeDropdown = isCodeOpen && codePool.length > 0;

  return (
    <div className="w-full">
      <div className="grid gap-6 sm:grid-cols-2">
        <div
          onFocus={() => setIsNameOpen(true)}
          onBlur={(e) => {
            const rt = e.relatedTarget as Node | null;
            if (!rt || !e.currentTarget.contains(rt)) setIsNameOpen(false);
          }}
        >
          <label htmlFor="search-name" className="block text-sm font-medium text-gray-700">
            Search by name
          </label>
          <input
            id="search-name"
            type="text"
            value={qName}
            onChange={(e) => setQName(e.target.value)}
            placeholder="Type name..."
            className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-gray-400 focus:outline-none"
          />
          {showNameDropdown ? (
            <select
              aria-label="Results by name"
              multiple
              size={nameSize}
              className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-gray-400 focus:outline-none"
              value={selected.filter((id) => namePoolIds.has(id))}
              onChange={onNameChange}
            >
              {namePool.map((it) => {
                const isSel = selectedSet.has(it.id);
                return (
                  <option key={it.id} value={it.id}>
                    {`${it.label}${isSel ? " ●" : ""}`}
                  </option>
                );
              })}
            </select>
          ) : null}
        </div>
        <div
          onFocus={() => setIsCodeOpen(true)}
          onBlur={(e) => {
            const rt = e.relatedTarget as Node | null;
            if (!rt || !e.currentTarget.contains(rt)) setIsCodeOpen(false);
          }}
        >
          <label htmlFor="search-code" className="block text-sm font-medium text-gray-700">
            Search by barcode
          </label>
          <input
            id="search-code"
            type="text"
            value={qCode}
            onChange={(e) => setQCode(e.target.value)}
            placeholder="Type barcode..."
            className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-gray-400 focus:outline-none"
          />
          {showCodeDropdown ? (
            <select
              aria-label="Results by barcode"
              multiple
              size={codeSize}
              className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-gray-400 focus:outline-none"
              value={selected.filter((id) => codePoolIds.has(id))}
              onChange={onCodeChange}
            >
              {codePool.map((it) => {
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
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-gray-800">Selected products</h2>
        {selectedItems.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">No products selected</p>
        ) : (
          <ul className="mt-2 divide-y divide-gray-200 rounded-md border border-gray-200">
            {selectedItems.map((it) => (
              <li key={it.id} className="flex items-center justify-between px-4 py-2">
                <span className="truncate text-sm text-gray-900">
                  {it.label}
                  {it.category ? <span className="text-gray-500"> ({it.category})</span> : null}
                  {it.code ? <span className="text-gray-500"> — {it.code}</span> : null}
                </span>
                <button
                  type="button"
                  onClick={() => remove(it.id)}
                  className="ml-4 inline-flex items-center rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-6 grid gap-6 sm:grid-cols-4">
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
              if (selected.length === 0) throw new Error("Select at least one product");
              if (selectedWarehouses.length === 0) throw new Error("Select at least one warehouse");
              if (selectedMovements.length === 0) throw new Error("Select at least one movement type");
              const res = await fetch("/api/report", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  productIds: selected.map((v) => (Number(v) || v)),
                  warehouseIds: selectedWarehouses.map((v) => (Number(v) || v)),
                  movements: selectedMovements,
                  fromDate: fromDate || null,
                  toDate: toDate || null,
                }),
              });
              const json = await res.json();
              if (!res.ok) throw new Error(json.error || "Failed to create report");
              setReport({ rows: json.rows || [], totals: json.totals || {} });
            } catch (e: any) {
              setError(e?.message || "Something went wrong");
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
              if (selected.length === 0) throw new Error("Select at least one product");
              if (selectedWarehouses.length === 0) throw new Error("Select at least one warehouse");
              const res = await fetch("/api/report/as-of", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  productIds: selected.map((v) => (Number(v) || v)),
                  warehouseIds: selectedWarehouses.map((v) => (Number(v) || v)),
                  movements: MOVEMENT_ORDER,
                  fromDate: fromDate || null,
                  toDate: toDate || null,
                }),
              });
              const json = await res.json();
              if (!res.ok) throw new Error(json.error || "Failed to create as-of report");
              setAsOfReport({ rows: json.rows || [], totals: json.totals || {} });
            } catch (e: any) {
              setError(e?.message || "Something went wrong");
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
          {selectedItems.map((prod) => {
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
        </>
      )}
    </div>
  );
}
