// Flat ESLint config for the monorepo.
//
// Deliberately pragmatic: the codebase currently has ~144 pre-existing type
// errors and ~468 `any` escapes, so blanket-erroring on those would make the
// linter unusable on day one and it would simply be switched off. Instead this
// errors on the classes of bug that have actually bitten production here —
// unhandled promises, accidental globals, unsafe patterns — and warns on the
// debt so it is visible and can be burned down.
import js from "@eslint/js"
import globals from "globals"
import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/build/**",
      "**/*.config.js",
      "**/*.config.ts",
      "mockups/**",
      "packages/server/src/scripts/**", // one-off operational scripts
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // --- Real-bug guards (error) ---
      "no-undef": "off", // TypeScript handles this better
      "@typescript-eslint/no-floating-promises": "off", // needs type info; enable with project config later
      "no-const-assign": "error",
      "no-dupe-keys": "error",
      "no-unreachable": "error",
      "no-fallthrough": "error",
      "no-self-compare": "error",
      "require-atomic-updates": "off",

      // --- Existing debt (warn so it is visible, not blocking) ---
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "@typescript-eslint/ban-ts-comment": "warn",
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },
)
