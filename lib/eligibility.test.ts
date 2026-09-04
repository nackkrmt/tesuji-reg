import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Category, Person } from "@/lib/data/types";
import { eligibleFor } from "@/lib/eligibility";

// The same rule is implemented again in plpgsql across the reserve_seats /
// swap_seat / division-change gates. Drift is invisible in the UI — the picker
// offers a รุ่น and the server rejects it with RANK_NOT_ELIGIBLE /
// AGE_NOT_ELIGIBLE only after the whole form is filled in — so the boundary
// matrix below is the thing that pins the TypeScript half down.

// eligibleFor gets the age from the wall clock (no asOf to inject), so today is
// pinned; otherwise the boundary rows would drift with the calendar.
const TODAY = new Date(2026, 8, 4); // 2026-09-04, local time

// Birthday on 1 January, months before the pinned today, so the person has
// completed exactly `age` years and no row accidentally tests the birthday
// turnover (lib/age.test.ts already covers that).
const dobForAge = (age: number) => `${TODAY.getFullYear() - age}-01-01`;

// power_level ladder (lib/rank.ts): 15 kyu = 0 … 1 kyu = 14, 1 dan = 15 … 8 dan = 22.
const KYU7 = 8;
const KYU6 = 9;
const KYU1 = 14;
const DAN1 = 15;

/** Only dob + powerLevel matter to eligibleFor; the rest is filler. */
function person(power: number | null, age: number | null): Person {
  return {
    titlePrefix: "นาย",
    firstNameTh: "ทดสอบ",
    lastNameTh: "ระบบ",
    firstNameEn: "Test",
    lastNameEn: "Person",
    hasMiddleName: false,
    phone: "0800000000",
    // "" → ageFromDob null, i.e. a person whose age cannot be established
    dob: age == null ? "" : dobForAge(age),
    powerLevel: power,
  };
}

type Band = Pick<
  Category,
  "minPowerLevel" | "maxPowerLevel" | "minAge" | "maxAge"
>;

/** A division with every band open, then the row's bounds applied over it. */
function category(band: Partial<Band>): Category {
  return {
    id: "cat-1",
    tournamentId: "tour-1",
    code: "A",
    name: "รุ่นทดสอบ",
    capacity: 32,
    seatsTaken: 0,
    feeThb: 300,
    minPowerLevel: null,
    maxPowerLevel: null,
    minAge: null,
    maxAge: null,
    combinableCategoryIds: [],
    sortOrder: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...band,
  };
}

interface Case {
  name: string;
  power: number | null;
  age: number | null;
  band: Partial<Band>;
  eligible: boolean;
}

function run(cases: Case[]) {
  for (const c of cases) {
    it(c.name, () => {
      expect(eligibleFor(person(c.power, c.age), category(c.band))).toBe(
        c.eligible,
      );
    });
  }
}

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
});
afterAll(() => vi.useRealTimers());

describe("eligibleFor — rank band (age unbounded)", () => {
  run([
    {
      name: "no bounds admits any rank",
      power: DAN1,
      age: 30,
      band: {},
      eligible: true,
    },
    {
      name: "no bounds admits an undeclared rank",
      power: null,
      age: 30,
      band: {},
      eligible: true,
    },
    {
      name: "min-only: exactly on the floor is in",
      power: KYU6,
      age: 30,
      band: { minPowerLevel: KYU6 },
      eligible: true,
    },
    {
      name: "min-only: one step below the floor is out",
      power: KYU7,
      age: 30,
      band: { minPowerLevel: KYU6 },
      eligible: false,
    },
    {
      name: "min-only: far above the floor is in",
      power: DAN1,
      age: 30,
      band: { minPowerLevel: KYU6 },
      eligible: true,
    },
    {
      name: "max-only: exactly on the ceiling is in",
      power: KYU1,
      age: 30,
      band: { maxPowerLevel: KYU1 },
      eligible: true,
    },
    {
      name: "max-only: one step above the ceiling is out",
      power: DAN1,
      age: 30,
      band: { maxPowerLevel: KYU1 },
      eligible: false,
    },
    {
      name: "max-only: far below the ceiling is in",
      power: KYU7,
      age: 30,
      band: { maxPowerLevel: KYU1 },
      eligible: true,
    },
    {
      name: "both bounds: on the floor is in",
      power: KYU6,
      age: 30,
      band: { minPowerLevel: KYU6, maxPowerLevel: KYU1 },
      eligible: true,
    },
    {
      name: "both bounds: on the ceiling is in",
      power: KYU1,
      age: 30,
      band: { minPowerLevel: KYU6, maxPowerLevel: KYU1 },
      eligible: true,
    },
    {
      name: "both bounds: below the floor is out",
      power: KYU7,
      age: 30,
      band: { minPowerLevel: KYU6, maxPowerLevel: KYU1 },
      eligible: false,
    },
    {
      name: "both bounds: above the ceiling is out",
      power: DAN1,
      age: 30,
      band: { minPowerLevel: KYU6, maxPowerLevel: KYU1 },
      eligible: false,
    },
    {
      name: "an undeclared rank fails a min-only band",
      power: null,
      age: 30,
      band: { minPowerLevel: KYU6 },
      eligible: false,
    },
    {
      name: "an undeclared rank fails a max-only band",
      power: null,
      age: 30,
      band: { maxPowerLevel: KYU1 },
      eligible: false,
    },
    {
      name: "an undeclared rank fails a two-sided band",
      power: null,
      age: 30,
      band: { minPowerLevel: KYU6, maxPowerLevel: KYU1 },
      eligible: false,
    },
  ]);
});

