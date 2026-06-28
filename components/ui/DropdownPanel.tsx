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

// useLayoutEffect warns during SSR; fall back to useEffect on the server.
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

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
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, align, matchWidth, anchorRef]);

  // Close on outside click / Escape.
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div ref={panelRef} style={style} className={cn("dropdown-panel", className)}>
      {children}
    </div>,
    document.body,
  );
}
