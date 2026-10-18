"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useLiveQuery } from "@/lib/data/store";
import { pickActiveTournament, type Tournament } from "@/lib/data/types";
import { useAdminAccess } from "@/components/admin/AdminAccessContext";
import { Select } from "@/components/ui/form";

/** Which tournament the admin is working on. One shared selection for every
 *  admin page (dashboard, registrations, rules, …), persisted per browser so
 *  it survives reloads. Default: the newest published tournament. */

const STORAGE_KEY = "tesuji.admin.tid";

interface AdminTournamentCtxValue {
  tournaments: Tournament[];
  loading: boolean;
  /** Resolved selection — null only while loading or when no tournaments exist. */
  tid: string | null;
  tournament: Tournament | null;
  setTid: (id: string) => void;
}

const Ctx = createContext<AdminTournamentCtxValue | null>(null);

export function useAdminTournament(): AdminTournamentCtxValue {
  const v = useContext(Ctx);
  if (!v)
    throw new Error("useAdminTournament must be used inside the admin shell");
  return v;
}

export function AdminTournamentProvider({ children }: { children: ReactNode }) {
  const { isAdmin, tournamentIds } = useAdminAccess();
  const { data: tournaments, loading } = useLiveQuery(
    (d) => d.listTournaments(),
    [],
    ["tournament"],
  );
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    setChosen(window.localStorage.getItem(STORAGE_KEY));
  }, []);

  const setTid = useCallback((id: string) => {
    setChosen(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore quota */
    }
  }, []);

  // A SubAdmin's picker holds only their assignments. RLS already lets them
  // read those (drafts included), but every published event is a public row
  // and would otherwise show up here as if it could be managed.
  const all = tournaments ?? [];
  const rows = isAdmin ? all : all.filter((t) => tournamentIds.includes(t.id));
  // A stored selection that no longer exists (deleted tournament, or one this
  // account was unassigned from) falls back to the default rule rather than
  // dead-ending every admin page.
  const chosenRow = chosen ? rows.find((t) => t.id === chosen) : undefined;
  const tournament = chosenRow ?? pickActiveTournament(rows);

  return (
    <Ctx.Provider
      value={{
        tournaments: rows,
        loading,
        tid: tournament?.id ?? null,
        tournament: tournament ?? null,
        setTid,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

/** The shared tournament selector — rendered in the admin shell (sidebar +
 *  mobile bar) whenever more than one tournament exists. */
export function AdminTournamentPicker({ className }: { className?: string }) {
  const { tournaments, tid, setTid } = useAdminTournament();
  if (tournaments.length <= 1) return null;
  return (
    <Select
      value={tid ?? ""}
      onChange={(e) => setTid(e.target.value)}
      aria-label="เลือกรายการแข่งขัน"
      className={className}
    >
      {tournaments.map((t) => (
        <option key={t.id} value={t.id}>
          {t.nameTh}
          {t.status === "published" ? "" : t.status === "draft" ? " (ร่าง)" : " (ปิดแล้ว)"}
        </option>
      ))}
    </Select>
  );
}
