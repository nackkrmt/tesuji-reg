"use client";

import { ReactNode } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";

/**
 * Design-system confirmation dialog — a thin wrapper over `Sheet` that replaces
 * the native `window.confirm()` calls scattered across the admin. Bottom sheet
 * on mobile, centered dialog on desktop (inherited from Sheet), and it portals
 * to <body>, so it is safe to mount from inside a list/table row.
 *
 * Pattern mirrors the revoke-confirm in JudgeManager: cancel (secondary) +
 * a tone-coloured confirm (danger/primary) that shows the busy spinner via
 * `loading`. Pass extra context (bullets, warnings) as `children`.
 */
export function ConfirmSheet({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "ยืนยัน",
  cancelLabel = "ยกเลิก",
  tone = "danger",
  loading = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <Sheet
      open={open}
      onClose={() => {
        if (!loading) onClose();
      }}
      title={title}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "primary" ? "primary" : "danger"}
            fullWidth
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {description && (
          <p className="text-sm leading-relaxed text-white/60">{description}</p>
        )}
        {children}
      </div>
    </Sheet>
  );
}
