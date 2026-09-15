"use client";

import { useRef, useState } from "react";
import { DropdownPanel } from "@/components/ui/DropdownPanel";
import {
  LOCALES,
  LOCALE_LABELS,
  LOCALE_SHORT,
  useI18n,
  type Locale,
} from "@/lib/i18n";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t.header.language}
        // A menu, not a listbox: the rows are buttons that act, and the panel
        // now takes focus and roves with the arrow keys (see DropdownPanel).
        aria-haspopup="menu"
        aria-expanded={open}
        // h-11 to match the header back arrow / the 44px floor the rest of the
        // system holds to.
        className="focus-ring press flex h-11 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-2.5 text-white/80 transition hover:bg-white/10"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18" />
        </svg>
        <span className="text-xs font-semibold">{LOCALE_SHORT[locale]}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`transition ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <DropdownPanel
        anchorRef={btnRef}
        open={open}
        onClose={() => setOpen(false)}
        align="right"
        matchWidth={false}
        className="w-40 py-1"
      >
        {/* menu > none > menuitemradio: the old listbox wrapped each option
            around a <button>, so screen readers announced interactive content
            nested inside a selectable option. */}
        <ul role="menu" aria-label={t.header.language}>
          {LOCALES.map((code: Locale) => {
            const active = code === locale;
            return (
              <li key={code} role="none">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => {
                    setLocale(code);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm font-medium transition hover:bg-white/10 ${
                    active ? "text-brand-300" : "text-white/85"
                  }`}
                >
                  <span>{LOCALE_LABELS[code]}</span>
                  {active && (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </DropdownPanel>
    </>
  );
}
