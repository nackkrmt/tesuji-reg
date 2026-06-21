"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-2xl glass-input px-3.5 py-3 text-white outline-none disabled:opacity-50";

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
          invalid && "border-rose-400/70 focus:shadow-[0_0_0_3px_rgba(244,63,94,0.3)]",
        )}
      >
        <span className={cn("truncate", !selected && "text-white/35")}>
          {selected ? selected.label : placeholder}
        </span>
        <svg
          className="h-5 w-5 shrink-0 text-white/40"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="glass-strong absolute z-40 mt-2 w-full overflow-hidden rounded-2xl animate-scale-in">
          <div className="border-b border-white/10 p-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none focus:border-brand-400/70 focus:bg-white/10"
            />
          </div>
          <ul className="max-h-60 overflow-auto py-1">
            {filtered.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => pick(o.value)}
                  className={cn(
                    "flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm transition hover:bg-white/10",
                    o.value === value ? "font-semibold text-brand-300" : "text-white/80",
                  )}
                >
                  <span className="truncate">{o.label}</span>
                  {o.value === value && (
                    <svg className="h-4 w-4 shrink-0 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              </li>
            ))}
            {filtered.length === 0 && !showCreate && (
              <li className="px-3.5 py-3 text-sm text-white/40">{emptyText}</li>
            )}
            {showCreate && (
              <li className="border-t border-white/10">
                <button
                  type="button"
                  onClick={create}
                  disabled={creating}
                  className="flex w-full items-center gap-1.5 px-3.5 py-2.5 text-left text-sm font-semibold text-brand-300 transition hover:bg-brand-500/10 disabled:opacity-50"
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
