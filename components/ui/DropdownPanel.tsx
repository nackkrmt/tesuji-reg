"use client";

import {
  CSSProperties,
  ReactNode,
  RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useEscapeLayer } from "./escapeLayer";

// useLayoutEffect warns during SSR; fall back to useEffect on the server.
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DropdownPanelProps {
  /** The trigger the panel is anchored to. */
  anchorRef: RefObject<HTMLElement>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Which edge to align with the anchor (default "left"). */
  align?: "left" | "right";
  /** Match the anchor's width (default true). */
  matchWidth?: boolean;
  /**
   * Move focus into the panel on open and drive ArrowUp/Down over its items
   * (default true). Turn it OFF for a panel whose trigger keeps DOM focus and
   * announces the active row itself via aria-activedescendant — Combobox does,
   * and its search box must not be focused on touch (see Combobox).
   */
  manageFocus?: boolean;
  className?: string;
}

/**
 * A floating panel portaled to <body>. Because it lives at the document root it
 * always paints above the bottom dock (z-50) and escapes any backdrop-filter
 * card stacking context. The shared look comes from the `.dropdown-panel` class.
 */
export function DropdownPanel({
  anchorRef,
  open,
  onClose,
  children,
  align = "left",
  matchWidth = true,
  manageFocus = true,
  className,
}: DropdownPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });

  // Position the panel under (or above, if it would overflow) the anchor.
  useIsoLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      const gap = 8;
      const margin = 8;
      const ph = panelRef.current?.offsetHeight ?? 0;
      const openUp =
        r.bottom + gap + ph > window.innerHeight - margin &&
        r.top - gap - ph > margin;
      const next: CSSProperties = {
        top: openUp ? Math.max(margin, r.top - gap - ph) : r.bottom + gap,
        visibility: "visible",
      };
      if (align === "right") {
        next.right = Math.max(margin, window.innerWidth - (r.left + r.width));
      } else {
        // keep a left-aligned panel from spilling off the right edge
        const pw = panelRef.current?.offsetWidth ?? r.width;
        const maxLeft = window.innerWidth - margin - pw;
        next.left = Math.max(margin, Math.min(r.left, maxLeft));
      }
      if (matchWidth) next.width = r.width;
      setStyle(next);
    };
    place();
    // capture:true so scrolling inside any ancestor (e.g. a Sheet) repositions it
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    // Re-align when the *visual* viewport changes — the iOS soft keyboard opening
    // or the Safari address bar collapsing shifts what the user sees under a
    // position:fixed panel without firing a normal resize/scroll event.
    const vv = window.visualViewport;
    vv?.addEventListener("resize", place);
    vv?.addEventListener("scroll", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      vv?.removeEventListener("resize", place);
      vv?.removeEventListener("scroll", place);
    };
  }, [open, align, matchWidth, anchorRef]);

  // Escape belongs to the innermost open overlay: a panel opened inside a Sheet
  // must swallow it, or the sheet unmounts under the user (and its form with it).
  useEscapeLayer(open, onClose);

  // Close on outside click.
  useEffect(() => {
    if (!open) {
      setStyle({ visibility: "hidden" });
      return;
    }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, onClose, anchorRef]);

  // Focus management. Keyed on `open` alone — same reason as Sheet's: callers
  // pass an inline onClose, and re-running this would yank focus back to the
  // first row while the user is arrowing through the list.
  useEffect(() => {
    if (!open || !manageFocus) return;
    const panel = panelRef.current;
    if (!panel) return;
    // The trigger outlives the panel, so it is safe to capture for the cleanup.
    const anchor = anchorRef.current;
    // The panel's first control, not the panel itself: unlike a Sheet these
    // menus hold links and buttons only, so taking focus can't pop the iOS
    // keyboard. The one panel that does own a text field (Combobox) opts out.
    const first = panel.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => {
      // Only reclaim focus when it fell to <body> because the element holding
      // it was unmounted with the panel. After Tab or a click elsewhere focus
      // has already moved on deliberately — stealing it back would fight the
      // user.
      if (document.activeElement === document.body) anchor?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, manageFocus]);

  /** Roving focus over the panel's controls (menus have no tab stops inside). */
  function onPanelKeyDown(e: React.KeyboardEvent) {
    if (!manageFocus) return;
    const panel = panelRef.current;
    if (!panel) return;
    if (e.key === "Tab") {
      // A menu is not a tab stop container: Tab dismisses it and moves on from
      // the trigger (no preventDefault — the browser resolves the next stop
      // after this handler, from the anchor we just focused).
      onClose();
      anchorRef.current?.focus();
      return;
    }
    const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        items[i < 0 ? 0 : (i + 1) % items.length].focus();
        break;
      case "ArrowUp":
        e.preventDefault();
        items[i <= 0 ? items.length - 1 : i - 1].focus();
        break;
      case "Home":
        e.preventDefault();
        items[0].focus();
        break;
      case "End":
        e.preventDefault();
        items[items.length - 1].focus();
        break;
    }
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      style={style}
      onKeyDown={onPanelKeyDown}
      className={cn("dropdown-panel", className)}
    >
      {children}
    </div>,
    document.body,
  );
}