describe("eligibleFor — age band (rank unbounded)", () => {
  run([
    {
      name: "no bounds admits any age",
      power: KYU1,
      age: 9,
      band: {},
      eligible: true,
    },
    {
      name: "no bounds admits an unknown age",
      power: KYU1,
      age: null,
      band: {},
      eligible: true,
    },
    {
      name: "min-only: exactly on the floor is in",
      power: KYU1,
      age: 50,
      band: { minAge: 50 },
      eligible: true,
    },
    {
      name: "min-only: one year below the floor is out",
      power: KYU1,
      age: 49,
      band: { minAge: 50 },
      eligible: false,
    },
    {
      name: "min-only: far above the floor is in",
      power: KYU1,
      age: 70,
      band: { minAge: 50 },
      eligible: true,
    },
    {
      name: "max-only: exactly on the ceiling is in",
      power: KYU1,
      age: 12,
      band: { maxAge: 12 },
      eligible: true,
    },
    {
      name: "max-only: one year above the ceiling is out",
      power: KYU1,
      age: 13,
      band: { maxAge: 12 },
      eligible: false,
    },
    {
      name: "max-only: far below the ceiling is in",
      power: KYU1,
      age: 6,
      band: { maxAge: 12 },
      eligible: true,
    },
    {
      name: "both bounds: on the floor is in",
      power: KYU1,
      age: 8,
      band: { minAge: 8, maxAge: 12 },
      eligible: true,
    },
    {
      name: "both bounds: on the ceiling is in",
      power: KYU1,
      age: 12,
      band: { minAge: 8, maxAge: 12 },
      eligible: true,
    },
    {
      name: "both bounds: below the floor is out",
      power: KYU1,
      age: 7,
      band: { minAge: 8, maxAge: 12 },
      eligible: false,
    },
    {
      name: "both bounds: above the ceiling is out",
      power: KYU1,
      age: 13,
      band: { minAge: 8, maxAge: 12 },
      eligible: false,
    },
    {
      name: "an unknown age fails a min-only band",
      power: KYU1,
      age: null,
      band: { minAge: 50 },
      eligible: false,
    },
    {
      name: "an unknown age fails a max-only band",
      power: KYU1,
      age: null,
      band: { maxAge: 12 },
      eligible: false,
    },
    {
      name: "an unknown age fails a two-sided band",
      power: KYU1,
      age: null,
      band: { minAge: 8, maxAge: 12 },
      eligible: false,
    },
  ]);
});

describe("eligibleFor — both bands together", () => {
  const youthKyu: Partial<Band> = {
    minPowerLevel: KYU6,
    maxPowerLevel: KYU1,
    minAge: 8,
    maxAge: 12,
  };
  run([
    {
      name: "inside both bands is in",
      power: KYU1,
      age: 10,
      band: youthKyu,
      eligible: true,
    },
    {
      name: "on every boundary at once is in",
      power: KYU6,
      age: 8,
      band: youthKyu,
      eligible: true,
    },
    {
      name: "on the other boundary of each band is in",
      power: KYU1,
      age: 12,
      band: youthKyu,
      eligible: true,
    },
    {
      name: "right rank, wrong age is out",
      power: KYU1,
      age: 13,
      band: youthKyu,
      eligible: false,
    },
    {
      name: "right age, wrong rank is out",
      power: DAN1,
      age: 10,
      band: youthKyu,
      eligible: false,
    },
    {
      name: "wrong on both counts is out",
      power: DAN1,
      age: 30,
      band: youthKyu,
      eligible: false,
    },
    {
      name: "an open rank band does not rescue a failed age band",
      power: null,
      age: 30,
      band: { minAge: 8, maxAge: 12 },
      eligible: false,
    },
    {
      name: "an open age band does not rescue a failed rank band",
      power: DAN1,
      age: null,
      band: { maxPowerLevel: KYU1 },
      eligible: false,
    },
  ]);
});
