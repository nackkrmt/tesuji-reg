import { describe, expect, it } from "vitest";
import { renderLivePage } from "@/lib/live/shell";

/** The boot block is the only thing that tells results.js which tournament to
 *  poll. It shipped broken once: four `window.__X=…;` literals concatenated with
 *  `+` were folded by the production minifier with the `;` separators dropped,
 *  so the block was a syntax error, __LIVE_TID never got set, and the board
 *  showed "ข้อมูลค้าง" against perfectly good data. Keep it ONE statement. */
describe("live board boot script", () => {
  const TID = "b0f0c1f5-106a-4373-8bee-f170d5ac8a82";

  function bootOf(html: string): string {
    const m = /<script>([\s\S]*?)<\/script>/.exec(html);
    return m?.[1] ?? "";
  }

  it("is syntactically valid JavaScript", () => {
    const script = bootOf(renderLivePage("th", TID));
    expect(script).not.toBe("");
    expect(() => new Function(script)).not.toThrow();
  });

  it("actually sets every global results.js reads", () => {
    const script = bootOf(renderLivePage("en", TID));
    const win: Record<string, unknown> = {};
    new Function("window", script)(win);
    expect(win.__LIVE_TID).toBe(TID);
    expect(win.__LIVE_LANG).toBe("en");
    expect(win).toHaveProperty("__SUPABASE_URL");
    expect(win).toHaveProperty("__SUPABASE_KEY");
  });

  it("escapes < so a value can never close the script block", () => {
    const script = bootOf(renderLivePage("th", "</script><b>"));
    expect(script).not.toContain("</script>");
  });
});
