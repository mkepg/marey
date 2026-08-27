import { defineConfig } from "vitest/config";

// Self-contained so the baseline harness never touches the project's own test
// config or shows up in `npm test`. Run from the repo root:
//   npx vitest run --config eval/vitest.config.ts
export default defineConfig({
  test: { include: ["eval/*.test.ts"], environment: "node" },
});
