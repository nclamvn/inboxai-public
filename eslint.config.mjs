import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-build/**",
    ".codex-db-test-*/**", // Disposable local PostgreSQL files, not application source.
    "out/**",
    "build/**",
    "next-env.d.ts",
    "vendor/picomatch-v*/**", // Third-party style; exact sources and security tests gate these backports.
  ]),
]);

export default eslintConfig;
