"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export interface ReservationInfo {
  batchId: string;
  holdId: string;
  expiresAt: string;
  totalAmountThb: number;
  referenceCode: string;
  tournamentId: string;
}

/** A person chosen for this registration. Person data lives server-side in
 *  profile / managed_player; here we only keep the reference + chosen rุ่น. */
export interface SelectedParticipant {
  source: "self" | "player";
  playerId?: string; // when source === 'player'
  categoryId: string; // assigned in Step B
}

export interface RegisterDraft {
  participants: SelectedParticipant[];
  reservation: ReservationInfo | null;
  slipDataUrl: string | null;
}

const DRAFT_KEY = "tesuji.register.draft";
export const SUCCESS_KEY = "tesuji.register.success";

function initialDraft(): RegisterDraft {
  return { participants: [], reservation: null, slipDataUrl: null };
}

function loadDraft(): RegisterDraft {
  if (typeof window === "undefined") return initialDraft();
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return initialDraft();
    return { ...initialDraft(), ...(JSON.parse(raw) as Partial<RegisterDraft>) };
  } catch {
    return initialDraft();
  }
}

interface FlowCtx {
  draft: RegisterDraft;
  setParticipants: (p: SelectedParticipant[]) => void;
  setReservation: (r: ReservationInfo | null) => void;
  setSlip: (dataUrl: string | null) => void;
  reset: () => void;
  complete: (referenceCode: string) => void;
}

const Ctx = createContext<FlowCtx | null>(null);

export function RegisterFlowProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<RegisterDraft>(initialDraft);
  const hydrated = useRef(false);

  useEffect(() => {
    setDraft(loadDraft());
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* ignore quota */
    }
  }, [draft]);

  const setParticipants = useCallback(
    (participants: SelectedParticipant[]) =>
      setDraft((d) => ({ ...d, participants })),
    [],
  );
  const setReservation = useCallback(
    (reservation: ReservationInfo | null) =>
      setDraft((d) => ({ ...d, reservation })),
    [],
  );
  const setSlip = useCallback(
    (slipDataUrl: string | null) => setDraft((d) => ({ ...d, slipDataUrl })),
    [],
  );
  const reset = useCallback(() => {
    setDraft(initialDraft());
    if (typeof window !== "undefined")
      window.sessionStorage.removeItem(DRAFT_KEY);
  }, []);
  const complete = useCallback(
    (referenceCode: string) => {
      if (typeof window !== "undefined")
        window.sessionStorage.setItem(
          SUCCESS_KEY,
          JSON.stringify({ referenceCode }),
        );
      reset();
    },
    [reset],
  );

  return (
    <Ctx.Provider
      value={{ draft, setParticipants, setReservation, setSlip, reset, complete }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useRegisterFlow(): FlowCtx {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error("useRegisterFlow must be used within RegisterFlowProvider");
  return ctx;
}
