import { defineConfig } from "vitest/config";

export default defineConfig({
  // The app's store is a zustand hook, and zustand imports `react`; the app's
  // build maps that to Preact's compat layer (@preact/preset-vite), so the
  // tests that load the store do the same. zustand is inlined so the alias
  // reaches its own import.
  resolve: {
    alias: { react: "preact/compat" },
  },
  test: {
    include: ["src/**/*.test.ts", "vite-plugins/**/*.test.ts", "action/**/*.test.ts", "site/**/*.test.ts"],
    environment: "node",
    server: { deps: { inline: ["zustand"] } },
  },
});
