import { defineConfig } from "vitest/config";

// Kept out of the main suite on purpose: this is a measurement, not a guard.
// Run: npx vitest run --config docs/research/2026-09-27-phase-6-export-probes/vitest.config.ts --reporter=verbose
export default defineConfig({
  test: { include: ["docs/research/2026-09-27-phase-6-export-probes/*.test.ts"], environment: "node" },
});
