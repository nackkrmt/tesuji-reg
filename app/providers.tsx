"use client";

import { ReactNode } from "react";
import { AppStoreProvider } from "@/lib/data/store";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ToastProvider } from "@/components/ui/Toast";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <AppStoreProvider>
      <AuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </AppStoreProvider>
  );
}
