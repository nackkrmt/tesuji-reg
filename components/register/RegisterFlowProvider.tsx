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
 *  profile / managed_player; here we only keep the reference + chosen รุ่น.
 *  A person may enter up to 2 รุ่น (e.g. 9x9 + 13x13), assigned in Step B. */
export interface SelectedParticipant {
  source: "self" | "player";
  playerId?: string; // when source === 'player'
  categoryIds: string[]; // assigned in Step B (1–2 รุ่น)
}

export interface RegisterDraft {
  participants: SelectedParticipant[];
  reservation: ReservationInfo | null;
  slipDataUrl: string | null;
}

const LEGACY_DRAFT_KEY = "tesuji.register.draft";
export const SUCCESS_KEY = "tesuji.register.success";

function draftKey(tournamentId: string): string {
  return `${LEGACY_DRAFT_KEY}.${tournamentId}`;
}

function initialDraft(): RegisterDraft {
  return { participants: [], reservation: null, slipDataUrl: null };
}

function loadDraft(tournamentId: string): RegisterDraft {
  if (typeof window === "undefined") return initialDraft();
  try {
    // localStorage (not sessionStorage): the LINE/Android webview kills the
    // page during the photo-picker round-trip and sessionStorage rarely
    // survives that. The sessionStorage read is a legacy fallback for users
    // who were mid-flow when this changed.
    let raw = window.localStorage.getItem(draftKey(tournamentId));
    if (!raw) {
      // One-time migration from the pre-multi-tournament global key: adopt it
      // only when it isn't tied to a different tournament's reservation.
      const legacy =
        window.localStorage.getItem(LEGACY_DRAFT_KEY) ??
        window.sessionStorage.getItem(LEGACY_DRAFT_KEY);
      if (legacy) {
        const parsedLegacy = JSON.parse(legacy) as Partial<RegisterDraft>;
        if (
          !parsedLegacy.reservation ||
          parsedLegacy.reservation.tournamentId === tournamentId
        ) {
          raw = legacy;
        }
        window.localStorage.removeItem(LEGACY_DRAFT_KEY);
        window.sessionStorage.removeItem(LEGACY_DRAFT_KEY);
      }
    }
    if (!raw) return initialDraft();
    const parsed = JSON.parse(raw) as Partial<RegisterDraft>;
    // migrate the legacy single-categoryId shape → categoryIds[]
    const rawParts = (parsed.participants ?? []) as Array<{
      source: "self" | "player";
      playerId?: string;
      categoryIds?: string[];
      categoryId?: string;
    }>;
    const participants: SelectedParticipant[] = rawParts.map((p) => ({
      source: p.source,
      playerId: p.playerId,
      categoryIds: p.categoryIds ?? (p.categoryId ? [p.categoryId] : []),
    }));
    return { ...initialDraft(), ...parsed, participants };
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
  complete: (referenceCode: string, batchId: string) => void;
}

const Ctx = createContext<FlowCtx | null>(null);

export function RegisterFlowProvider({
  tournamentId,
  children,
}: {
  tournamentId: string;
  children: ReactNode;
}) {
  const [draft, setDraft] = useState<RegisterDraft>(initialDraft);
  const hydrated = useRef(false);

  useEffect(() => {
    setDraft(loadDraft(tournamentId));
    hydrated.current = true;
  }, [tournamentId]);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(draftKey(tournamentId), JSON.stringify(draft));
    } catch {
      /* ignore quota */
    }
  }, [draft, tournamentId]);

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
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(draftKey(tournamentId));
      window.localStorage.removeItem(LEGACY_DRAFT_KEY); // legacy locations
      window.sessionStorage.removeItem(LEGACY_DRAFT_KEY);
    }
  }, [tournamentId]);
  const complete = useCallback(
    (referenceCode: string, batchId: string) => {
      if (typeof window !== "undefined")
        window.sessionStorage.setItem(
          SUCCESS_KEY,
          JSON.stringify({ referenceCode, batchId }),
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
