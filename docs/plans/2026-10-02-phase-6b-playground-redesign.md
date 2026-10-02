# Phase 6B — The Playground Redesign Implementation Plan

**Goal:** Restyle the playground with a graph-paper light theme and a
quiet-mat dark theme, show the scene as a framed plate on a surface, make the
layout work on phones, replace the default scene with "Dusk over layered
hills" and the "example" button with an examples menu, and redraw the favicon
and the link-preview image.

**Architecture:** This is a restyle on top of the existing Preact app. Colours
stay CSS custom properties per theme in `src/styles/global.scss`. Anything a
test can check is a pure TypeScript module with a unit test, because Vitest
runs in a Node environment and has no component testing:
- plate geometry and the caption text;
- menu keyboard handling;
- the examples registry;
- contrast;
- the default scene's loop and placement.

Component behaviour is measured in a real browser by a committed Playwright
script. The renderer below the preview's host element, the export page, the
CLI and every exporter stay untouched.

**Tech stack:** Preact 10, Zustand, SCSS modules, Monaco, PixiJS 8, Vitest 4,
Playwright 1.62.1, Vite 8.

**Spec:** `docs/specs/2026-10-02-marey-phase-6b-playground-redesign-design.md`.
Read it before any task. This plan cites it as "spec §N", and where the two
differ, the spec wins.

**Position in Phase 6:** this plan runs on `phase-6` after the parent plan's
Tasks 1–12 and before its Task 13
(`docs/plans/2026-09-27-phase-6-packaging-and-legibility.md`).

---

## Global Constraints

Every task's requirements include this section.

1. **The renderer, the export page, the CLI and the exporters are not
   modified.** Nothing under `src/compiler/`, `src/exportPage/` or `src/cli/`
   changes, except that tests may be added under `src/compiler/`.
   `npm run check:export` must pass unchanged at the end of every task that
   touches the app shell. (spec "Preserves", §10)
2. **`fit` keeps its meaning.** The renderer's `updateLayout` in
   `src/compiler/renderer/adapter.ts` stays as it is. The plate frame is a UI
   overlay computed with the same formula. (spec §3)
3. **Colours come from custom properties.** Component SCSS references
   `var(--…)` only, never a literal colour. The two theme blocks in
   `src/styles/global.scss` are the single source of colour, and they hold
   spec §2's values exactly.
4. **Copy rules.** Interface text is sentence case. There are no all-caps
   labels and no pane-label strips. Menu titles and descriptions are exactly
   spec §5's table.
5. **Fonts.** The interface face is Bricolage Grotesque, 400 and 700, as
   `.ttf` files in `public/fonts/` (spec §8). Code, the log and scene text stay
   in JetBrains Mono.
6. **Accessibility.** Every control is reachable by keyboard and shows visible
   focus. Menus use `role="menu"`/`menuitem` and `aria-expanded`, open on
   Enter, Space or click, move with the arrow keys, Home and End, close on
   Escape, and return focus to their button. (spec §4)
7. **Measured evidence.** "It looks right" is not evidence. Every claim in a
   report is backed by a test, a measurement or a captured file. The owner's
   visual review is the last gate (spec §9.8), not a substitute for §9.1–9.7.
8. **Repository rules** (`AGENTS.md`):
   - Before every commit, run the four checks: `npm test`;
     `npx vitest run --config eval/vitest.config.ts`; `npm run build`;
     `npm run build:cli && node bin/marey.mjs check $(git ls-files '*.marey')`.
   - Stage paths explicitly and read `git diff --staged`.
   - Use Conventional Commit subjects with no tool attribution.
   - No committed path or wording may name an AI tool or describe an
     assistant workflow.
   - Never commit `.visual-check/` or `dist/`, and never commit a file over
     1 MB.
   - `core.autocrlf` is on, so judge changes with `git diff --stat -- <path>`.
9. **Browser checks:**
   - Run `npx vite --port 5199 --strictPort`.
   - On this machine the dev server may bind only to `[::1]`. If `localhost`
     is refused, use `http://[::1]:5199`.
   - Kill the server afterwards and confirm nothing listens on 5199
     (`netstat -ano | grep 5199 | grep LISTEN` prints nothing).
10. **Tests prove behaviour.** For every behaviour a task requires, delete the
    line that implements it, run the test, see it fail, then restore it.
    Report the failing output.

---

## File structure

| Path | Responsibility | Task |
|---|---|---|
| `public/fonts/BricolageGrotesque-{Regular,Bold}.ttf` | The interface face | 1 |
| `src/styles/global.scss`, `src/styles/_tokens.scss` | Theme tokens and `@font-face` | 1 |
| `src/styles/contrast.test.ts` | WCAG contrast of the token pairs | 1 |
| `src/components/Preview/plateGeometry.ts` (+ test) | Plate rectangle and caption text, pure | 2 |
| `src/store/index.ts` | `sceneInfo` | 2 |
| `src/hooks/useCompile.ts` | Records `sceneInfo` on compile | 2 |
| `src/components/Preview/*` | Surface, inset host, frame, caption | 2 |
| `src/components/Editor/MonacoEditor/themes.ts` | Editor themes | 3 |
| `src/examples/dusk-hills.marey` (+ `duskHills.test.ts`) | The default scene | 4 |
| `src/examples/{physics-pile,bar-chart-reveal,logo-reveal}.marey` | Examples | 5 |
| `src/examples/index.ts` (+ `examples.test.ts`) | The examples registry | 5 |
| `src/components/TopBar/menuKeys.ts` (+ test) | Menu keyboard logic, pure | 6 |
| `src/components/TopBar/*` | The examples menu, the restyled bar, the ⋯ menu | 6, 7 |
| `src/hooks/useIsNarrow.ts`, `src/components/App.*`, `src/components/Terminal/*` | The phone layout | 7 |
| `public/favicon.svg`, `tools/share-image/share-image.marey`, `public/og-image.png`, `index.html` | The icon and the link preview | 8 |
| `tools/visual-check/playground-check.mjs` | Measured browser check | 9 |

---

## Task 1: Theme tokens, the typeface, and the contrast test (tier: integration)

Spec §2, §8, §9.6.

