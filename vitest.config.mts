import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// .mts, not .ts: the package has no "type": "module", so a .ts config is loaded
// as CommonJS and vitest's own ESM-only deps fail to require().
//
// Unit tests cover the pure modules under lib/ only — no DOM, no Supabase, no
// fixtures. Anything needing a browser or a database belongs in a future e2e
// suite; keeping this suite hermetic is what makes it cheap to run on every push.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
