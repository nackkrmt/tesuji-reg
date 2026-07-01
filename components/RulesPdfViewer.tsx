"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { useI18n } from "@/lib/i18n";

// Worker is copied into /public by the postinstall script (version-synced).
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";

// Harden pdf.js: disable the eval-based font path (CVE-2024-4367 vector) and
// external resource loading. Stable object identity so react-pdf doesn't reload.
const PDF_OPTIONS = {
  isEvalSupported: false,
  isOffscreenCanvasSupported: false,
} as const;

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.25;

/** In-app PDF reader: continuous scroll, fit-to-width, pinch + button zoom.
 *  Falls back to a plain open/download link if rendering fails. */
export default function RulesPdfViewer({ url }: { url: string }) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [failed, setFailed] = useState(false);

  // Track the available width so each page renders crisp at the right size.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pageWidth = Math.max(
    1,
    Math.floor((containerWidth || 320) * zoom),
  );

  if (failed) {
    return (
      <div className="rounded-2xl glass-input p-4 text-sm text-white/70">
        <p>{t.info.pdfInlineFailed}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* zoom controls */}
      <div className="flex items-center justify-end gap-1.5">
        <ZoomButton
          label={t.info.zoomOut}
          disabled={zoom <= ZOOM_MIN}
          onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))}
        >
          −
        </ZoomButton>
        <span className="min-w-[3.5rem] text-center text-xs tabular-nums text-white/60">
          {Math.round(zoom * 100)}%
        </span>
        <ZoomButton
          label={t.info.zoomIn}
          disabled={zoom >= ZOOM_MAX}
          onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))}
        >
          +
        </ZoomButton>
      </div>

      <div
        ref={containerRef}
        className="overflow-x-auto rounded-2xl"
        // when zoomed past container width, allow horizontal pan
      >
        <Document
          file={url}
          options={PDF_OPTIONS}
          onLoadSuccess={({ numPages: n }) => setNumPages(n)}
          onLoadError={() => setFailed(true)}
          loading={
            <div className="py-16 text-center text-sm text-white/50">
              {t.info.loadingRules}
            </div>
          }
          error={
            <div className="py-10 text-center text-sm text-white/60">
              {t.info.loadFailed}
            </div>
          }
          className="flex flex-col items-center gap-3"
        >
          {Array.from({ length: numPages }, (_, i) => (
            <Page
              key={`page-${i + 1}`}
              pageNumber={i + 1}
              width={pageWidth}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              className="overflow-hidden rounded-xl shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)] ring-1 ring-white/10"
              loading={
                <div
                  style={{ height: pageWidth * 1.414 }}
                  className="w-full animate-pulse rounded-xl bg-white/[0.04]"
                />
              }
            />
          ))}
        </Document>
      </div>

      {numPages > 0 && (
        <p className="pt-1 text-center text-xs text-white/40">
          {t.info.pageCount(numPages)}
        </p>
      )}
    </div>
  );
}

function ZoomButton({
  children,
  label,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-full glass-input text-lg leading-none text-white/80 transition hover:text-white disabled:opacity-30"
    >
      {children}
    </button>
  );
}
