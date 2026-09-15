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
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/lib/i18n";

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

const DRAFT_PREFIX = "tesuji.register.draft";
export const SUCCESS_KEY = "tesuji.register.success";

/** Per (account, tournament). The account half matters: the draft holds the
 *  payment-slip IMAGE as a data URL, and keyed by tournament alone it outlived
 *  sign-out — the next person to log in on a shared family iPad or a coach's
 *  laptop reached the payment step with the previous account's bank slip
 *  already attached and the submit button enabled. */
function draftKey(userId: string, tournamentId: string): string {
  return `${DRAFT_PREFIX}.${userId}.${tournamentId}`;
}

/** Drop every register draft (and the success handoff) from this device.
 *  Called on sign-out: keying by account closes the leak, but a slip image
 *  belonging to someone who has left should not sit in the browser either. */
export function clearRegisterDrafts(): void {
  if (typeof window === "undefined") return;
  try {
    for (const store of [window.localStorage, window.sessionStorage]) {
      const doomed: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key && key.startsWith("tesuji.register.")) doomed.push(key);
      }
      doomed.forEach((key) => store.removeItem(key));
    }
  } catch {
    /* storage unavailable (private mode / quota) — nothing to clear */
  }
}

function initialDraft(): RegisterDraft {
  return { participants: [], reservation: null, slipDataUrl: null };
}

function loadDraft(userId: string, tournamentId: string): RegisterDraft {
  if (typeof window === "undefined") return initialDraft();
  try {
    // localStorage (not sessionStorage): the LINE/Android webview kills the
    // page during the photo-picker round-trip and sessionStorage rarely
    // survives that.
    const raw = window.localStorage.getItem(draftKey(userId, tournamentId));
    // Drafts written before the key carried the account are deleted, not
    // adopted: nothing records whose they were, and adopting one is the leak
    // itself. The cost is bounded — a draft is at most a 15-minute hold, and
    // the batch behind it is still resumable from /my-registrations ("ชำระเงิน
    // / ดู QR"), which is where a lost mid-flow user is sent anyway.
    for (const key of [DRAFT_PREFIX, `${DRAFT_PREFIX}.${tournamentId}`]) {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
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
  userId,
  children,
}: {
  tournamentId: string;
  /** Whose draft this is. Null until auth resolves (and while signed out), and
   *  the id is passed in rather than read from useAuth() so this module stays
   *  importable by AuthProvider (which clears drafts on sign-out) without the
   *  two forming an import cycle. */
  userId: string | null;
  children: ReactNode;
}) {
  const toast = useToast();
  const { t } = useI18n();
  const [draft, setDraft] = useState<RegisterDraft>(initialDraft);
  // The id the in-memory draft was loaded for. Nothing is read or written
  // until auth resolves, and a change of account starts from empty rather
  // than carrying the previous person's participants and slip forward.
  const hydratedFor = useRef<string | null>(null);
  const quotaWarned = useRef(false);

  useEffect(() => {
    if (!userId) {
      setDraft(initialDraft());
      hydratedFor.current = null;
      return;
    }
    setDraft(loadDraft(userId, tournamentId));
    hydratedFor.current = userId;
  }, [userId, tournamentId]);

  useEffect(() => {
    if (!userId || hydratedFor.current !== userId) return;
    try {
      window.localStorage.setItem(
        draftKey(userId, tournamentId),
        JSON.stringify(draft),
      );
    } catch {
      // Quota — a ~5 MB slip data URL is what fills it. The write is
      // best-effort, but silence here is what turned the LINE webview killing
      // the page into a vanished slip with no explanation, so say it once.
      if (!quotaWarned.current && draft.slipDataUrl) {
        quotaWarned.current = true;
        toast.show(t.register.draftPersistFailed, "info");
      }
    }
  }, [draft, tournamentId, userId, toast, t]);

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
    if (typeof window !== "undefined" && userId) {
      window.localStorage.removeItem(draftKey(userId, tournamentId));
    }
  }, [tournamentId, userId]);
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
