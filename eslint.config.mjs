import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The database layer has no React. The React Compiler lint rules still analyse every function and can loop on
  // long seed loops (they hung on src/db/seed-record.ts), so they are off here only.
  {
    files: ["src/db/**/*.ts"],
    rules: Object.fromEntries(["exhaustive-deps", "rules-of-hooks", "hooks", "capitalized-calls", "static-components", "use-memo", "void-use-memo", "preserve-manual-memoization", "memo-dependencies", "incompatible-library", "immutability", "globals", "refs", "memoized-effect-dependencies", "exhaustive-effect-dependencies", "set-state-in-effect", "no-deriving-state-in-effects", "error-boundaries", "purity", "set-state-in-render", "invariant", "todo", "syntax", "unsupported-syntax", "config", "gating", "rule-suppression", "fbt", "component-hook-factories"].map((r) => [`react-hooks/${r}`, "off"])),
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Third-party React Bits components, kept as published so they can be updated from upstream.
    "src/components/react-bits/**",
    // Ponytail, vendored as published (github.com/dietrichgebert/ponytail).
    "vendor/**",
  ]),
]);

export default eslintConfig;
