"use client";

import { useEffect, useRef } from "react";

/** Every open overlay, innermost last. */
const layers: symbol[] = [];

/**
 * Escape handling for one overlay layer.
 *
 * Each overlay used to own a document-level keydown listener, so a single
 * Escape ran all of them in the same tick: closing the province dropdown inside
 * the "add a player" sheet also unmounted the sheet and threw away everything
 * typed. Layers are pushed in mount order — a panel opened inside a sheet is
 * pushed after the sheet — so the last entry is the innermost overlay and the
 * only one that reacts.
 */
export function useEscapeLayer(open: boolean, onEscape: () => void) {
  // Callers pass an inline onClose. Keeping it in a ref (deps: [open] alone)
  // means the layer is pushed once per open instead of being popped and
  // re-pushed onto the TOP of the stack on every parent render — which would
  // hand Escape back to the outer sheet the moment the user typed in the
  // dropdown's search box.
  const handler = useRef(onEscape);
  handler.current = onEscape;

  useEffect(() => {
    if (!open) return;
    const layer = Symbol("overlay");
    layers.push(layer);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (layers[layers.length - 1] !== layer) return;
      handler.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const i = layers.indexOf(layer);
      if (i !== -1) layers.splice(i, 1);
    };
  }, [open]);
}
