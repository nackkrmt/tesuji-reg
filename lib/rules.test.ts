import { describe, expect, it } from "vitest";
import {
  isHttpOrDataUrl,
  parseRulesSections,
  serializeRulesSections,
} from "@/lib/rules";
import type { RulesSection } from "@/lib/data/types";

// กฎ กติกา shares the schedule's carrier-column problem: one free-text column,
// every read through parseRulesSections, and a rejected payload renders as an
// empty rules page rather than an error. Two legacy shapes are still in the
// production column — a PDF link from the removed upload feature, and sections
// that predate the block editor and carry `items` instead of `blocks`.

describe("serializeRulesSections / parseRulesSections", () => {
  it("round-trips every block type", () => {
    const sections: RulesSection[] = [
      {
        title: "กติกาการแข่งขัน",
        blocks: [
          { type: "heading", text: "การนับแต้ม" },
          { type: "paragraph", text: "ใช้กติกาญี่ปุ่น" },
          { type: "divider" },
          { type: "callout", tone: "warn", text: "ห้ามใช้โทรศัพท์" },
          {
            type: "list",
            ordered: true,
            items: [
              { text: "มาถึงก่อนเวลา", depth: 0 },
              { text: "ลงทะเบียนที่โต๊ะ", depth: 1 },
            ],
          },
          { type: "table", hasHeader: true, rows: [["รุ่น", "เวลา"], ["ก1", "09:00"]] },
        ],
      },
    ];
    expect(parseRulesSections(serializeRulesSections(sections))).toEqual(sections);
  });

  it("drops the legacy rules-PDF link the upload feature left behind", () => {
    expect(isHttpOrDataUrl("https://example.org/rules.pdf")).toBe(true);
    expect(isHttpOrDataUrl("HTTP://example.org/rules.pdf")).toBe(true);
    expect(isHttpOrDataUrl("data:application/pdf;base64,AAA")).toBe(true);
    expect(isHttpOrDataUrl("")).toBe(false);
    expect(isHttpOrDataUrl(null)).toBe(false);
    expect(isHttpOrDataUrl("[]")).toBe(false);
    expect(parseRulesSections("https://example.org/rules.pdf")).toEqual([]);
  });

  it("treats an empty, absent or free-text column as no rules", () => {
    expect(serializeRulesSections([])).toBe("[]");
    expect(parseRulesSections(null)).toEqual([]);
    expect(parseRulesSections(undefined)).toEqual([]);
    expect(parseRulesSections("")).toEqual([]);
    expect(parseRulesSections("ห้ามใช้โทรศัพท์ในห้องแข่ง")).toEqual([]);
    expect(parseRulesSections("{}")).toEqual([]);
  });

  it("keeps a pre-block-editor section's plain items", () => {
    expect(
      parseRulesSections(
        JSON.stringify([{ title: "ทั่วไป", items: ["ข้อ 1  ", "", "   ", "ข้อ 2"] }]),
      ),
    ).toEqual([{ title: "ทั่วไป", blocks: [], items: ["ข้อ 1", "ข้อ 2"] }]);
  });

  it("ignores those items once the section has blocks", () => {
    // Otherwise re-authoring a legacy section shows the old text twice.
    expect(
      parseRulesSections(
        JSON.stringify([
          {
            title: "ทั่วไป",
            items: ["ข้อความเก่า"],
            blocks: [{ type: "paragraph", text: "ข้อความใหม่" }],
          },
        ]),
      ),
    ).toEqual([
      { title: "ทั่วไป", blocks: [{ type: "paragraph", text: "ข้อความใหม่" }] },
    ]);
  });

  it("drops a section that would render as nothing", () => {
    expect(
      parseRulesSections(
        JSON.stringify([
          { title: "   ", blocks: [], items: [] },
          { title: "", blocks: [{ type: "nonsense" }] },
          null,
          "ข้อความ",
          { title: "เหลือไว้", blocks: [] },
        ]),
      ),
    ).toEqual([{ title: "เหลือไว้", blocks: [] }]);
  });

  it("keeps an untitled section that has content", () => {
    // The admin may leave the title blank; the blocks still have to show.
    expect(
      parseRulesSections(
        JSON.stringify([{ blocks: [{ type: "paragraph", text: "ข้อความ" }] }]),
      ),
    ).toEqual([{ title: "", blocks: [{ type: "paragraph", text: "ข้อความ" }] }]);
  });

  it("fills in the defaults a hand-edited block may be missing", () => {
    const parsed = parseRulesSections(
      JSON.stringify([
        {
          title: "t",
          blocks: [
            { type: "heading" },
            { type: "callout", tone: "nonsense" },
            { type: "list" },
            { type: "table" },
          ],
        },
      ]),
    );
    expect(parsed[0].blocks).toEqual([
      { type: "heading", text: "" },
      { type: "callout", tone: "info", text: "" },
      { type: "list", ordered: false, items: [] },
      { type: "table", hasHeader: false, rows: [] },
    ]);
  });

  it("clamps list indentation and drops empty list items", () => {
    const parsed = parseRulesSections(
      JSON.stringify([
        {
          title: "t",
          blocks: [
            {
              type: "list",
              items: [
                { text: "a", depth: 99 },
                { text: "b", depth: -3 },
                { text: "c", depth: 2.7 },
                { text: "" },
                "ข้อความล้วน",
              ],
            },
          ],
        },
      ]),
    );
    expect(parsed[0].blocks[0]).toEqual({
      type: "list",
      ordered: false,
      items: [
        { text: "a", depth: 6 },
        { text: "b", depth: 0 },
        { text: "c", depth: 2 },
      ],
    });
  });

  it("coerces table cells and pads nothing", () => {
    const parsed = parseRulesSections(
      JSON.stringify([
        {
          title: "t",
          blocks: [{ type: "table", hasHeader: true, rows: [["a", 1, null], "x", []] }],
        },
      ]),
    );
    expect(parsed[0].blocks[0]).toEqual({
      type: "table",
      hasHeader: true,
      rows: [["a", "", ""], [], []],
    });
  });

  it("caps a pasted payload instead of rendering all of it", () => {
    // These limits are the guard against a paste from a Word document turning
    // the public page into a megabyte of DOM.
    const parsed = parseRulesSections(
      JSON.stringify([
        { title: "t", blocks: Array.from({ length: 80 }, () => ({ type: "divider" })) },
        {
          title: "u",
          blocks: [
            { type: "paragraph", text: "ก".repeat(6000) },
            {
              type: "list",
              items: Array.from({ length: 400 }, (_, i) => ({ text: `i${i}` })),
            },
            {
              type: "table",
              rows: Array.from({ length: 250 }, () =>
                Array.from({ length: 30 }, (_, c) => `c${c}`),
              ),
            },
          ],
        },
      ]),
    );
    expect(parsed[0].blocks).toHaveLength(60);
    const [paragraph, list, tableBlock] = parsed[1].blocks;
    expect(paragraph).toEqual({ type: "paragraph", text: "ก".repeat(5000) });
    if (list.type !== "list" || tableBlock.type !== "table") {
      throw new Error("the caps fixture no longer parses to a list and a table");
    }
    expect(list.items).toHaveLength(300);
    expect(tableBlock.rows).toHaveLength(200);
    expect(tableBlock.rows[0]).toHaveLength(20);
  });
});
