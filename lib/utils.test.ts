import { describe, expect, it } from "vitest";
import { getByPath, safeInternalPath } from "@/lib/utils";

// safeInternalPath is the app's only open-redirect guard: every ?next= target
// from login, RequireAuth and RegisterGate passes through it. Its whole
// protection is four characters of index arithmetic, so the hostile cases are
// worth pinning explicitly.
describe("safeInternalPath", () => {
  it("passes an ordinary internal path through untouched", () => {
    expect(safeInternalPath("/account")).toBe("/account");
    expect(safeInternalPath("/t/abc/register/payment?batch=1")).toBe(
      "/t/abc/register/payment?batch=1",
    );
    expect(safeInternalPath("/")).toBe("/");
  });

  it("falls back for empty input", () => {
    expect(safeInternalPath(null)).toBe("/");
    expect(safeInternalPath(undefined)).toBe("/");
    expect(safeInternalPath("")).toBe("/");
  });

  it("honours a custom fallback", () => {
    expect(safeInternalPath(null, "/account")).toBe("/account");
    expect(safeInternalPath("https://evil.example", "/account")).toBe("/account");
  });

  it("rejects protocol-relative URLs", () => {
    expect(safeInternalPath("//evil.example")).toBe("/");
    expect(safeInternalPath("//evil.example/path")).toBe("/");
  });

  it("rejects the backslash variant browsers normalise to //", () => {
    expect(safeInternalPath("/\\evil.example")).toBe("/");
  });

  it("rejects absolute URLs and non-slash-leading paths", () => {
    expect(safeInternalPath("https://evil.example")).toBe("/");
    expect(safeInternalPath("http://evil.example")).toBe("/");
    expect(safeInternalPath("evil.example")).toBe("/");
    expect(safeInternalPath("javascript:alert(1)")).toBe("/");
  });
});

describe("getByPath", () => {
  it("walks a dotted path", () => {
    expect(getByPath({ a: { b: { c: 3 } } }, "a.b.c")).toBe(3);
  });

  it("returns undefined for a missing branch instead of throwing", () => {
    expect(getByPath({ a: {} }, "a.b.c")).toBeUndefined();
    expect(getByPath(null, "a")).toBeUndefined();
    expect(getByPath(undefined, "a.b")).toBeUndefined();
  });
});
