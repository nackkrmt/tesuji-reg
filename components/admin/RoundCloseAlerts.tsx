"use client";

// /admin/live — tells whoever runs MacMahon that a judge has closed a round
// ("ปิดรอบ", lib/live/roundClose.ts), so they no longer walk the venue to find
// out. That person is usually looking at MacMahon, not at this page, so the
// alert does not rely on the page being in view: a desktop notification (once
// the browser allows it) and a short chime, on top of the banner here.
//
// live_config is not in the realtime publication, so closures are polled. The
// poll keeps running while the tab is hidden — hidden is the normal state for
// this tab on competition day. Browsers may slow a long-hidden tab's timers to
// about once a minute; the notification can then lag by up to that much.

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { listRoundClosures } from "@/lib/live/client";
import { roundsOf } from "@/lib/live/types";
import { tablesChangedSinceClose, type RoundClosure } from "@/lib/live/roundClose";
import type { LiveDivision, LiveMatch } from "@/lib/live/types";

const POLL_MS = 5000;
const ACK_KEY = "tesuji_round_close_ack";
const ALERT_PREF_KEY = "tesuji_round_close_alerts";

function lsGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode / storage blocked — the ack just won't survive a reload */
  }
}

function closureKey(divisionId: string, c: RoundClosure): string {
  return `${divisionId}|${c.round}|${c.at}`;
}

function timeOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

function tableList(tables: string[]): string {
  return tables.map((t) => `โต๊ะ ${t}`).join(", ");
}

/** One tournament's round closures, polled every few seconds. */
export function useRoundClosures(tournamentId: string | null) {
  const [closures, setClosures] = useState<Record<string, RoundClosure>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setClosures({});
    setLoaded(false);
    setError(false);
    if (!tournamentId) return;
    let active = true;
    const load = async () => {
      try {
        const c = await listRoundClosures(tournamentId);
        if (!active) return;
        setClosures(c);
        setLoaded(true);
        setError(false);
      } catch {
        if (active) setError(true);
      }
    };
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tournamentId]);

  return { closures, loaded, error };
}

export interface ClosureView {
  division: LiveDivision;
  closure: RoundClosure;
  key: string;
  /** The closed round is still the division's latest one on the board. */
  isCurrent: boolean;
  /** Tables whose result differs from what it was at close time. */
  changed: string[];
}

/** Closures joined with the board: which are still about the current round,
 *  and which tables changed since. */
export function closureViews(
  divisions: LiveDivision[],
  matches: LiveMatch[],
  closures: Record<string, RoundClosure>,
): ClosureView[] {
  const out: ClosureView[] = [];
  for (const division of divisions) {
    const closure = closures[division.id];
    if (!closure) continue;
    const divMatches = matches.filter((m) => m.divisionId === division.id);
    const current = roundsOf(divMatches)[0] ?? null;
    const isCurrent = current === closure.round;
    const changed = isCurrent
      ? tablesChangedSinceClose(
          closure,
          divMatches.filter((m) => m.round === closure.round),
        )
      : [];
    out.push({ division, closure, key: closureKey(division.id, closure), isCurrent, changed });
  }
  return out;
}

// ── chime ────────────────────────────────────────────────────────────────────
// Web Audio, so there is no sound file to ship. A browser only lets a page make
// sound after the person has interacted with it; the "เปิดการแจ้งเตือน" click
// is that interaction, and a later click anywhere on the page re-arms it after
// a reload.
let audioCtx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      audioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

function chime() {
  const ctx = audio();
  if (!ctx) return;
  void ctx.resume().catch(() => {});
  const now = ctx.currentTime;
  [
    { at: 0, hz: 784 },
    { at: 0.2, hz: 1046.5 },
  ].forEach(({ at, hz }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = hz;
    gain.gain.setValueAtTime(0.0001, now + at);
    gain.gain.exponentialRampToValueAtTime(0.3, now + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.45);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + at);
    osc.stop(now + at + 0.5);
  });
}

function notificationPermission(): NotificationPermission | "unsupported" {
  return typeof window !== "undefined" && "Notification" in window
    ? Notification.permission
    : "unsupported";
}

function notify(title: string, body: string, tag: string) {
  if (notificationPermission() !== "granted") return;
  try {
    // `tag` collapses a repeat of the same closure into one notification.
    new Notification(title, { body, tag });
  } catch {
    /* some mobile browsers only allow notifications from a service worker */
  }
}

/** Banner(s) at the top of /admin/live for rounds a judge has closed and the
 *  MacMahon operator has not acknowledged yet, plus the notification switch. */
