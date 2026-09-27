import { defineConfig } from "vite";

// Library build of the public entry: `compile()` and the Scene IR types.
// Declarations are emitted separately by `tsc -p tsconfig.lib.json`. The
// entry's import graph holds no package (src/package/boundary.test.ts pins
// that), so nothing is marked external.
export default defineConfig({
  build: {
    outDir: "dist/lib",
    // The app build (dist/) and the CLI build (dist/cli/) must survive this one.
    emptyOutDir: false,
    // Nothing under public/ belongs in the library.
    copyPublicDir: false,
    target: "node22",
    lib: {
      entry: "src/package/index.ts",
      formats: ["es"],
      // A literal name, for the reason vite.cli.config.ts gives: a string
      // `fileName` would produce `marey.js` for this `"type": "module"`
      // package; the function form returns the filename verbatim.
      fileName: () => "marey.mjs",
    },
  },
});
