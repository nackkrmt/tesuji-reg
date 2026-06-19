"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200 disabled:bg-slate-100";

export interface ComboOption {
  value: string;
  label: string;
}

/** A searchable single-select dropdown. Optionally lets the user create a new
 *  entry from the typed query (used by the institute picker). */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = "— เลือก —",
  searchPlaceholder = "ค้นหา…",
  emptyText = "ไม่พบรายการ",
  invalid,
  disabled,
  allowCreate = false,
  onCreate,
  createLabel,
}: {
  value: string | null;
  onChange: (value: string) => void;
  options: ComboOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  invalid?: boolean;
  disabled?: boolean;
  allowCreate?: boolean;
  /** Called with the trimmed query when the user taps "create". */
  onCreate?: (query: string) => void | Promise<void>;
  createLabel?: (query: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const hasExact = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q.length === 0 || options.some((o) => o.label.trim().toLowerCase() === q);
  }, [options, query]);

  const showCreate = allowCreate && !!onCreate && query.trim().length > 0 && !hasExact;

  // Close when clicking outside the control.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Reset + focus the search box each time the panel opens.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
  }

  async function create() {
    if (!onCreate) return;
    const q = query.trim();
    if (!q) return;
    setCreating(true);
    try {
      await onCreate(q);
      setOpen(false);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          control,
          "flex items-center justify-between gap-2 text-left",
          invalid && "border-rose-400 focus:border-rose-500 focus:ring-rose-200",
        )}
      >
        <span className={cn("truncate", !selected && "text-slate-400")}>
          {selected ? selected.label : placeholder}
        </span>
        <svg
          className="h-5 w-5 shrink-0 text-slate-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-white"
            />
          </div>
          <ul className="max-h-60 overflow-auto py-1">
            {filtered.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => pick(o.value)}
                  className={cn(
                    "flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm hover:bg-slate-50",
                    o.value === value ? "font-semibold text-brand-800" : "text-slate-700",
                  )}
                >
                  <span className="truncate">{o.label}</span>
                  {o.value === value && (
                    <svg className="h-4 w-4 shrink-0 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              </li>
            ))}
            {filtered.length === 0 && !showCreate && (
              <li className="px-3.5 py-3 text-sm text-slate-400">{emptyText}</li>
            )}
            {showCreate && (
              <li className="border-t border-slate-100">
                <button
                  type="button"
                  onClick={create}
                  disabled={creating}
                  className="flex w-full items-center gap-1.5 px-3.5 py-2.5 text-left text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                >
                  {creating
                    ? "กำลังเพิ่ม…"
                    : createLabel
                      ? createLabel(query.trim())
                      : `+ เพิ่ม “${query.trim()}”`}
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
