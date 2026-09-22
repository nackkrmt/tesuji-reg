// Printed before `npm run dev:supabase`, the one script that points a local dev
// server at whatever project `.env` names — in this repo, production.
//
// Why this exists: `npm run dev` used to do this silently. Local edits then ran
// against real registrations, and docs/DEV-SETUP.md described a dev/prod env
// split that does not exist (there is no second Supabase project). `dev` now
// runs the localStorage mock; reaching the real database is an explicit choice,
// and this makes the choice visible.
import { readFileSync } from "node:fs";

function envUrl() {
  for (const file of [".env.development.local", ".env.local", ".env.development", ".env"]) {
    try {
      const line = readFileSync(file, "utf8")
        .split("\n")
        .find((l) => l.startsWith("NEXT_PUBLIC_SUPABASE_URL="));
      if (line) {
        const value = line.slice("NEXT_PUBLIC_SUPABASE_URL=".length).trim();
        // Only the project ref is identifying; never print the key.
        const ref = value.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1];
        return { file, ref: ref ?? value };
      }
    } catch {
      // File absent — try the next one in Next.js precedence order.
    }
  }
  return null;
}

const found = envUrl();
const PROD_REF = "ytgbimtjayecaxfyssta";

const lines = [
  "",
  "  \x1b[33m⚠  dev server against a REAL Supabase project\x1b[0m",
  found
    ? `     project: ${found.ref}${found.ref === PROD_REF ? "  \x1b[31m(PRODUCTION — real registrations)\x1b[0m" : ""}`
    : "     project: (no NEXT_PUBLIC_SUPABASE_URL found — the app will fail to start)",
  found ? `     from:    ${found.file}` : "",
  "",
  "     Writes here are real. For UI work use \x1b[36mnpm run dev\x1b[0m (localStorage mock).",
  "",
].filter(Boolean);

console.log(lines.join("\n"));