**Files:**
- Create: `public/fonts/BricolageGrotesque-Regular.ttf`, `public/fonts/BricolageGrotesque-Bold.ttf`
- Delete: `public/fonts/Syne-Regular.ttf`, `public/fonts/Syne-Bold.ttf` (once nothing references Syne)
- Modify: `src/styles/global.scss`, `src/styles/_tokens.scss`
- Create: `src/styles/contrast.test.ts`

**Interfaces:**
- Produces the custom properties every later task uses. These are today's
  names, plus four new ones: `--accent-text`, `--surface-grid-minor`,
  `--surface-grid-major`, `--surface-dot` and `--plate-outline`.

- [ ] **Step 1: Fetch the fonts.** In a temporary directory outside the
  repository, run `npm pack @expo-google-fonts/bricolage-grotesque@0.4.1`.
  Extract it, then copy two files:
  - `package/400Regular/BricolageGrotesque_400Regular.ttf` to
    `public/fonts/BricolageGrotesque-Regular.ttf`;
  - `package/700Bold/BricolageGrotesque_700Bold.ttf` to
    `public/fonts/BricolageGrotesque-Bold.ttf`.

  Verify their SHA-256 hashes:
  - Regular: `972a6d098c9867ae131d0ea99e221e63976b11a19d4b931c2c7ace525674e4f6`
  - Bold: `a737b146fe0d77ffe8a86e3cd16700dd431d3b1e420d4fd80e142cd68a1cb50d`

- [ ] **Step 2: Write the failing contrast test.** Create
  `src/styles/contrast.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Spec 6B §9.6: every text colour in both themes reaches WCAG AA (4.5:1) on
 * the background it is drawn on. The colours are read from the theme blocks
 * in global.scss, so the test checks what ships, not a copy of it.
 */
const scss = readFileSync(new URL("./global.scss", import.meta.url), "utf8");

function colours(selector: string): Record<string, string> {
  const start = scss.indexOf(selector);
  if (start < 0) throw new Error(`global.scss has no ${selector} block`);
  const open = scss.indexOf("{", start);
  const close = scss.indexOf("}", open);
  const out: Record<string, string> = {};
  for (const m of scss.slice(open + 1, close).matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[m[1]] = m[2].toLowerCase();
  }
  return out;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const dark = colours(":root");
const light = { ...dark, ...colours('[data-theme="light"]') };

const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["text-primary", "bg-pane"],
  ["text-secondary", "bg-pane"],
  ["text-primary", "bg-terminal"],
  ["text-secondary", "bg-terminal"],
  ["text-ok", "bg-bar"],
  ["text-error", "bg-bar"],
  ["accent-text", "accent"],
];

describe.each([["dark", dark], ["light", light]] as const)("%s theme", (_name, theme) => {
  it.each(PAIRS)("--%s on --%s reaches 4.5:1", (fg, bg) => {
    expect(theme[fg], `--${fg} missing`).toBeDefined();
    expect(theme[bg], `--${bg} missing`).toBeDefined();
    expect(contrast(theme[fg], theme[bg])).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the contrast formula", () => {
  it("measures black on white as 21:1 and a colour on itself as 1:1", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#6b58f0", "#6b58f0")).toBeCloseTo(1, 5);
  });
});
```

