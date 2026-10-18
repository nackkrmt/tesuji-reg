import { describe, expect, it } from "vitest";
import {
  ADMIN_ONLY_PREFIXES,
  canAccessPath,
  filterNavGroups,
  isAdminOnlyPath,
  parseAdminAccess,
  type AdminAccess,
} from "./admin-access";

const admin: AdminAccess = { role: "admin", tournamentIds: [] };
const sub: AdminAccess = { role: "subadmin", tournamentIds: ["t-a", "t-b"] };
const none: AdminAccess = { role: null, tournamentIds: [] };

const SHARED_PAGES = [
  "/admin",
  "/admin/tournaments",
  "/admin/categories",
  "/admin/rules",
  "/admin/registrations",
  "/admin/registrations/0b6c3e1a-batch",
  "/admin/withdrawals",
  "/admin/division-changes",
  "/admin/codes",
  "/admin/live",
  "/admin/judges",
];

describe("isAdminOnlyPath", () => {
  it("matches each prefix exactly and below it", () => {
    for (const p of ADMIN_ONLY_PREFIXES) {
      expect(isAdminOnlyPath(p)).toBe(true);
      expect(isAdminOnlyPath(`${p}/deeper`)).toBe(true);
    }
  });
  it("does not match a longer sibling or the shared pages", () => {
    expect(isAdminOnlyPath("/admin/reset-log")).toBe(false);
    for (const p of SHARED_PAGES) expect(isAdminOnlyPath(p)).toBe(false);
  });
});

describe("canAccessPath", () => {
  it("lets an admin everywhere", () => {
    for (const p of [...ADMIN_ONLY_PREFIXES, ...SHARED_PAGES, "/admin/tournaments/t-zzz"]) {
      expect(canAccessPath(admin, p)).toBe(true);
    }
  });
  it("keeps a subadmin off every admin-only page", () => {
    for (const p of ADMIN_ONLY_PREFIXES) expect(canAccessPath(sub, p)).toBe(false);
  });
  it("lets a subadmin into the shared pages", () => {
    for (const p of SHARED_PAGES) expect(canAccessPath(sub, p)).toBe(true);
  });
  it("opens a tournament's edit form only when it is assigned", () => {
    expect(canAccessPath(sub, "/admin/tournaments/t-a")).toBe(true);
    expect(canAccessPath(sub, "/admin/tournaments/t-b/")).toBe(true);
    expect(canAccessPath(sub, "/admin/tournaments/t-other")).toBe(false);
    expect(canAccessPath(sub, "/admin/tournaments/new")).toBe(false);
  });
  it("refuses everything without a role", () => {
    for (const p of ["/admin", ...SHARED_PAGES]) expect(canAccessPath(none, p)).toBe(false);
  });
});

describe("filterNavGroups", () => {
  const groups = [
    { title: null, items: [{ href: "/admin" }] },
    { title: "จัดการแข่งขัน", items: [{ href: "/admin/tournaments" }, { href: "/admin/subadmins" }] },
    { title: "ข้อมูล", items: [{ href: "/admin/database" }, { href: "/admin/people" }] },
    { title: null, items: [{ href: "/admin/reset" }] },
  ];
  it("hands an admin the whole list", () => {
    expect(filterNavGroups(groups, admin)).toEqual(groups);
  });
  it("drops admin-only items and the groups left empty, keeping order", () => {
    expect(filterNavGroups(groups, sub)).toEqual([
      { title: null, items: [{ href: "/admin" }] },
      { title: "จัดการแข่งขัน", items: [{ href: "/admin/tournaments" }] },
    ]);
  });
  it("shows nothing without a role", () => {
    expect(filterNavGroups(groups, none)).toEqual([]);
  });
});

describe("parseAdminAccess", () => {
  it("reads the admin shape", () => {
    expect(parseAdminAccess({ role: "admin", tournamentIds: [] })).toEqual(admin);
  });
  it("reads the subadmin shape", () => {
    expect(parseAdminAccess({ role: "subadmin", tournamentIds: ["t-a", "t-b"] })).toEqual(sub);
  });
  it("treats null, junk and an unassigned subadmin as no access", () => {
    for (const raw of [
      null,
      undefined,
      "admin",
      { role: null, tournamentIds: [] },
      { role: "owner", tournamentIds: ["t-a"] },
      { role: "subadmin", tournamentIds: [] },
      { role: "subadmin", tournamentIds: [1, 2] },
      { role: "subadmin" },
    ]) {
      expect(parseAdminAccess(raw)).toEqual(none);
    }
  });
});
