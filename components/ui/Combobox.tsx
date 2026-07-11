"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { DropdownPanel } from "./DropdownPanel";
import { invalidControl } from "./form";
import { useI18n } from "@/lib/i18n";

const control =
  "w-full rounded-2xl glass-input px-3.5 py-3 text-white outline-none disabled:opacity-50";

export interface ComboOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** Hidden search aliases — the option matches if the query hits the label
   *  OR any keyword (e.g. "ครูม่อน" surfacing "Buddy GO"). */
  keywords?: string[];
}

/** A single-select dropdown sharing the unified `.dropdown-panel` surface.
 *  Shows a search box for long lists; optionally lets the user create a new
 *  entry from the typed query (used by the institute picker).
 *
 *  Accessible as a listbox: the trigger (and search box) keep DOM focus while
 *  ArrowUp/Down/Home/End move `aria-activedescendant` through the options;
 *  Enter picks, Escape closes. */
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyText,
  invalid,
  disabled,
  searchable,
  compact = false,
  className,
  panelClassName,
  allowCreate = false,
  onCreate,
  createLabel,
  id,
  "aria-describedby": ariaDescribedBy,
}: {
  value: string | null;
  onChange: (value: string) => void;
  options: ComboOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  invalid?: boolean;
  disabled?: boolean;
  /** Show the search box. Defaults to true for long lists (> 6 options). */
  searchable?: boolean;
  /** Compact trigger (smaller padding, not full-width) — set width via className. */
  compact?: boolean;
  /** Extra classes for the trigger button (e.g. a fixed width). */
  className?: string;
  /** Extra classes for the floating panel (e.g. a fixed width in compact mode). */
  panelClassName?: string;
  allowCreate?: boolean;
  /** Called with the trimmed query when the user taps "create". */
  onCreate?: (query: string) => void | Promise<void>;
  createLabel?: (query: string) => string;
  /** Trigger id, so a <Field>/label can point at this control. */
  id?: string;
  "aria-describedby"?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reactId = useId();
  const listboxId = `${reactId}-listbox`;
  const optionId = (i: number) => `${reactId}-opt-${i}`;

  const placeholderText = placeholder ?? t.ui.select;
  const searchPlaceholderText = searchPlaceholder ?? t.ui.search;
  const emptyTextResolved = emptyText ?? t.ui.noItems;

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.keywords?.some((k) => k.toLowerCase().includes(q)),
    );
  }, [options, query]);

  const hasExact = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (
      q.length === 0 ||
      options.some(
        (o) =>
          o.label.trim().toLowerCase() === q ||
          o.keywords?.some((k) => k.trim().toLowerCase() === q),
      )
    );
  }, [options, query]);

  const showCreate = allowCreate && !!onCreate && query.trim().length > 0 && !hasExact;

  // Search box appears for long lists, or whenever creating a new entry is allowed.
  const showSearch = (searchable ?? options.length > 6) || allowCreate;

  // Reset the query each time the panel opens, and focus the search box — but
  // only on pointer devices. Auto-focusing on a touchscreen pops up the iOS
  // keyboard, which shrinks the visual viewport and shifts our position:fixed
  // panel out from under the user's finger, so taps land on the wrong row.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    const isTouch =
      typeof window !== "undefined" &&
      window.matchMedia?.("(pointer: coarse)").matches;
    if (isTouch) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  // Start keyboard navigation on the selected option (or the first enabled
  // one); re-anchor whenever the filtered list changes while typing.
  useEffect(() => {
    if (!open) {
      setActiveIndex(-1);
      return;
    }
    const selIdx = filtered.findIndex((o) => o.value === value && !o.disabled);
    setActiveIndex(selIdx >= 0 ? selIdx : filtered.findIndex((o) => !o.disabled));
  }, [open, filtered, value]);

  // Keep the active option visible while arrowing through a long list.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    document
      .getElementById(optionId(activeIndex))
      ?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIndex]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
    triggerRef.current?.focus();
  }

  async function create() {
    if (!onCreate) return;
    const q = query.trim();
    if (!q) return;
    setCreating(true);
    try {
      await onCreate(q);
      setOpen(false);
      triggerRef.current?.focus();
    } finally {
      setCreating(false);
    }
  }

  function moveActive(delta: number) {
    if (filtered.length === 0) return;
    let i = activeIndex;
    for (let step = 0; step < filtered.length; step++) {
      i = (i + delta + filtered.length) % filtered.length;
      if (!filtered[i].disabled) {
        setActiveIndex(i);
        return;
      }
    }
  }

  function edgeActive(last: boolean) {
    const idx = last
      ? filtered.length - 1 - [...filtered].reverse().findIndex((o) => !o.disabled)
      : filtered.findIndex((o) => !o.disabled);
    if (idx >= 0 && idx < filtered.length) setActiveIndex(idx);
  }

  /** Shared keyboard handling for the trigger and the search box. */
  function onKeyNav(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveActive(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveActive(-1);
        break;
      case "Home":
        e.preventDefault();
        edgeActive(false);
        break;
      case "End":
        e.preventDefault();
        edgeActive(true);
        break;
      case "Enter": {
        e.preventDefault();
        const o = filtered[activeIndex];
        if (o && !o.disabled) pick(o.value);
        else if (showCreate) void create();
        break;
      }
      case "Escape":
        setOpen(false);
        triggerRef.current?.focus();
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  const activeDescendant =
    open && activeIndex >= 0 ? optionId(activeIndex) : undefined;

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyNav}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={activeDescendant}
        aria-invalid={invalid || undefined}
        aria-describedby={ariaDescribedBy}
        className={cn(
          compact
            ? "rounded-lg glass-input px-2 py-2.5 text-sm text-white outline-none disabled:opacity-50"
            : control,
          "flex items-center justify-between gap-1.5 text-left",
          invalid && invalidControl,
          className,
        )}
      >
        <span className={cn("truncate", !selected && "text-white/35")}>
          {selected ? selected.label : placeholderText}
        </span>
        <svg
          className={cn(compact ? "h-4 w-4" : "h-5 w-5", "shrink-0 text-white/40")}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <DropdownPanel
        anchorRef={triggerRef}
        open={open}
        onClose={() => setOpen(false)}
        matchWidth={!compact}
        className={panelClassName}
      >
        {showSearch && (
          <div className="border-b border-white/10 p-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyNav}
              placeholder={searchPlaceholderText}
              role="combobox"
              aria-expanded={open}
              aria-controls={listboxId}
              aria-activedescendant={activeDescendant}
              aria-autocomplete="list"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none focus:border-brand-400/70 focus:bg-white/10"
            />
          </div>
        )}
        <ul
          id={listboxId}
          role="listbox"
          className="max-h-60 overflow-auto overscroll-contain py-1"
        >
            {filtered.map((o, i) => (
              <li
                key={o.value}
                id={optionId(i)}
                role="option"
                aria-selected={o.value === value}
                aria-disabled={o.disabled || undefined}
                onClick={() => !o.disabled && pick(o.value)}
                onMouseEnter={() => !o.disabled && setActiveIndex(i)}
                className={cn(
                  "flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm transition",
                  o.disabled
                    ? "cursor-not-allowed text-white/25"
                    : cn(
                        "cursor-pointer",
                        o.value === value
                          ? "font-semibold text-brand-300"
                          : "text-white/80",
                        i === activeIndex && "bg-white/10",
                      ),
                )}
              >
                <span className="truncate">{o.label}</span>
                {o.value === value && (
                  <svg className="h-4 w-4 shrink-0 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </li>
            ))}
            {filtered.length === 0 && !showCreate && (
              <li role="presentation" className="px-3.5 py-3 text-sm text-white/40">
                {emptyTextResolved}
              </li>
            )}
            {showCreate && (
              <li role="presentation" className="border-t border-white/10">
                <button
                  type="button"
                  onClick={create}
                  disabled={creating}
                  className="flex w-full items-center gap-1.5 px-3.5 py-2.5 text-left text-sm font-semibold text-brand-300 transition hover:bg-brand-500/10 disabled:opacity-50"
                >
                  {creating
                    ? t.ui.adding
                    : createLabel
                      ? createLabel(query.trim())
                      : t.ui.addItem(query.trim())}
                </button>
              </li>
            )}
        </ul>
      </DropdownPanel>
    </>
  );
}
