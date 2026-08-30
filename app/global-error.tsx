"use client";

import { useEffect } from "react";

/** Last-resort boundary: a throw in the root layout itself replaces it, so this
 *  file renders without Providers (no i18n, no dictionary) and without the
 *  layout's stylesheet. Hence the inline styles and the fixed bilingual copy —
 *  it cannot read the locale cookie the rest of the app follows. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="th">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#060912",
          color: "#e8eaf2",
          fontFamily:
            "'Noto Sans Thai', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: "26rem", textAlign: "center" }}>
          <p style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 8px" }}>
            เกิดข้อผิดพลาด
          </p>
          <p
            style={{
              fontSize: "0.9rem",
              lineHeight: 1.7,
              color: "rgba(232,234,242,0.6)",
              margin: "0 0 20px",
            }}
          >
            ระบบทำงานผิดพลาดชั่วคราว กรุณาลองใหม่อีกครั้ง
            <br />
            <span style={{ fontSize: "0.82rem" }}>
              Something went wrong. Please try again.
            </span>
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              appearance: "none",
              border: "none",
              borderRadius: "0.75rem",
              background: "#2f6bff",
              color: "#fff",
              fontSize: "0.9rem",
              fontWeight: 600,
              padding: "0.7rem 1.4rem",
              cursor: "pointer",
            }}
          >
            ลองใหม่ · Try again
          </button>
        </div>
      </body>
    </html>
  );
}
