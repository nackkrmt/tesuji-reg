// Builds the master-award-sheet .xlsx from confirmed /admin/awards winner rows —
// pure (no DOM). Column set and order mirror the federation's master Google
// Sheet EXACTLY (verified against raw_data of previously synced award rows), so
// the admin can paste the exported rows straight into the sheet and the next
// replace-all sync (parseGoDatabaseCsv "award") reproduces what this page wrote.

import * as XLSX from "xlsx";

/** One row destined for both go_player_database and the master sheet. */
export interface AwardSheetRow {
  prefix: string | null;
  firstname: string;
  lastname: string;
  phone: string | null;
  category: string | null;
  rank_in_category: string;
  rank_award: number;
  event_name: string;
  date: string;
  organizer: string | null;
}

/** Header names and ORDER copied from the master sheet itself (phone sits 5th,
 *  right after lastname). The re-sync parser matches by lowercased header name,
 *  not position — the order matters so a pasted block lands in the right
 *  columns of the sheet. `seq` is left blank: the sheet owns its numbering. */
const HEADERS = [
  "seq",
  "prefix",
  "firstname",
  "lastname",
  "phone",
  "category",
  "rank_in_category",
  "rank_award",
  "event_name",
  "date",
  "organizer",
] as const;

export function buildAwardSheetXlsx(rows: AwardSheetRow[]): ArrayBuffer {
  const aoa: (string | number | null)[][] = [
    [...HEADERS],
    ...rows.map((r) => [
      null,
      r.prefix ?? "",
      r.firstname,
      r.lastname,
      r.phone ?? "",
      r.category ?? "",
      r.rank_in_category,
      r.rank_award,
      r.event_name,
      r.date,
      r.organizer ?? "",
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "award");
  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}
