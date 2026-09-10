import { render } from "preact";
import { App } from "./components/App";
import "./styles/global.scss";

render(<App />, document.getElementById("app")!);

// Dev-only export seam for `tools/visual-check/export-check.mjs`.
// No product UI ships an export button this phase, so the browser harness
// needs a way to reach the export path without one. The dynamic import stays
// inside this `if` (rather than importing `installExportSeam` at module top
// and calling it conditionally) so that in a production build Vite constant-
// folds `import.meta.env.DEV` to `false` and drops the whole branch —
// `devExportSeam.ts` and everything it pulls in — instead of merely leaving
// `window.__mareyExportPng` unset.
if (import.meta.env.DEV) {
  import("./lib/devExportSeam").then((m) => m.installExportSeam());
}