export function RoundCloseAlerts({
  views,
  loaded,
}: {
  views: ClosureView[];
  loaded: boolean;
}) {
  const toast = useToast();
  const [acked, setAcked] = useState<Set<string>>(() => new Set());
  const [alertsOn, setAlertsOn] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const seenRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    try {
      const raw = lsGet(ACK_KEY);
      const list = raw ? (JSON.parse(raw) as unknown) : [];
      if (Array.isArray(list)) setAcked(new Set(list.filter((k): k is string => typeof k === "string")));
    } catch {
      /* corrupt value — start empty */
    }
    setAlertsOn(lsGet(ALERT_PREF_KEY) === "1");
    setPermission(notificationPermission());
  }, []);

  // After a reload the browser holds sound back until the page is touched once.
  useEffect(() => {
    if (!alertsOn) return;
    const unlock = () => void audio()?.resume().catch(() => {});
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, [alertsOn]);

  const active = useMemo(
    () => views.filter((v) => v.isCurrent && !acked.has(v.key)),
    [views, acked],
  );

  // Announce closures that appear while the page is open. Those already there
  // on the first successful load are shown as banners but make no sound.
  useEffect(() => {
    if (!loaded) return;
    const keys = views.filter((v) => v.isCurrent).map((v) => v.key);
    if (seenRef.current === null) {
      seenRef.current = new Set(keys);
      return;
    }
    for (const v of views) {
      if (!v.isCurrent || seenRef.current.has(v.key)) continue;
      seenRef.current.add(v.key);
      const title = `🏁 ${v.division.name} ปิดรอบ ${v.closure.round} แล้ว`;
      const by = v.closure.by ? `โดย ${v.closure.by} ` : "";
      const body = `${by}${timeOf(v.closure.at)} น. — ทำงานใน MacMahon ต่อได้เลย`;
      toast.show(title, "success");
      if (alertsOn) {
        chime();
        notify(title, body, v.key);
      }
    }
  }, [views, loaded, alertsOn, toast]);

  // The tab title counts what is waiting, so it shows in the taskbar too.
  useEffect(() => {
    const base = document.title.replace(/^\(🏁 \d+\) /, "");
    document.title = active.length ? `(🏁 ${active.length}) ${base}` : base;
    return () => {
      document.title = document.title.replace(/^\(🏁 \d+\) /, "");
    };
  }, [active.length]);

  function acknowledge(key: string) {
    setAcked((prev) => {
      const next = new Set(prev);
      next.add(key);
      // Only keep acks for closures still on the board, so the list cannot grow forever.
      const live = new Set(views.map((v) => v.key));
      lsSet(ACK_KEY, JSON.stringify([...next].filter((k) => live.has(k))));
      return next;
    });
  }

  async function enableAlerts() {
    lsSet(ALERT_PREF_KEY, "1");
    setAlertsOn(true);
    chime(); // the click unlocks audio; this also lets them hear what it sounds like
    if (notificationPermission() === "default") {
      try {
        setPermission(await Notification.requestPermission());
      } catch {
        setPermission(notificationPermission());
      }
    } else {
      setPermission(notificationPermission());
    }
  }

  function disableAlerts() {
    lsSet(ALERT_PREF_KEY, "0");
    setAlertsOn(false);
  }

  return (
    <section className="space-y-3" aria-live="polite">
      {active.map((v) => (
        <div
          key={v.key}
          className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3"
        >
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-emerald-100">
                🏁 {v.division.name} — ปิดรอบ {v.closure.round} แล้ว
              </p>
              <p className="mt-0.5 text-sm text-emerald-200/80">
                {v.closure.by ? `โดย ${v.closure.by} · ` : ""}
                {timeOf(v.closure.at)} น. · ทำงานใน MacMahon ต่อได้เลย
              </p>
              {v.closure.pending.length > 0 && (
                <p className="mt-1.5 text-sm text-ink-secondary">
                  ตอนปิดรอบยังไม่มีผล {v.closure.pending.length} โต๊ะ: {tableList(v.closure.pending)}
                  {" "}— กรรมการยืนยันว่าเป็นโต๊ะที่ไม่ได้แข่ง
                </p>
              )}
              {v.changed.length > 0 && (
                <p className="mt-1.5 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-1.5 text-sm text-amber-200">
                  ⚠️ ผลเปลี่ยนหลังปิดรอบ: {tableList(v.changed)} — Sync ใน MacMahon ใหม่อีกครั้ง
                </p>
              )}
            </div>
            <Button size="sm" variant="secondary" onClick={() => acknowledge(v.key)}>
              รับทราบ
            </Button>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-tertiary">
        {alertsOn ? (
          <>
            <span>
              🔔 แจ้งเตือนเมื่อกรรมการปิดรอบ: เปิดอยู่
              {permission === "denied" && " (เบราว์เซอร์บล็อกการแจ้งเตือนบนจอ — มีแค่เสียง)"}
              {permission === "unsupported" && " (เบราว์เซอร์นี้แจ้งเตือนบนจอไม่ได้ — มีแค่เสียง)"}
            </span>
            <button
              type="button"
              onClick={disableAlerts}
              className="focus-ring rounded-lg font-semibold text-brand-300 hover:text-brand-200"
            >
              ปิดเสียง
            </button>
          </>
        ) : (
          <>
            <span>เปิดไว้บนเครื่องที่ใช้ MacMahon จะได้รู้ทันทีเมื่อกรรมการกดปิดรอบ</span>
            <Button size="sm" variant="secondary" onClick={() => void enableAlerts()}>
              🔔 เปิดการแจ้งเตือน
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
