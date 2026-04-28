import js from "@eslint/js"
import * as tseslint from "typescript-eslint"
import reactPlugin from "eslint-plugin-react"
import reactHooks from "eslint-plugin-react-hooks"
import unicorn from "eslint-plugin-unicorn"
import { fileURLToPath } from "node:url"
import path from "node:path"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const tsconfigRootDir = path.resolve(__dirname, "..")
const kebabCasePattern = "^[a-z0-9]+(?:-[a-z0-9]+)*$"

const ignoredPaths = [
  "build/**",
  ".worktrees/**",
  ".pnpm-store/**",
  "node_modules/**",
  "**/.venv-*/**",
  "**/.venv/**",
  "apps/web/public/**",
  "apps/web/.next/**",
  "output/**",
  "scripts/**",
  "local-only/**",
  "packages/shell/**/*.js",
  "packages/storage/src/__tests__/**",
  "packages/pipeline/eval/src/tests/**",
  "apps/web/src/app/api/settings/api-keys/route.ts",
  "packages/llm/src/index.ts",
]
const nodeFiles = [
  "config/**/*.{js,mjs,cjs}",
  "packages/shell/**/*.js",
  "scripts/**/*.{js,mjs,cjs}",
  "local-only/**/*.{js,mjs,cjs}",
]
const nodeGlobals = {
  require: "readonly",
  module: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  process: "readonly",
  console: "readonly",
  Buffer: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  fetch: "readonly",
  navigator: "readonly",
  AudioContext: "readonly",
}

export default tseslint.config(
  {
    ignores: ignoredPaths,
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir,
      },
    },
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooks,
      unicorn,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",
      "react/jsx-pascal-case": "error",
      "react/function-component-definition": [
        "error",
        {
          namedComponents: "function-declaration",
          unnamedComponents: "arrow-function",
        },
      ],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
      "unicorn/filename-case": [
        "error",
        {
          case: "kebabCase",
          ignore: ["^\\.env", "^README$", "^architecture$"],
        },
      ],
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: "typeLike",
          format: ["PascalCase"],
        },
        {
          selector: "class",
          format: ["PascalCase"],
        },
        {
          selector: "variable",
          types: ["function"],
          modifiers: ["exported"],
          format: ["PascalCase"],
          filter: {
            regex: kebabCasePattern,
            match: false,
          },
        },
      ],
    },
  },
  {
    files: nodeFiles,
    languageOptions: {
      parserOptions: {
        projectService: false,
        tsconfigRootDir,
      },
      globals: nodeGlobals,
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/__tests__/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
)
