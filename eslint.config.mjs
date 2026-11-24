import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,

  {
    // Vendored shadcn/ui primitives are third-party scaffolded code: they
    // stay at the shared Next.js baseline and are not held to the
    // first-party rules below.
    files: ["src/components/ui/**/*.{ts,tsx}"],
  },

  {
    // First-party BreathEasy code is held to a stricter standard:
    // no `any`, no unused variables, no accidental console noise.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/ui/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
      "@typescript-eslint/no-non-null-assertion": "warn",
      "prefer-const": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-debugger": "error",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-fallthrough": "error",
      "no-redeclare": "error",
      "no-unreachable": "error",
      "no-useless-escape": "error",
      "no-irregular-whitespace": "error",
      "no-mixed-spaces-and-tabs": "error",
      eqeqeq: ["error", "smart"],
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/purity": "warn",
    },
  },

  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "examples/**",
      "skills/**",
      "scripts/**",
      "mini-services/**",
      "download/**",
      "upload/**",
      "agent-ctx/**",
    ],
  },
];

export default eslintConfig;
