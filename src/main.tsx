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
  // A throw inside installExportSeam() (or a failed import) becomes an
  // unhandled promise rejection with no `.catch()` — invisible in the page,
  // and presenting to a harness that awaits window.__mareyExportPng as an
  // unexplained 20s timeout rather than a console error pointing at the
  // actual failure.
  import("./lib/devExportSeam")
    .then((m) => m.installExportSeam())
    .catch((err) => console.error("[devExportSeam] failed to install:", err));

  // Same reasoning, same shape, for Task 4's Lottie browser harness
  // (`tools/visual-check/lottie-check.mjs`): a separate dynamic
  // import so a production build's constant-folding drops this module too.
  import("./lib/devLottieSeam")
    .then((m) => m.installLottieSeam())
    .catch((err) => console.error("[devLottieSeam] failed to install:", err));
}
