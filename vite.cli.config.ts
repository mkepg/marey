import { defineConfig } from "vite";

// Library build for the CLI. The compiler's relative imports are
// extensionless under `moduleResolution: "bundler"`, which Node's native
// type stripping cannot resolve — this build step resolves module paths
// (and strips types), it does not merely strip types (erasableSyntaxOnly is
// already on, so the source was already strip-compatible on its own).
export default defineConfig({
  build: {
    outDir: "dist/cli",
    // The app build (`vite build`, dist/) must not be wiped by this one.
    emptyOutDir: false,
    // Vite otherwise copies the project's public/ directory (favicon,
    // fonts/, og-image.png, ...) into every build's outDir, including a
    // library build with nothing to do with the web app. dist/cli is a
    // single Node script; it must hold only marey.mjs.
    copyPublicDir: false,
    target: "node22",
    lib: {
      entry: "src/cli/main.ts",
      formats: ["es"],
      // A literal name, not a base name to extend: for a `"type": "module"`
      // package, Vite's default extension resolution maps the "es" format
      // to `.js`, not `.mjs` (see resolveOutputJsExtension in Vite's
      // build.js) — a string `fileName` here would produce `marey.js`,
      // which bin/marey.mjs does not import. The function form returns the
      // filename verbatim.
      fileName: () => "marey.mjs",
    },
    rollupOptions: {
      // Keep every Node builtin external; this bundles the compiler, not
      // Node. playwright-core (used by `marey export`'s browser launch) is
      // also kept external: it ships its own native driver binaries that a
      // bundle cannot inline.
      external: [/^node:/, "playwright-core"],
    },
  },
});