- [ ] **Step 3: Run it.** `npx vitest run src/styles/contrast.test.ts`.
  Expected result: the dark `accent-text on accent` case fails because
  `--accent-text` is missing (today's accent is `#7c6af7`), and the light cases
  that need new variables fail too.

- [ ] **Step 4: Rewrite the tokens.**
  - In `src/styles/global.scss`, replace the two Syne `@font-face` blocks with
    two for `'Bricolage Grotesque'`, at weights 400 and 700, from
    `/fonts/BricolageGrotesque-{Regular,Bold}.ttf`, with
    `font-display: swap`.
  - In `_tokens.scss`, set `$font-ui: "'Bricolage Grotesque', system-ui, sans-serif"`.
  - Set the theme blocks to exactly these values. `:root` is the dark theme
    and `[data-theme="light"]` overrides it.

| Variable | Dark (`:root`) | Light |
|---|---|---|
| `--bg-app`, `--bg-bar`, `--bg-pane`, `--bg-editor` | `#16171a` | `#fbfcfa` |
| `--bg-terminal` | `#131417` | `#f1f3f0` |
| `--bg-preview` | `#1b1c20` | `#fbfcfa` |
| `--bg-handle` / `--bg-handle-h` | `#222429` / `#2f3138` | `#e2e6ea` / `#cdd8e4` |
| `--border` / `--border-soft` | `#26282e` / `#1f2025` | `#d9dee4` / `#e8ecef` |
| `--text-primary` | `#d9dbe1` | `#1d2a44` |
| `--text-secondary` | `#9aa0ab` | `#5a6478` |
| `--text-muted` | `#5d626d` | `#8a93a6` |
| `--text-ok`, `--dot-ok` | `#6fcf97` | `#2f7a4a` |
| `--text-error`, `--dot-error` | `#f87171` | `#b4322a` |
| `--text-info` | `#8ab4f8` | `#2b4fa8` |
| `--dot-idle` | `#5d626d` | `#8a93a6` |
| `--accent` | `#6b58f0` | `#1d2a44` |
| `--accent-dim` | `#2a2550` | `#dfe5ee` |
| `--accent-text` | `#ffffff` | `#fbfcfa` |
| `--surface-grid-minor` / `--surface-grid-major` | (unused) `#1b1c20` / `#1b1c20` | `#e6ebf1` / `#cdd8e4` |
| `--surface-dot` | `#2c2e35` | (unused) `#fbfcfa` |
| `--plate-outline` | `#2f3138` | `#1d2a44` |

  - Run `git grep -n "Syne" -- src public index.html vite-plugins`. If the only
    hits are the deleted `@font-face` blocks, delete the Syne `.ttf` files.
    Otherwise report every hit.

- [ ] **Step 5: Run the test and the production build.** Run
  `npx vitest run src/styles/contrast.test.ts`; every case must pass. Then run
  `npm run build`. The licences generator must list Bricolage Grotesque under
  OFL 1.1 and no longer list Syne. Read the generated licences file in
  `dist/` to confirm both, and quote the relevant lines in the report.

- [ ] **Step 6: Red-run evidence.** Temporarily set the dark `--accent` back
  to `#7c6af7`. The test must fail at 3.99:1. Restore it.

- [ ] **Step 7: Commit.** Run the four checks, stage the paths explicitly,
  and commit `feat(app): graph-paper and quiet-mat theme tokens, set in Bricolage Grotesque`.

---

## Task 2: The surface, the plate, the caption (tier: integration)

Spec §3, §2 (pane labels).

**Files:**
- Create: `src/components/Preview/plateGeometry.ts`, `src/components/Preview/plateGeometry.test.ts`
- Modify: `src/store/index.ts`, `src/hooks/useCompile.ts`, `src/components/Preview/Preview.tsx`, `src/components/Preview/Preview.module.scss`, `src/components/App.tsx`, `src/components/App.module.scss`
- Delete: `src/components/Layout/PaneLabel.tsx`, `src/components/Layout/PaneLabel.module.scss`

**Interfaces:**
- Produces:

```ts
// src/store/index.ts
export interface SceneInfo {
  readonly width: number;
  readonly height: number;
  readonly duration: number | null;
  readonly fit: "contain" | "cover" | "fill" | "none";
}
// AppState gains:
sceneInfo: SceneInfo | null;
setSceneInfo: (info: SceneInfo | null) => void;
```

- Produces DOM hooks for Task 9:
  - the frame element carries `data-plate-frame`;
  - the caption carries `data-plate-caption`, with children `[data-caption-size]` and `[data-caption-length]`;
  - the surface carries `data-plate-surface`.

- [ ] **Step 1: Failing tests.** Create `src/components/Preview/plateGeometry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { captionFor, plateRect } from "./plateGeometry";

describe("plateRect", () => {
  it("contain centres the scene and letterboxes the short axis", () => {
    expect(plateRect("contain", { width: 1000, height: 600 }, { width: 800, height: 600 }))
      .toEqual({ x: 100, y: 0, width: 800, height: 600 });
    expect(plateRect("contain", { width: 400, height: 600 }, { width: 800, height: 600 }))
      .toEqual({ x: 0, y: 150, width: 400, height: 300 });
  });

  it("none anchors at the top-left at logical size, when it fits", () => {
    expect(plateRect("none", { width: 1000, height: 700 }, { width: 800, height: 600 }))
      .toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });

  it("frames nothing when the scene fills or overflows the box", () => {
    expect(plateRect("cover", { width: 1000, height: 600 }, { width: 800, height: 600 })).toBeNull();
    expect(plateRect("fill", { width: 1000, height: 600 }, { width: 800, height: 600 })).toBeNull();
    expect(plateRect("none", { width: 700, height: 700 }, { width: 800, height: 600 })).toBeNull();
  });

  it("frames nothing in an empty box", () => {
    expect(plateRect("contain", { width: 0, height: 600 }, { width: 800, height: 600 })).toBeNull();
  });
});

describe("captionFor", () => {
  it("reads the logical size and the duration", () => {
    expect(captionFor({ width: 800, height: 600, duration: 12 })).toEqual({ size: "800 × 600", length: "12 s" });
    expect(captionFor({ width: 1200, height: 630, duration: 2.5 })).toEqual({ size: "1200 × 630", length: "2.5 s" });
  });

  it("says so when the scene has no duration", () => {
    expect(captionFor({ width: 800, height: 600, duration: null }).length).toBe("no fixed length");
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run src/components/Preview/plateGeometry.test.ts`.
  Expected result: it fails because the module does not exist.

- [ ] **Step 3: Implement `plateGeometry.ts`.**

```ts
/**
 * Where the scene lands inside the preview's host box, computed with the same
 * formula as `updateLayout` in src/compiler/renderer/adapter.ts, so the frame
 * the UI draws sits exactly on the scene the renderer draws. Returns null
 * when the scene fills the box (`cover`, `fill`) or overflows it (`none`),
 * because then there is no bounded plate to frame (spec 6B §3).
 */
export type Fit = "contain" | "cover" | "fill" | "none";
export interface Size { readonly width: number; readonly height: number }
export interface Rect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

export function plateRect(fit: Fit, box: Size, scene: Size): Rect | null {
  if (box.width <= 0 || box.height <= 0) return null;
  if (fit === "contain") {
    const s = Math.min(box.width / scene.width, box.height / scene.height);
    const width = scene.width * s;
    const height = scene.height * s;
    return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height };
  }
  if (fit === "none") {
    if (scene.width > box.width || scene.height > box.height) return null;
    return { x: 0, y: 0, width: scene.width, height: scene.height };
  }
  return null;
}

export function captionFor(scene: { width: number; height: number; duration: number | null }): {
  size: string;
  length: string;
} {
  const seconds = (s: number): string => (Number.isInteger(s) ? String(s) : String(Number(s.toFixed(2))));
  return {
    size: `${scene.width} × ${scene.height}`,
    length: scene.duration === null ? "no fixed length" : `${seconds(scene.duration)} s`,
  };
}
```

- [ ] **Step 4: Record the scene info.**
  - Add `sceneInfo` and `setSceneInfo` to the store, with an initial value of `null`.
  - In `useCompile.ts`, call `setSceneInfo` where the compile result is
    applied:
    - with `{ width, height, duration, fit }` from `result._irPayload` when
      `success`;
    - with `null` otherwise.

- [ ] **Step 5: The preview.**
  - **Surface.** The wrap becomes the surface (`data-plate-surface`), with
    `background-color: var(--bg-preview)`.
    - Light theme: a two-layer millimetre grid.
      `linear-gradient(var(--surface-grid-minor) 1px, transparent 1px)` and its
      90° twin at `7px 7px`, plus `var(--surface-grid-major)` lines at
      `35px 35px`.
    - Dark theme: `radial-gradient(var(--surface-dot) 1px, transparent 1.2px)`
      at `12px 12px`.
    - Select the theme with `[data-theme="light"] &`, since the app root
      carries `data-theme`.
  - **Host.** The host is inset by `--plate-margin`: 24 px, and 12 px under
    `@media (max-width: 759px)`. The renderer draws into the host, so its
    `fit` maps into the inset box.
  - **Frame.** A frame element (`data-plate-frame`) is absolutely positioned
    inside the host's box, at `plateRect(fit, hostBox, scene)`.
    - The host box comes from a `ResizeObserver` on the host.
    - The frame is absent when `sceneInfo` is null or `plateRect` is null.
    - It is `pointer-events: none`, and it never covers the scene: the outline
      is drawn outside the rectangle with `outline: 1px solid var(--plate-outline)`.
    - In light mode, crop marks: at each corner, two 9 px, 1 px strokes in
      `var(--plate-outline)`, 4 px outside the rectangle.
    - In dark mode, no crop marks; instead
      `box-shadow: 0 12px 28px rgba(0,0,0,.45)`. That shadow is the only
      literal colour allowed, because it is a shadow, not a theme colour.
  - **Caption.** Under the frame, the same width as the frame
    (`data-plate-caption`): size on the left (`data-caption-size`) and length
    on the right (`data-caption-length`), from `captionFor(sceneInfo)`.
    - It uses the interface face with `font-variant-numeric: tabular-nums`,
      12 px, `var(--text-secondary)`.
    - It is hidden whenever the frame is.
  - **Unchanged.** The empty state and the compiling overlay stay. Restyle
    them with tokens, in sentence case ("No preview", "Compiling…"), with
    no letter-spacing and no uppercase.

- [ ] **Step 6: Remove the pane labels.** Delete the three `<PaneLabel>`
  uses in `App.tsx`, and the `PaneLabel` component and its SCSS. Remove the
  `calc(100% - 32px)` offset the editor wrapper used for the label, and any
  other height arithmetic that counted the label.

- [ ] **Step 7: Verify in a browser.** Run the dev server (Global Constraint
  9) and load the app in both themes. Measure with Playwright:
  - the frame's `getBoundingClientRect()` aspect ratio against 800/600, which
    must agree to within 1 px;
  - that the canvas's drawn scene and the frame coincide. Compare the frame
    rect with `plateRect` computed from the host's client size.

  Save screenshots to `.visual-check/6b/task2-{light,dark}.png`. Kill the
  server and confirm the port is free.

- [ ] **Step 8: Red-run evidence.** Change `Math.min` to `Math.max` in
  `plateRect`, see the contain tests fail, and restore it.

- [ ] **Step 9: Commit.** Run the four checks and `npm run check:export`, then
  commit `feat(app): the scene as a framed plate on a graph-paper or dot-grid surface`.

---

## Task 3: Editor themes (tier: mechanical)

Spec §2 (editor themes).

**Files:** Modify `src/components/Editor/MonacoEditor/themes.ts`, `src/components/Editor/FallbackEditor.module.scss`

- [ ] **Step 1:** Redraw both Monaco themes in `themes.ts`. For each theme,
  set the editor background, the gutter background, line-number colours,
  current-line highlight, selection, cursor and indent guides from that
  theme's palette in spec §2. Use:
  - light: keywords `#2b4fa8`, comments `#8a93a6` italic;
  - dark: keywords `#a99bff`, comments `#5d626d`.

  Choose the other token colours so that each reaches at least 4.5:1 on its
  editor background. List each token colour and its measured ratio in the
  report; compute them with the `contrast` function exported from
  `src/styles/contrast.test.ts`, or with the same formula.
- [ ] **Step 2:** Restyle `FallbackEditor.module.scss` with tokens only.
- [ ] **Step 3:** In a browser, load the default scene in both themes and save
  `.visual-check/6b/task3-{light,dark}.png`. Kill the server and confirm the
  port is free.
- [ ] **Step 4:** Run the four checks, then commit `feat(editor): editor themes on the new palettes`.

---

## Task 4: The default scene, Dusk over layered hills (tier: architecture)

Spec §6, §9.2–9.4.

**Files:**
- Create: `src/examples/dusk-hills.marey`, `src/examples/duskHills.test.ts`
- Modify: `src/store/index.ts` (the default now comes from `src/examples/dusk-hills.marey?raw`)
- Delete: `src/store/defaultScene.ts`, `src/store/defaultScene.test.ts`. Their
  four checks move to `src/examples/examples.test.ts` in Task 5. Until then,
  `duskHills.test.ts` carries them for this scene.

**Interfaces:**
- Produces `src/examples/dusk-hills.marey`. Task 5's registry imports it.
- The store's default becomes `import duskHills from "../examples/dusk-hills.marey?raw"`.
  `DEFAULT_CODE` stays exported from `src/store/index.ts` with that value
  until Task 6 replaces it with the registry.

- [ ] **Step 1: Write the failing tests.** Create `src/examples/duskHills.test.ts`.
  The structural, sampled and carried-over tests below are complete. The
  placement tests' assertions are fixed; how they map IR points to scene
  coordinates is for the implementer to work out (see Step 2).

```ts
import { describe, expect, it } from "vitest";
import { Container } from "pixi.js";
import duskSource from "./dusk-hills.marey?raw";
import { compileSource } from "../compiler/compileSource";
import { planExport } from "../compiler/export/exportContract";
import { buildNode } from "../compiler/renderer/builder";
import { SceneRuntime } from "../compiler/renderer/sceneRuntime";
import { MatterWorld } from "../compiler/renderer/physicsWorld";
import { snapshotFor } from "../compiler/renderer/frameSampler";
import { encodeCode, MAX_SHARE_LENGTH } from "../lib/share";
import type { IRAnimation, IRObjectNode, IRSceneNode } from "../compiler/sceneIR";

const TICKS_PER_SECOND = 120;
const outcome = compileSource(duskSource);
const ir = outcome.ir as IRSceneNode;

function* walk(nodes: ReadonlyArray<IRObjectNode>): Generator<IRObjectNode> {
  for (const n of nodes) {
    yield n;
    yield* walk(n.children);
  }
}

function buildRoot(scene: IRSceneNode): Container {
  const root = new Container();
  for (const node of scene.children) root.addChild(buildNode(node));
  return root;
}

describe("dusk-hills.marey", () => {
  it("compiles with no errors, at 800 × 600, 12 s, contain", () => {
    expect(outcome.errors).toEqual([]);
    expect(ir.width).toBe(800);
    expect(ir.height).toBe(600);
    expect(ir.duration).toBe(12);
    expect(ir.fit).toBe("contain");
  });

  it("exports as loaded, at the buttons' 30 fps", () => {
    const planned = planExport(ir, { fps: 30 });
    expect(planned.ok ? [] : planned.diagnostics).toEqual([]);
  });

  it("is small enough to share", () => {
    const encoded = encodeCode(duskSource);
    expect(encoded).not.toBeNull();
    expect(encoded!.length).toBeLessThanOrEqual(MAX_SHARE_LENGTH);
  });

  it("obeys the seamless-loop rule in every animation (spec §6)", () => {
    const anims: Array<{ id: string; a: IRAnimation }> = [];
    for (const n of walk(ir.children)) {
      expect(n.props.sequences, `${n.id} has a sequence`).toEqual([]);
      expect(n.props.physics, `${n.id} has physics`).toBeUndefined();
      for (const a of n.props.animations) anims.push({ id: n.id, a });
    }
    expect(anims.length).toBeGreaterThan(10);
    for (const { id, a } of anims) {
      const where = `${id} animate ${a.property}`;
      expect(a.loop, `${where}: loop`).toBe(true);
      expect(a.delay, `${where}: delay`).toBe(0);
      const cycles = 12 / (a.duration * (a.yoyo ? 2 : 1));
      expect(Math.abs(cycles - Math.round(cycles)), `${where}: period divides 12`).toBeLessThan(1e-9);
    }
  });

  it("is the same scene at 12 s as at 0 s, and a different one at 6 s", () => {
    const root = buildRoot(ir);
    const runtime = new SceneRuntime(new MatterWorld(ir.width, ir.height), root);
    const at0 = JSON.stringify(snapshotFor(root));
    let at6 = "";
    for (let t = 1; t <= 12 * TICKS_PER_SECOND; t++) {
      runtime.advanceOneTick();
      runtime.paintExactTick();
      if (t === 6 * TICKS_PER_SECOND) at6 = JSON.stringify(snapshotFor(root));
    }
    const at12 = JSON.stringify(snapshotFor(root));
    runtime.destroy();
    expect(at6).not.toEqual(at0);
    expect(at12).toEqual(at0);
  });

  // Placement rules (spec §6). Implement `mouthBottomAt0()`, `ridgeTopUnderMouth()`
  // and the t = 6 s equivalents in this file, from the IR and the builder's
  // coordinate mapping. Then keep these assertions exactly:
  //   expect(ridgeTopUnderMouth() - mouthBottomAt0()).toBeGreaterThanOrEqual(30);
  //   expect(sunTopAt6()).toBeGreaterThan(backRidgeTopAcrossSun());  // y grows downward
});
```

- [ ] **Step 2: Learn the coordinate mapping.** Before writing the placement
  helpers, read `src/compiler/renderer/builder.ts` and find how a shape's
  `position`, `origin` and `points` map to drawn coordinates. Prove the mapping
  with a sanity test in the same file: compile a one-polygon scene whose
  drawn top edge you can compute by hand, and check that your helper returns
  it. Record the mapping in a comment above the helpers.

- [ ] **Step 3: Run the tests.** `npx vitest run src/examples/duskHills.test.ts`.
  Expected result: every test fails, because the file does not exist.

- [ ] **Step 4: Write the scene.** Create `src/examples/dusk-hills.marey` to
  spec §6. Hard requirements:
  - **Canvas:** `size: (800, 600)`, `duration: 12`, `background: #2b2d5c`.
  - **Header:** a comment of at most two lines. About 120 lines in total.
  - **Day bands:** exactly spec §6's colours and heights.
  - **Night bands:** the same heights. Choose the colours and list them in the
    report for the owner.
  - **Ridges:** four polygons, back to front `#6b4a7a`, `#4a3560`, `#2f2444`,
    `#1c1630`, with top edges built from `sin()` sums. The points are explicit
    lists, because Marey has no list comprehension.
  - **Sun:** spec §6's face, exactly:
    - R = 115 and rest centre `(500, 304)`;
    - disc `#feb93e`, with an inner disc `#fecd5e` at 0.958 R, 0.083 R higher;
    - features `#232323`, with brows, eyes and smile at spec §6's table
      positions;
    - the smile as a 13-point arc computed with `sin`/`cos`;
    - every rounded end a circle whose diameter equals the stroke width.
  - **Arc:** spec §6.
    - The sun group's position yoyos (duration 6, `easeInOut`) to a depth that
      hides it completely.
    - The eyes scale to `(1, 0.15)` (yoyo, 6, `easeIn`). The brows lower and
      level, and the smile scales down, each yoyo 6.
    - The night bands fade in (alpha yoyo, 6).
    - About 20 stars fade in with the night, each twinkling on a yoyo period
      from {1, 1.5, 2, 3} s, with no delays.
    - Three birds cross on a 6 s linear loop, off screen at both ends, with
      wings flapping on a 0.5 s yoyo period.
  - **Structure:** `template Sun`, `template Bird` and `template Star`, with
    `generate` for the bands, ridges and stars, and short comments naming each
    section.

- [ ] **Step 5: Run the tests until they pass.** If the t = 12 equality fails
  on floating-point noise rather than a real phase error, stop and report the
  two differing snapshot entries. Do not round the comparison.

- [ ] **Step 6: Wire it as the default.**
  - The store imports the scene with `?raw`.
  - Delete `defaultScene.ts` and `defaultScene.test.ts`.
  - Run `git grep -n defaultScene` and confirm it returns nothing.

- [ ] **Step 7: Look at it, and measure.** In the dev server, load the default
  scene in both themes. Use Playwright to capture frames at t = 0, 3, 6 and 9 s
  of the preview to `.visual-check/6b/dusk-{0,3,6,9}.png`. Also run
  `node bin/marey.mjs export src/examples/dusk-hills.marey --format apng --out .visual-check/6b/dusk.png`
  (after `npm run build:export-page && npm run build:cli`) and report its
  output line. Kill the server and confirm the port is free.

- [ ] **Step 8: Red-run evidence.** Add `delay: 0.1` to one star's twinkle,
  and see both the structural test and the t = 12 test fail. Restore it. Then
  move the sun's rest centre to `(500, 330)` and see the placement test fail.
  Restore it.

- [ ] **Step 9: Commit.** Run the four checks, then commit
  `feat(examples): Dusk over layered hills, a seamless 12-second default scene`.

---

## Task 5: The three examples and the registry (tier: integration)

Spec §5, §9.1.

**Files:**
- Create: `src/examples/physics-pile.marey`, `src/examples/bar-chart-reveal.marey`, `src/examples/logo-reveal.marey`, `src/examples/index.ts`, `src/examples/examples.test.ts`

**Interfaces:**

```ts
// src/examples/index.ts
export type ExampleId = "dusk-hills" | "physics-pile" | "bar-chart-reveal" | "logo-reveal";
export interface Example {
  readonly id: ExampleId;
  readonly title: string;
  readonly description: string;
  readonly source: string;
}
export const EXAMPLES: ReadonlyArray<Example>; // spec §5's order
export const DEFAULT_EXAMPLE: Example;          // EXAMPLES[0], dusk-hills
```

- [ ] **Step 1: Failing test.** Create `src/examples/examples.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { compileSource } from "../compiler/compileSource";
import { planExport } from "../compiler/export/exportContract";
import { encodeCode, MAX_SHARE_LENGTH } from "../lib/share";
import { DEFAULT_EXAMPLE, EXAMPLES } from "./index";

describe("the examples registry", () => {
  it("lists spec §5's four examples, titles and descriptions, in order", () => {
    expect(EXAMPLES.map((e) => [e.id, e.title, e.description])).toEqual([
      ["dusk-hills", "Dusk over layered hills", "The sun sets, sleeps and rises again, on a 12-second loop."],
      ["physics-pile", "Physics pile", "Shapes tumble, collide and settle under gravity."],
      ["bar-chart-reveal", "Bar chart reveal", "A list of numbers grows into bars, one after another."],
      ["logo-reveal", "Logo reveal", "A logo assembles from its parts in sequence."],
    ]);
    expect(DEFAULT_EXAMPLE.id).toBe("dusk-hills");
  });
});

describe.each(EXAMPLES.map((e) => [e.id, e] as const))("%s", (_id, example) => {
  const outcome = compileSource(example.source);

  it("compiles with no errors", () => {
    expect(outcome.errors).toEqual([]);
    expect(outcome.ir).not.toBeNull();
  });

  it("exports as loaded, at the buttons' 30 fps", () => {
    expect(outcome.ir!.duration).not.toBeNull();
    const planned = planExport(outcome.ir!, { fps: 30 });
    expect(planned.ok ? [] : planned.diagnostics).toEqual([]);
  });

  it("is small enough to share", () => {
    const encoded = encodeCode(example.source);
    expect(encoded).not.toBeNull();
    expect(encoded!.length).toBeLessThanOrEqual(MAX_SHARE_LENGTH);
  });

  it("opens with a header comment of at most three lines", () => {
    const lines = example.source.split("\n");
    const header = lines.findIndex((l) => !l.startsWith("//"));
    expect(header).toBeGreaterThanOrEqual(1);
    expect(header).toBeLessThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run it.** It fails because the module does not exist.
- [ ] **Step 3: Write the registry** with `?raw` imports of the four files.
- [ ] **Step 4: Adapt the three examples** from the sources spec §5 names:
  - `tools/visual-check/scenes/pile.marey`, `tumble.marey` and
    `eval/scenes/collide-stack.marey`;
  - `tools/visual-check/scenes/bars-reveal.marey`;
  - `tools/visual-check/scenes/logo.marey` and
    `eval/scenes-3b/compound-logo.marey`.

  Leave the originals unchanged. Each example needs readable names, a
  `duration` and a header of at most three lines. State in the report whether
  `physics-pile` uses `handoff`, because 6C re-checks it if it does.
- [ ] **Step 5: Run the tests.** They must pass. Then run
  `node bin/marey.mjs check src/examples/*.marey`, and quote its output.
- [ ] **Step 6: Red-run evidence.** Give one example a fourth header line and
  see the header test fail. Restore it.
- [ ] **Step 7: Commit.** Run the four checks, then commit
  `feat(examples): physics pile, bar chart reveal and logo reveal, and the examples registry`.

---

## Task 6: The examples menu (tier: integration)

Spec §5 (menu), §4 (menus).

**Files:**
- Create: `src/components/TopBar/menuKeys.ts`, `src/components/TopBar/menuKeys.test.ts`
- Modify: `src/components/TopBar/TopBar.tsx`, `src/components/TopBar/TopBar.module.scss`, `src/store/index.ts`

**Interfaces:**
- Consumes `EXAMPLES`, `DEFAULT_EXAMPLE` and `ExampleId` (Task 5).
- Produces:
  - `loadExample(id: ExampleId)` in the store, replacing the argument-less
    `loadExample`;
  - the store's default code is `DEFAULT_EXAMPLE.source`. The export of
    `DEFAULT_CODE` is removed if nothing else imports it, checked with
    `git grep -n DEFAULT_CODE`;
  - `menuKeys.ts`:

```ts
export type MenuKeyResult =
  | { readonly kind: "move"; readonly index: number }
  | { readonly kind: "activate" }
  | { readonly kind: "close" }
  | { readonly kind: "ignore" };

/** Keyboard behaviour shared by every top-bar menu (spec 6B §4). `current` is -1 when no item has focus. */
export function menuKey(key: string, current: number, count: number): MenuKeyResult;
```

  - The menu button carries `aria-haspopup="menu"`, `aria-expanded`, and an
    accessible name of `Examples`. Items are `role="menuitem"`, each
    containing its title and description.

- [ ] **Step 1: Failing test.** Create `src/components/TopBar/menuKeys.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { menuKey } from "./menuKeys";

describe("menuKey", () => {
  it("moves down and up, wrapping at both ends", () => {
    expect(menuKey("ArrowDown", 0, 4)).toEqual({ kind: "move", index: 1 });
    expect(menuKey("ArrowDown", 3, 4)).toEqual({ kind: "move", index: 0 });
    expect(menuKey("ArrowUp", 0, 4)).toEqual({ kind: "move", index: 3 });
  });

  it("starts from the first or last item when nothing has focus", () => {
    expect(menuKey("ArrowDown", -1, 4)).toEqual({ kind: "move", index: 0 });
    expect(menuKey("ArrowUp", -1, 4)).toEqual({ kind: "move", index: 3 });
  });

  it("jumps with Home and End", () => {
    expect(menuKey("Home", 2, 4)).toEqual({ kind: "move", index: 0 });
    expect(menuKey("End", 0, 4)).toEqual({ kind: "move", index: 3 });
  });

  it("activates on Enter and Space, closes on Escape and Tab, ignores the rest", () => {
    expect(menuKey("Enter", 1, 4)).toEqual({ kind: "activate" });
    expect(menuKey(" ", 1, 4)).toEqual({ kind: "activate" });
    expect(menuKey("Escape", 1, 4)).toEqual({ kind: "close" });
    expect(menuKey("Tab", 1, 4)).toEqual({ kind: "close" });
    expect(menuKey("a", 1, 4)).toEqual({ kind: "ignore" });
  });
});
```

- [ ] **Step 2: Run it.** It fails because the module does not exist.
- [ ] **Step 3: Implement `menuKey`.**
- [ ] **Step 4: Build the menu.**
  - Replace the "example" button with **Examples ▾**, listing `EXAMPLES` in
    order, each with its title and description.
  - Choosing a scene while the editor is empty loads it. While the editor
    holds code, the item's text becomes "Replace your code?". A second choice
    of the same item within 3 s loads it, and anything else, including the
    3 s timeout, cancels.
  - Keyboard handling uses `menuKey`. Escape returns focus to the button.
  - Use the export menu's existing open/close and outside-click pattern in
    `TopBar.tsx`, and make the export menu use `menuKey` too.
  - Loading a scene saves it and compiles, as `loadExample` does today.
- [ ] **Step 5: Verify in a browser.**
  - Open the menu with Enter, move with the arrow keys, load "Bar chart
    reveal", and confirm that the editor and the caption change.
  - Edit the code, choose "Logo reveal" once, and check that it asks to
    replace your code and loads only on the second choice.
  - Press Escape and confirm focus returns to the button.

  Record the observations in the report. Kill the server and confirm the port
  is free.
- [ ] **Step 6: Red-run evidence.** Break the wrap in `ArrowDown` and see the
  test fail. Restore it.
- [ ] **Step 7: Commit.** Run the four checks, then commit
  `feat(app): an examples menu with four scenes`.

---

## Task 7: The top bar and the phone layout (tier: architecture)

Spec §4, §2 (type and copy).

**Files:**
- Create: `src/hooks/useIsNarrow.ts`
- Modify: `src/components/App.tsx`, `src/components/App.module.scss`,
  `src/components/TopBar/TopBar.tsx`, `src/components/TopBar/TopBar.module.scss`,
  `src/components/Terminal/Terminal.tsx`, `src/components/Terminal/Terminal.module.scss`,
  `src/components/Layout/Handle.module.scss`, `src/components/Toast/Toast.module.scss`

**Interfaces:**
- `useIsNarrow(): boolean` is true when `matchMedia("(max-width: 759px)")`
  matches, and it updates on change.
- DOM hooks for Task 9:
  - the top bar is `header[data-topbar]`;
  - the ⋯ button has the accessible name `More`;
  - the folded log line is `button[data-log-toggle]`, with `aria-expanded`.

- [ ] **Step 1: The desktop top bar** (spec §4).
  - Left to right: the wordmark (Bricolage 700, −0.02em), then the status dot
    with its word. On the right: auto-run, Examples ▾, New, Share, Export ▾
    (with the licences link), the theme toggle and Run.
  - Restyle every control with tokens. Run uses `--accent` and
    `--accent-text`.
  - Every label is sentence case, with no uppercase transforms and no
    letter-spaced labels.
  - Focus is visible: `outline: 2px solid var(--accent); outline-offset: 2px`
    on `:focus-visible`.
- [ ] **Step 2: The phone layout,** when `useIsNarrow()` is true.
  - **Top bar:** it keeps the wordmark, the status dot (its word is hidden but
    stays the accessible name), Examples ▾, **⋯** (`More`) and Run. The ⋯ menu
    holds auto-run, New, Share, Export (with the licences link) and the theme
    toggle, as `menuitem`s, using `menuKey`.
  - **Panes:** they stack as preview, editor, log, and the split-pane handles
    are not rendered.
    - **Preview:** its height is `min(60vh, plateHeight + caption + 2 × margin)`.
      Here `plateHeight = (width − 2 × 12) × sceneInfo.height / sceneInfo.width`.
      Use a sensible fixed height when `sceneInfo` is null.
    - **Editor:** at least 45vh.
    - **Log:** one `button[data-log-toggle]` line ("compiled, 0 errors",
      "N errors" or "idle"). Pressing it opens the log, to at most 40vh, and
      sets `aria-expanded`.
  - **Desktop:** at widths of 760 px and above, nothing changes, and the
    draggable split stays.
- [ ] **Step 3: Restyle the remaining surfaces** with tokens and the interface
  face: the log (JetBrains Mono, with the `[phase]` tag in
  `--text-secondary`), the handles (a hairline, with `--bg-handle-h` on hover),
  and the toasts.
- [ ] **Step 4: Verify in a browser.** Check widths of 320, 390, 759, 760 and
  1440 px, in both themes. With Playwright, assert that:
  - no two top-bar controls' bounding boxes intersect;
  - the ⋯ menu opens with Enter, moves with the arrow keys and closes with
    Escape;
  - the log toggle opens and closes the log.

  Save the screenshots to `.visual-check/6b/task7-*.png`. Kill the server and
  confirm the port is free.
- [ ] **Step 5: Commit.** Run the four checks and `npm run check:export`,
  then commit `feat(app): the restyled top bar and a scene-first phone layout`.

---

## Task 8: The favicon and the link preview (tier: integration)

Spec §7.

**Files:** Modify `public/favicon.svg`, `tools/share-image/share-image.marey`,
`public/og-image.png`, and `index.html` (the `og:image:alt` text).

- [ ] **Step 1: The favicon.** Write `public/favicon.svg` to spec §7: a 64-unit
  `viewBox`; a `#3f3772` tile with `rx="14"`; the sun at 54 units across,
  centred horizontally near the top, with §6's colours and face proportions;
  and three thin ridges `#6b4a7a`, `#4a3560` and `#2a1f3d` across its lower
  third. The bottom of the mouth must clear the top ridge.
- [ ] **Step 2: Check it at size.** Rasterise it at 16, 32 and 64 px with
  Playwright, and save `.visual-check/6b/favicon-{16,32,64}.png`. At 16 px,
  the two eyes and the mouth must be distinct dark marks on the sun. Check
  by sampling the pixel colours along the eye row and stating the values in
  the report.
- [ ] **Step 3: The share image.**
  - Rewrite `tools/share-image/share-image.marey` at 1200 × 630, with the dusk
    scene (sky, ridges, an awake sun) composed beside the wordmark and tagline,
    as the current file does.
  - Update its header's regeneration instructions to match.
  - Regenerate `public/og-image.png` with those instructions, keeping it under
    1 MB.
  - Rewrite `og:image:alt` in `index.html` to describe the new picture.
- [ ] **Step 4: Commit.** Run the four checks, then commit
  `feat(site): a dusk favicon and link-preview image`.

---

## Task 9: The measured browser check, export evidence, and execution notes (tier: integration)

Spec §9.5, §9.7.

**Files:**
- Create: `tools/visual-check/playground-check.mjs`
- Modify: `tools/visual-check/README.md` (one entry), `eval/RESULTS-PHASE-6.md` (a "6B" section), this plan (execution notes)

- [ ] **Step 1: Write `playground-check.mjs`.**
  - **Usage:** `node tools/visual-check/playground-check.mjs [--url http://localhost:5199]`
    against a running dev server.
  - **Viewports:** for each of `1440×900` and `390×844`, and each theme (set
    through the theme toggle or the `marey_theme` local-storage key before
    load), it:
    1. loads the app and waits for the status to read compiled;
    2. saves `.visual-check/6b/{desktop,phone}-{light,dark}.png`;
    3. asserts that no two visible controls inside `header[data-topbar]`
       have intersecting bounding boxes;
    4. asserts that the `[data-plate-frame]` aspect ratio equals 800/600 to
       within 1 px;
    5. asserts that `[data-caption-size]` reads `800 × 600` and
       `[data-caption-length]` reads `12 s`;
    6. opens Examples ▾ with Enter, presses ArrowDown, then presses Escape,
       and asserts the menu is closed and focus is on the button. On a phone,
       it does the same for `More`;
    7. collects console errors.
  - **Narrowest width:** it also loads at `320×640` and repeats check 3 only.
  - **Output:** it writes `.visual-check/6b/report.json`, with every
    assertion's result and every console error, and exits 1 if anything
    failed.
- [ ] **Step 2: Run it.** Report the `report.json` summary verbatim. Every
  assertion must pass.
- [ ] **Step 3: Red-run evidence.** Temporarily make the phone top bar
  overflow (for example, show the hidden status word). The overlap assertion
  must fail. Restore it.
- [ ] **Step 4: Export evidence.** After
  `npm run build:export-page && npm run build:cli`, run `marey export` for
  each of the four examples in each of `png`, `apng`, `webm`, `mp4` and
  `lottie`, writing into `.visual-check/6b/exports/`. Report each output line,
  and confirm every one exited 0. Then run `npm run check:export` and report
  its summary line, which must show all passed and unchanged.
- [ ] **Step 5: Record.**
  - Add a short "6B: the playground redesign" section to
    `eval/RESULTS-PHASE-6.md` with the summaries from Steps 2 and 4.
  - Add an entry for `playground-check.mjs` to `tools/visual-check/README.md`.
  - Append this plan's execution notes.
- [ ] **Step 6: Commit.** Run the four checks, kill the server and confirm the
  port is free. Commit `test(app): a measured layout check for the redesigned playground`.

**After Task 9:** the owner reviews the four screenshots and the default
scene playing (spec §9.8). 6B is done when the owner accepts them.

---

## Self-review

- **Spec coverage.**
  - §2 is covered by Tasks 1 and 3; §3 by Task 2; §4 by Tasks 6 and 7.
  - §5 is covered by Tasks 5 and 6; §6 by Task 4; §7 by Task 8; §8 by Task 1.
  - §9: items 1–4 are Tasks 4 and 5, item 5 is Task 9, item 6 is Task 1,
    item 7 is Task 9, item 8 is the owner's review after Task 9, and item 9
    is every task's commit step.
- **Types.**
  - `SceneInfo.fit` matches `IRFit`.
  - `plateRect` takes the same four fits.
  - `ExampleId` covers the registry's four IDs, and `loadExample(id)` takes
    an `ExampleId`.
- **Ordering.**
  - Task 4 deletes `defaultScene.test.ts`, and its four checks return,
    generalised to every example, in Task 5.
  - Task 6 removes `DEFAULT_CODE` only after Task 5's registry exists.

---

## Execution notes

Task 9 added `tools/visual-check/playground-check.mjs`, a Playwright check run
against the dev server. Its results and the export evidence are in
`eval/RESULTS-PHASE-6.md`, "6B: the playground redesign".

**Measured.**
- 33 assertions, 33 passed, 0 console errors, on four consecutive runs.
- The four screenshots are in `.visual-check/6b/`.
- `marey export` wrote all four examples in all five formats, 20 of 20 exiting 0.
- `npm run check:export` passed: `matrix: all passed  (134.8 s)`.

**Deviations from the task text.**
- The check also opens the Export menu on desktop (the spec asks for every menu).
- The overlap assertion alone cannot catch an overflowing flex row. A
  `min-width: 400px` on the Examples button pushed Examples, More and Run off
  the right edge at 320 and 390 px and the overlap assertion stayed green. The
  check therefore also asserts that every top-bar control lies inside the
  viewport. With that edit the new assertion failed; with `position: absolute`
  added, the overlap assertion failed too. Both edits were reverted.
- The first version of the menu check failed on roughly half of its runs. A menu
  is shown before an effect focuses its first item, so ArrowDown and Escape
  pressed straight after Enter could land on the trigger, leaving the menu open.
  The check now waits for focus to reach a menu item, presses ArrowDown, waits
  for focus to move to a different item, then presses Escape. This is a
  timing property of the script, not an application defect.
