import { describe, expect, it } from "vitest";
import { chromeIntentUrl } from "./browser";

describe("chromeIntentUrl", () => {
  it("targets Chrome by package and keeps the path + query", () => {
    const out = chromeIntentUrl(
      "https://reg.example.com/t/abc/register/payment?batch=123",
    );
    expect(out).toBe(
      "intent://reg.example.com/t/abc/register/payment?batch=123" +
        "#Intent;scheme=https;package=com.android.chrome;" +
        "S.browser_fallback_url=https%3A%2F%2Freg.example.com%2Ft%2Fabc%2Fregister%2Fpayment%3Fbatch%3D123;end",
    );
  });

  it("drops a fragment rather than corrupting the intent syntax", () => {
    const out = chromeIntentUrl("https://reg.example.com/t/abc#frag");
    expect(out.startsWith("intent://reg.example.com/t/abc#Intent;")).toBe(true);
    expect(out.split("#").length).toBe(2);
  });
});
