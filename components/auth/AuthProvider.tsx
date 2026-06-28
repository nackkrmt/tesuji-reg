"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useDataLayer } from "@/lib/data/store";
import { AuthUser } from "@/lib/data/types";

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
  ) => Promise<{ needsEmailConfirm: boolean }>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const dl = useDataLayer();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    dl.getCurrentUser()
      .then((u) => {
        if (active) {
          setUser(u);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    const unsub = dl.onAuthChange((u) => setUser(u));
    return () => {
      active = false;
      unsub();
    };
  }, [dl]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const u = await dl.signIn(email, password);
      setUser(u);
    },
    [dl],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      const r = await dl.signUp(email, password);
      if (r.user) setUser(r.user);
      return { needsEmailConfirm: r.needsEmailConfirm };
    },
    [dl],
  );

  const signOut = useCallback(async () => {
    await dl.signOut();
    setUser(null);
  }, [dl]);

  const requestPasswordReset = useCallback(
    (email: string) => dl.requestPasswordReset(email),
    [dl],
  );

  const updatePassword = useCallback(
    (newPassword: string) => dl.updatePassword(newPassword),
    [dl],
  );

  return (
    <Ctx.Provider
      value={{
        user,
        loading,
        signIn,
        signUp,
        signOut,
        requestPasswordReset,
        updatePassword,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
