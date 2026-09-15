import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

// Flat config (ESLint 9). Replaces .eslintrc.json + `next lint`, which Next 15
// deprecates and Next 16 removes. `next/core-web-vitals` is still an eslintrc-
// style shareable config, so it is bridged through FlatCompat rather than
// imported directly.
//
// ⚠️ Gotcha kept from .eslintrc.json: this preset does NOT load
// @typescript-eslint/no-explicit-any, so an
// `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comment
// fails the run with "rule not found". Use a bare `any` with no disable comment.
const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const eslintConfig = [
  {
    // Deno edge functions have their own runtime + imports and are excluded from
    // tsconfig too; .next/ and build output are generated.
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "node_modules/**",
      "backups/**",
      "supabase/functions/**",
      "public/live-assets/**",
    ],
  },
  ...compat.extends("next/core-web-vitals"),
];

export default eslintConfig;
