import type { ExportKind, ExportProgress } from "../../hooks/useExport";

/**
 * The one button currently mid-export shows a percent (or "starting…")
 * rather than static text, so a several-second export does not read as a
 * hung tab; the other export buttons just go disabled, same as the
 * New/Example buttons' own confirm-state label swap. **Lottie is the one
 * exception**: `runLottieExport` has no per-frame encode progress at all
 * (`useExport.ts`'s own docstring), so `progress.total` never leaves 0 for
 * it and its running label is always "…" rather than "starting…" or a
 * percent that would never move past 0%. **APNG is NOT an exception**:
 * `runApngExport` rasterizes and muxes one frame at a time, exactly like
 * `runVideoExport`, and reports `onProgress` the same way, so it gets the
 * same percent label mp4/webm do.
 *
 * A standalone module, not an inline closure inside `TopBar.tsx`,
 * specifically so it has a headless unit test
 * (`TopBar.exportLabel.test.ts`) independent of rendering the component.
 * Importing anything from `TopBar.tsx` itself pulls in `preact/hooks` and
 * `useAppStore` (zustand), which fails to resolve under `vitest.config.ts`'s
 * plain `node` test environment (no React/Preact alias set up there,
 * because no test before this one ever needed to import from a `.tsx`
 * file) — confirmed by trying exactly that: `Cannot find package 'react'
 * imported from node_modules/zustand/esm/react.mjs`. This module has only
 * a type-only import (erased at compile time, so it carries none of
 * `useExport.ts`'s own `preact/hooks` import along with it) and no JSX, so
 * it is importable from a plain `.test.ts` file with zero setup.
 *
 * Fix round 1 finding 1: the previous version of this function (inline in
 * `TopBar.tsx`) special-cased `kind === "lottie" || kind === "apng"` — a
 * copy-paste of the Lottie case this task's own Step 5 never actually
 * removed for apng, despite the top-bar button, the `useExport.ts`
 * docstring and the task report all claiming APNG got a real percent
 * label. It did not: the apng button showed "…" unconditionally, exactly
 * like Lottie. Fixed here, and pinned by `TopBar.exportLabel.test.ts`.
 */
export function exportLabelFor(kind: ExportKind, progress: ExportProgress | null): string {
  if (progress && progress.kind === kind) {
    if (kind === "lottie") return "…";
    return progress.total > 0
      ? `${Math.round((progress.done / progress.total) * 100)}%`
      : "starting…";
  }
  return kind;
}
