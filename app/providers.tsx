"use client";

import { ReactNode } from "react";
import { AppStoreProvider } from "@/lib/data/store";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { GlassDock } from "@/components/GlassDock";
import { I18nProvider, type Locale } from "@/lib/i18n";

export default function Providers({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale: Locale;
}) {
  return (
    <I18nProvider initialLocale={initialLocale}>
      <AppStoreProvider>
        <AuthProvider>
          <ToastProvider>
            {children}
            <GlassDock />
          </ToastProvider>
        </AuthProvider>
      </AppStoreProvider>
    </I18nProvider>
  );
}
