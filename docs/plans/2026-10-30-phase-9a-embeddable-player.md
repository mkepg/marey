# Phase 9A — Embeddable Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `<marey-player>`, a custom element that compiles and plays Marey source in any page, as the `marey-lang/player` entry of the package.

**Architecture:**
- The element's behaviour lives in a headless `PlayerController` that runs under Node. It owns:
  - loading and compile;
  - the stored playhead;
  - poster frames and reduced motion;
  - `currentTime` semantics, loop and `ended`;
  - the generation guards.
- The DOM element is a thin shell around it.
- The renderer is a separately loaded chunk. It wraps a scene-mounting function extracted from the playground's adapter, so the playground and the player run one copy of the code that turns IR into a playing stage.
- Each element holds a WebGL context only while it is near the viewport. Deterministic replay restores its playhead when it returns.

**Tech Stack:**
- TypeScript (strict);
- Custom Elements with Shadow DOM;
- PixiJS 8 and Matter.js 0.20 through the existing renderer;
- a Vite 8 library build;
- Vitest (Node environment);
- Playwright Chromium for the browser checks.

**Spec:** `docs/specs/2026-10-30-marey-phase-9a-embeddable-player-design.md`. Every task implicitly includes its §0 decisions P1–P10.

## Global Constraints

- Commit subjects are Conventional Commits, with `9a` as the scope where it fits: `feat(9a): …`, `test(9a): …`, `docs(9a): …`. Commit messages carry no tool attribution and no `Co-Authored-By` trailer.
- Stage paths explicitly and read `git diff --staged` before committing. Never use `git add -A`, `git add .` or `git add -f`.
- All four checks must pass before every commit:
  - `npm test`
  - `npx vitest run --config eval/vitest.config.ts`
  - `npm run build`
  - `npm run build:cli && node bin/marey.mjs check $(git ls-files '*.marey')`
- Run commands from `C:\Users\gomez\...` with a capital drive letter. A lower-case `c:` makes vitest report "no tests" (`docs/engineering-lessons.md` §6).
- `core.autocrlf` is on. Judge change with `git diff --stat -- <path>`, never with `git status`.
- No committed path or wording names an AI tool, a coding assistant or a plugin.
- Never delete `netlify.toml`, and never add `public/_redirects`.
- Browser checks that need the playground use `npx vite --port 5199 --strictPort`. Kill the server afterwards and confirm the port is free (`netstat -ano | findstr :5199` prints nothing).
- Every browser claim is a measured number or hash compared against a reference. "The file plays" is not evidence.
- Error codes are exactly these: `PLAYER_NO_SOURCE`, `PLAYER_FETCH_FAILED`, `PLAYER_COMPILE_FAILED`, `PLAYER_FONT_UNAVAILABLE`, `PLAYER_RENDER_FAILED`.
- Event names are exactly `ready`, `ended` and `error`. The test hook key is exactly `Symbol.for("marey.player.debug")`.
- The playground URL in the share link is exactly `https://marey.pages.dev/`.
- Nothing under `src/player/` imports `pixi.js`, `matter-js` or any `src/compiler/renderer/` module statically, type imports included. The single exception is the dynamic `import("./render")` in `element.ts`.
- The playground's frame hashes must not move: `src/compiler/renderer/sceneFrameHashes.test.ts` and the snapshot file stay byte-unchanged.

## Review Focus

1. **An element removed from the DOM while its fetch or its renderer import is still in flight** must mount nothing and leak no WebGL context. The controller test is "a mount that resolves after detach is destroyed" (Task 3).
2. **`src` changed twice in quick succession**, with responses arriving out of order, must show only the last scene and fire `ready` once, for it. The controller test is "a superseded load is discarded" (Task 3).
3. **`currentTime` set before `ready`** must not throw and must not apply to the scene that loads later. The controller test is "currentTime before load is ignored" (Task 3).
4. **`loop` on an indefinite scene** must do nothing: no `ended`, no restart. The controller test is "loop and ended ignore an indefinite scene" (Task 3).
5. **An embed that is never scrolled near** must still fire `ready` and must never request the renderer chunk. The harness check is "far players have no canvas and no render-chunk request" (Task 7).

---

## File map

| File | Responsibility |
|---|---|
| `src/compiler/sceneIR.ts` (modify) | Adds `timeToTick`, `tickToTime`: playhead position conversions |
| `src/lib/share.ts` (modify) | Adds `buildShareURLFor(base, code)`; `buildShareURL` delegates to it |
| `src/compiler/renderer/mountScene.ts` (create) | Mounts an IR on an `Application` it does not own; returns playback + cleanup |
| `src/compiler/renderer/adapter.ts` (modify) | The playground's shared-app adapter, now calling `mountScene` |
| `src/compiler/renderer/playback.ts` (modify) | Adds `snapshot()` for the test hook |
| `src/player/controller.ts` (create) | Headless element behaviour (Node-testable) |
| `src/player/format.ts` (create) | `formatTime`, `diagnosticLines`: pure text helpers |
| `src/player/render.ts` (create) | Lazy chunk: one `Application` per element, font load, `mountScene`, context release |
| `src/player/element.ts` (create) | `MareyPlayerElement`: DOM, shadow root, controls, observers, events, test hook |
| `src/player/index.ts` (create) | Defines `marey-player` once; the package entry |
| `src/player/boundary.test.ts` (create) | Static-import boundary of the player entry |
| `vite.player.config.ts`, `tsconfig.player.json` (create) | Build to `dist/player/` |
| `tools/cli-check/pack-check.mjs` (modify) | Player resolution, Chromium load, no-pixi entry, file-count assertion |
| `tools/visual-check/player-check.mjs`, `tools/visual-check/player/*.html` (create) | Browser exit criteria 2–6 |
| `README.md`, `eval/RESULTS-PHASE-9A.md`, docs status lines (modify/create) | Documentation and evidence |

---

### Task 1: Position conversions and an explicit-base share URL

**Files:**
- Modify: `src/compiler/sceneIR.ts:18-21`
- Modify: `src/compiler/sceneIR.test.ts`
- Modify: `src/lib/share.ts:111-116`
- Create: `src/lib/share.test.ts`

**Interfaces:**
- Produces: `timeToTick(seconds: number): number` and `tickToTime(tick: number): number` from `src/compiler/sceneIR.ts`.
- Produces: `buildShareURLFor(base: string, code: string): string | null` from `src/lib/share.ts`.

- [ ] **Step 1: Write failing tests.** Add to `sceneIR.test.ts`:

```ts
describe("playhead position conversions", () => {
  it("maps 0 s to tick 0, where secondsToTicks floors at 1", () => {
    expect(timeToTick(0)).toBe(0);
    expect(secondsToTicks(0)).toBe(1);
  });
  it("rounds to the nearest tick", () => {
    expect(timeToTick(1)).toBe(120);
    expect(timeToTick(0.004)).toBe(0);
    expect(timeToTick(0.0045)).toBe(1);
  });
  it("clamps negatives to 0", () => { expect(timeToTick(-3)).toBe(0); });
  it("tickToTime inverts timeToTick on whole ticks", () => {
    for (const t of [0, 1, 37, 120, 840]) expect(timeToTick(tickToTime(t))).toBe(t);
    expect(tickToTime(240)).toBe(2);
  });
});
```

Create `src/lib/share.test.ts`:

```ts
describe("buildShareURLFor", () => {
  it("appends the #code= fragment decodeCode reads back", () => {
    const url = buildShareURLFor("https://marey.pages.dev/", "scene { size: (10, 10) }")!;
    expect(url.startsWith("https://marey.pages.dev/#code=")).toBe(true);
    expect(decodeCode(url.split("#code=")[1])).toBe("scene { size: (10, 10) }");
  });
  it("returns null when the source is too long to share", () => {
    let big = ""; let seed = 1;
    while (big.length < 40_000) { seed = (seed * 48271) % 2147483647; big += seed.toString(36); }
    expect(buildShareURLFor("https://marey.pages.dev/", big)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail.**
  - Run: `npx vitest run src/compiler/sceneIR.test.ts src/lib/share.test.ts`
  - Expected: FAIL, because `timeToTick` and `buildShareURLFor` are not exported.
- [ ] **Step 3: Implement.**
  - `timeToTick` is `Math.max(0, Math.round(seconds * TICK_HZ))`. `tickToTime` is `tick / TICK_HZ`.
  - Extend `secondsToTicks`'s doc comment to say why there are two kinds of conversion. It converts a *duration*, which floors at one tick. The new pair converts a *position*, where tick 0 exists (spec §3.3).
  - `buildShareURLFor(base, code)` returns `` `${base}#${HASH_PREFIX}${encoded}` ``, or `null` when `encodeCode` returns null.
  - `buildShareURL(code)` becomes `buildShareURLFor(origin + pathname, code)`.
- [ ] **Step 4: Run the tests and confirm they pass.** Run the same command. Expected: PASS.
- [ ] **Step 5: Run the four checks and commit.** Commit with `feat(9a): position conversions for a playhead and a share URL with an explicit base`.

---

### Task 2: Extract `mountScene` from the playground adapter

**Files:**
- Create: `src/compiler/renderer/mountScene.ts`
- Modify: `src/compiler/renderer/adapter.ts` (the `render()` body from creating `sceneRoot` through building `control`, today lines 91–190)
- Modify: `src/compiler/renderer/playback.ts` (add `snapshot()`)
- Modify: `src/compiler/renderer/playback.test.ts`
- Modify: `docs/architecture/renderer.md` (one paragraph naming `mountScene` as the single IR-to-stage path)

**Interfaces:**
- Produces: in `mountScene.ts`,

  ```ts
  export interface MountedScene { readonly playback: LivePlayback; cleanup(): void }
  export function mountScene(app: Application, scene: IRSceneNode, host: HTMLElement, start?: PlaybackStart): MountedScene
  ```

  `LivePlayback` moves from `adapter.ts` into `mountScene.ts`. `adapter.ts` and `renderer/index.ts` re-export it under the same name, so every current importer still compiles.
- Produces: `Playback.snapshot(): ObjectSnapshot[]`, which is `snapshotFor` of the tree on screen.

**What moves and what stays:**
- `mountScene` owns these, each exactly as written today:
  - the scene root, background and bounds mask;
  - `updateLayout` with its `ResizeObserver`;
  - `app.resizeTo = host`;
  - the `PlaybackHost`, the `Playback` and the ticker callback, which stops `app.ticker` when the scene is paused with no pending seek;
  - `wake`, the controller object and the initial `wake()`.
- Every `sharedApp` reference inside the moved code becomes the `app` parameter.
- Its `cleanup()` does these:
  - disconnects the observer;
  - destroys the playback;
  - destroys its own `sceneRoot`;
  - removes its own ticker callback.
- The adapter keeps:
  - the font race;
  - `sharedAppReady` and `initSharedApp`;
  - attaching the canvas to the host;
  - removing the previous render's stage children;
  - the `activeTickerCallback` bookkeeping, now read from a `tickerCallback` field that `MountedScene` does not expose.

  To keep the "stale cleanup must not stop a newer render's ticker" rule, the adapter compares render generations instead: a module-level counter, captured per render. Its `cleanup` calls `mounted.cleanup()`, then `app.ticker.stop()` only if its generation is still the latest.

- [ ] **Step 1: Write a failing test.** In `playback.test.ts`, use the existing fake host:

```ts
it("snapshot() reads the tree on screen, and agrees with snapshotHash", () => {
  // build a Playback on an existing text-free fixture, seek to 37, frame(0)
  expect(hashFrames([{ index: 0, tick: 37, objects: pb.snapshot() }])).toBe(pb.snapshotHash());
});
```

- [ ] **Step 2: Run it and confirm it fails.**
  - Run: `npx vitest run src/compiler/renderer/playback.test.ts`
  - Expected: FAIL, because `snapshot` does not exist.
- [ ] **Step 3: Implement.**
  - Add `snapshot()` to `Playback`, and redefine `snapshotHash()` through it.
  - Create `mountScene.ts` and move the code as described above.
  - Do not change any statement's order relative to the others. This is a move, and the playground's behaviour is the specification.
- [ ] **Step 4: Run the full suite.**
  - Run: `npm test`
  - Expected: PASS. `sceneFrameHashes.test.ts` and `playback.test.ts` pass unmodified apart from the new test. `git diff --stat -- src/compiler/__snapshots__ src/compiler/renderer/sceneFrameHashes.test.ts` shows nothing.
- [ ] **Step 5: Check the playground in the browser.**
  - Start `npx vite --port 5199 --strictPort`.
  - Run: `node tools/visual-check/transport-check.mjs --out .visual-check/phase9a/transport`
  - Expected: exit 0, every requirement in `report.json` `pass: true`.
  - Kill the server and confirm port 5199 is free. Record the pass count in the task report.
- [ ] **Step 6: Run the four checks and commit.** Commit with `refactor(9a): extract mountScene so the playground and the player share one IR-to-stage path`.

---

### Task 3: `PlayerController`, the headless behaviour

**Files:**
- Create: `src/player/controller.ts`
- Create: `src/player/controller.test.ts`
- Create: `src/player/format.ts`
- Create: `src/player/format.test.ts`

**Interfaces:**
- Consumes:
  - `compile` from `src/package/index.ts`;
  - `secondsToTicks`, `timeToTick` and `tickToTime` from `src/compiler/sceneIR.ts`;
  - the `IRSceneNode` and `CompilerError` types.
- Produces: everything below, exported from `controller.ts`. It imports nothing from `pixi.js` or `src/compiler/renderer/`.

```ts
export type PlayerErrorCode =
  | "PLAYER_NO_SOURCE" | "PLAYER_FETCH_FAILED" | "PLAYER_COMPILE_FAILED"
  | "PLAYER_FONT_UNAVAILABLE" | "PLAYER_RENDER_FAILED";
export class PlayerError extends Error { constructor(readonly code: PlayerErrorCode, message: string) }

/** Structurally identical to renderer/playback.ts's PlaybackState; redeclared to keep the boundary. */
export interface PlayheadState { readonly tick: number; readonly playing: boolean; readonly endTick: number | null; readonly reachedTick: number }

export interface PlayerMount {
  play(): void; pause(): void; seek(tick: number): void; restart(): void;
  subscribe(listener: (s: PlayheadState) => void): () => void;
  getState(): PlayheadState;
  liveFramesHash(ticks: readonly number[]): Promise<string>;
  destroy(): void;
}
export type MountFn = (ir: IRSceneNode, start: { tick: number; playing: boolean }) => Promise<PlayerMount>;
export type SourceLoader = () => Promise<string>; // rejects with PlayerError for NO_SOURCE / FETCH_FAILED

export interface ControllerOptions {
  autoplay: () => boolean; loop: () => boolean; reducedMotion: () => boolean;
  onReady(info: { width: number; height: number; duration: number }): void;
  onError(code: PlayerErrorCode, message: string, errors: ReadonlyArray<CompilerError>): void;
  onEnded(): void;
  onState(s: PlayheadState): void;   // for the controls UI; also fired on detach/attach
}

export class PlayerController {
  constructor(options: ControllerOptions);
  load(loader: SourceLoader): Promise<void>;
  attach(mount: MountFn): Promise<void>;   // element entered view
  detach(): void;                           // element left view or disconnected
  play(): void; pause(): void; restart(): void;
  get currentTime(): number;  set currentTime(seconds: number);
  get duration(): number;     // NaN before ready; Infinity when indefinite
  get paused(): boolean;
  get errors(): ReadonlyArray<CompilerError>;
  get ir(): IRSceneNode | null;
  get source(): string | null;              // for the share link
  get mounted(): PlayerMount | null;        // for the test hook
}
```

**Rules the tests pin (spec §3.3–§3.5, §4.4–§4.5, P10):**
- The **poster tick** is `endTick` for a bounded scene and 0 for an indefinite one. `endTick` is `secondsToTicks(ir.duration)`.
- **After a load, the stored playhead** is `{ tick: 0, playing: true }` when `autoplay() && !reducedMotion()`. Otherwise it is `{ tick: poster, playing: false }`.
- **`ready` fires** once per successful load, straight after compile, with `duration` equal to `ir.duration ?? Infinity`.
- **`attach` mounts** with the stored playhead. `detach` stores `{ tick, playing }` from the mount's state and destroys the mount. For an indefinite scene it stores `{ tick: 0, playing }` (spec §4.4).
- **Generation guards:**
  - Every `load` increments a generation. A loader or compile that finishes for an older generation is dropped, with no event.
  - A mount that resolves after `detach`, or after a newer `load`, is destroyed at once and never becomes `mounted`.
- **`currentTime` set:**
  - It is ignored before ready.
  - Otherwise the target is `clamp(timeToTick(s), 0, endTick ?? reachedTick)`. The getter returns `tickToTime(target)` immediately.
  - If mounted, it calls `seek`. If the scene was playing and the target is not `endTick`, it calls `play()` on the first state notification whose tick equals the target.
  - If not mounted, it updates the stored playhead.
- **Ended:**
  - A state notification with `endTick !== null`, `tick === endTick` and `playing === false`, following one with `playing === true`, is an ending.
  - With `loop()` true the controller calls `restart()`. Otherwise it fires `onEnded`.
  - Both are ignored for an indefinite scene.
- **Errors:**
  - A loader rejection with a `PlayerError` reports that error's code.
  - A failed compile reports `PLAYER_COMPILE_FAILED` with `errors` set.
  - A mount rejection with a `PlayerError` reports its code. Any other mount rejection is `PLAYER_RENDER_FAILED`.
  - `ready` is not retracted.

- [ ] **Step 1: Write failing tests.** In `controller.test.ts`, write a `FakeMount` implementing `PlayerMount` that records calls and lets the test push states. Source fixtures are inline strings. `BOUNDED` is a 2 s scene with one animated circle; `INDEFINITE` is the same scene with no `duration`. The tests:
  - `autoplay without reduced motion mounts at tick 0, playing` → the mount's start equals `{ tick: 0, playing: true }`.
  - `reduced motion shows the poster: last tick of a bounded scene, paused` → `{ tick: 240, playing: false }`, and `paused === true`.
  - `no autoplay on an indefinite scene shows tick 0, paused` → `{ tick: 0, playing: false }`.
  - `ready fires once, after compile, before any attach` → `onReady` is called once with `{ width, height, duration: 2 }`, and `mounted` is null.
  - `duration is NaN before ready and Infinity when indefinite`.
  - `detach stores the playhead; attach restores it` → push the state `{ tick: 90, playing: true }`, detach, attach, and the new start is `{ tick: 90, playing: true }`. The first mount's `destroy` was called.
  - `an indefinite scene restarts from tick 0 after leaving view` → `{ tick: 0, playing: true }`.
  - `a mount that resolves after detach is destroyed` (Review Focus 1) → the deferred mount resolves after `detach()`, its `destroy` is called once, and `mounted` is null.
  - `a superseded load is discarded` (Review Focus 2) → two loads with deferred loaders, resolved in reverse order. `onReady` is called once, with the second scene's size, and `source` is the second text.
  - `currentTime before load is ignored` (Review Focus 3) → setting it to 1 does not throw, and after the load the start tick is the poster.
  - `currentTime set while playing keeps playing` → `seek(120)` is called, the getter returns 1 at once, and `play()` is called after a pushed state with tick 120.
  - `currentTime = 0 seeks tick 0`, and `currentTime = 99 clamps to endTick`.
  - `currentTime set while detached updates the stored playhead` → the next attach starts at that tick.
  - `ended fires once when a playing bounded scene reaches endTick`. `with loop, restart() is called instead`.
  - `loop and ended ignore an indefinite scene` (Review Focus 4).
  - `compile failure reports PLAYER_COMPILE_FAILED with the compiler's errors`.
  - `a loader's PlayerError keeps its code` (`PLAYER_FETCH_FAILED`).
  - `a non-PlayerError mount rejection is PLAYER_RENDER_FAILED`, and a `PlayerError("PLAYER_FONT_UNAVAILABLE", …)` rejection keeps its code.

  In `format.test.ts`:
  - `formatTime(0) === "0:00"`, `formatTime(65.4) === "1:05"`, `formatTime(Infinity) === "∞"`.
  - `diagnosticLines(code, message, errors)` returns `[code + ": " + message, ...errors.map(e => \`${e.line}:${e.column} ${e.message}\`)]`. Check `CompilerError`'s real field names in `src/compiler/types.ts` and use them. The compiler's message already starts with its `[CODE]`.
- [ ] **Step 2: Run the tests and confirm they fail.**
  - Run: `npx vitest run src/player`
  - Expected: FAIL, because the modules don't exist.
- [ ] **Step 3: Implement `controller.ts` and `format.ts`** to the interface and rules above.
- [ ] **Step 4: Run the tests and confirm they pass.**
  - Run: `npx vitest run src/player`
  - Expected: PASS. Also revert the generation guard temporarily and confirm that Review Focus tests 1 and 2 fail (lesson §2). Record that in the report.
- [ ] **Step 5: Run the four checks and commit.** Commit with `feat(9a): headless player controller with poster frames, generation guards and video-like currentTime`.

---

### Task 4: The lazy render chunk

**Files:**
- Create: `src/player/render.ts`

**Interfaces:**
- Consumes: `mountScene` and `LivePlayback` (Task 2), `PlayerMount` and `PlayerError` (Task 3), `exportFontSizes` and `exportFontSpec` from `src/compiler/export/exportFonts.ts`, `hashFrames`, and `Playback.snapshot()`.
- Produces:

  ```ts
  export async function mountPlayer(
    host: HTMLDivElement,
    ir: IRSceneNode,
    start: { tick: number; playing: boolean },
  ): Promise<PlayerMount>
  ```

**Behaviour:**
- **Fonts first.** If `exportFontSizes(ir)` is non-empty, load the face once per page: a module-level promise wrapping `new FontFace("JetBrains Mono", \`url(${FONT_URL})\`)`, then `face.load()` and `document.fonts.add(face)`.
  - `FONT_URL` is `new URL(FONT_FILE, import.meta.url).href`, where `const FONT_FILE = "./fonts/JetBrainsMono-Regular.ttf"`. It must be a variable, not a literal: Vite rewrites `new URL("literal", import.meta.url)` and, in library mode, inlines the asset as base64. Task 6 emits the file.
  - Then, for every size, `document.fonts.check(exportFontSpec(size))` must be true. If not, throw `PlayerError("PLAYER_FONT_UNAVAILABLE", …)`. There is no timeout race (P9).
  - A failed load resets the module promise, so a later element can retry.
- **Application.**
  - Create `new Application()` per call and `init` it with the playground's options: `backgroundAlpha: 0`, `antialias: true`, `resolution: window.devicePixelRatio || 1`, `autoDensity: true`, `autoStart: true`.
  - Append `app.canvas` to `host`, then `mountScene(app, ir, host, start)`.
  - Any throw from `init` or the mount becomes `PlayerError("PLAYER_RENDER_FAILED", <message>)`, after the app is destroyed.
- **The returned `PlayerMount`** delegates `play`, `pause`, `seek`, `restart`, `subscribe` and `getState` to `mounted.playback`.
  - `liveFramesHash(ticks)`: pause, then for each tick in order call `playback.inner.seek(tick)` and `playback.inner.frame(0)`, which performs the pending seek, and collect `{ index: i, tick, objects: playback.inner.snapshot() }`. Return `hashFrames(frames)`. These are the field names and order `sampleFrames` uses.
  - `destroy()`, in this order:
    1. `mounted.cleanup()`;
    2. take the `WEBGL_lose_context` extension from the renderer's `gl`, if it exists;
    3. `app.destroy({ removeView: true }, { children: true, texture: true })`;
    4. call `loseContext()` on that extension, which releases the context now rather than at garbage collection (spec §4.4).

No unit test. This module needs WebGL and is proven by Task 7's criteria 2, 3 and 5. Task 5 imports it.

- [ ] **Step 1: Implement `render.ts`** as above.
- [ ] **Step 2: Typecheck.** Run `npx tsc -b --noEmit`. Expected: no errors.
- [ ] **Step 3: Run the four checks and commit.** Commit with `feat(9a): per-element renderer chunk that loads the scene font and releases its WebGL context`.

---

### Task 5: The custom element

**Files:**
- Create: `src/player/element.ts`
- Create: `src/player/index.ts`
- Create: `src/player/boundary.test.ts`

**Interfaces:**
- Consumes: `PlayerController` (Task 3), `formatTime` and `diagnosticLines` (Task 3), `buildShareURLFor` and `encodeCode` (Task 1), `compile` indirectly, and `import("./render")` for `mountPlayer` (Task 4).
- Produces:
  - `export class MareyPlayerElement extends HTMLElement`;
  - `index.ts`, which does `if (!customElements.get("marey-player")) customElements.define("marey-player", MareyPlayerElement)`, exports the class, and declares `HTMLElementTagNameMap["marey-player"]`.

**Behaviour (spec §3, §4.4–§4.6):**
- `observedAttributes` is `["src", "autoplay", "loop", "controls"]`. Boolean properties `autoplay`, `loop` and `controls`, and the string property `src`, reflect their attributes.
- Methods and getters delegate to the controller: `play()`, `pause()`, `restart()`, `currentTime` (get and set), `duration`, `paused` and `errors`.
- **Source loader:**
  - With `src`, it `fetch`es `new URL(src, document.baseURI)`. A non-2xx response or a network failure throws `PlayerError("PLAYER_FETCH_FAILED", \`${status} ${url}\`)`.
  - Otherwise it uses the text of the first `:scope > script[type="text/marey"]` child.
  - Otherwise it throws `PlayerError("PLAYER_NO_SOURCE", …)`.
  - Changing `src` while connected calls `controller.load` again, after `detach()`.
- **Shadow root**, open, containing:
  - a `div.stage` for the canvas, filling the host;
  - a `div.diagnostics` (`role="alert"`) that is hidden until an error and holds `diagnosticLines` as one `<div>` per line in a monospace font;
  - a `div[part=controls]`, present only when `controls` is set, holding:
    - `button[part=play]`, whose `aria-label` is "Play" or "Pause";
    - `input[type=range][part=seek]` with `min=0`, `max = endTick ?? reachedTick`, `step=1` and `value = tick`, whose `input` event sets `currentTime = tickToTime(value)`;
    - `span[part=time]` showing `formatTime(current) / formatTime(duration)`;
    - `a[part=playground-link]` with `target=_blank`, `rel=noopener` and the text "Open in playground". Its `href` is `buildShareURLFor("https://marey.pages.dev/", source)`, and the anchor is omitted when that is null.
  - Host CSS is `:host { display: block; position: relative; aspect-ratio: var(--marey-aspect, 16 / 9) }`. On `ready`, set `--marey-aspect` to `width / height` on the host's own style, so a page rule on `aspect-ratio` or `height` still wins.
- **Visibility:**
  - On connect, an `IntersectionObserver` is created with `rootMargin: "200px 0px"`.
  - When the element is intersecting, it is ready and not mounted, it calls `controller.attach((ir, start) => import("./render").then(m => m.mountPlayer(stageDiv, ir, start)))`.
  - When it is not intersecting, it calls `controller.detach()`.
  - `disconnectedCallback` disconnects the observer and calls `detach()`.
- **Reduced motion:** the `reducedMotion` option reads `matchMedia("(prefers-reduced-motion: reduce)").matches` at load time.
- **Events:** `ready` (`detail` `{ width, height, duration }`), `ended`, and `error` (`detail` `{ code, errors }`), all dispatched on the host. They are not composed and do not bubble, matching `<video>`'s media events.
- **Test hook:** `this[Symbol.for("marey.player.debug")]` is a getter returning `{ liveFramesHash: (ticks) => controller.mounted?.liveFramesHash(ticks) ?? Promise.reject(new Error("not mounted")) }`. Use the global symbol registry. Do not document it in the README.

- [ ] **Step 1: Write a failing boundary test.** `src/player/boundary.test.ts` reuses the walk from `src/package/boundary.test.ts`, with `src/player/*.ts`, `src/lib/share.ts`, `src/compiler/**`, `src/package/*.ts` in `SOURCES`. The specifier regex skips `import(`. Assert:
  - `reads every file the entry reaches` → `unread` is empty;
  - `never statically reaches the renderer` → no reached file under `../compiler/renderer/`, and `pixi.js` and `matter-js` are not in `packages`;
  - `the renderer is reached only through the one dynamic import` → `element.ts`'s raw text matches `/import\(\s*["']\.\/render["']\s*\)/` exactly once, and no other `src/player` file contains `import(`.
- [ ] **Step 2: Run it and confirm it fails.**
  - Run: `npx vitest run src/player/boundary.test.ts`
  - Expected: FAIL, because `index.ts` does not exist.
- [ ] **Step 3: Implement `element.ts` and `index.ts`.** `element.ts` runs only in a browser, and nothing under Node imports it. The vitest walk reads it as text.
- [ ] **Step 4: Run it and confirm it passes.**
  - Run: `npx vitest run src/player` and `npx tsc -b --noEmit`.
  - Expected: PASS and no errors.
- [ ] **Step 5: Run the four checks and commit.** Commit with `feat(9a): the marey-player custom element`.

---

### Task 6: Build and package

**Files:**
- Create: `vite.player.config.ts`
- Create: `tsconfig.player.json`
- Modify: `tools/build/fix-dts-extensions.mjs`, which takes its root directory as an optional argv; the default stays `dist/lib/types`
- Modify: `package.json`
- Modify: `tools/cli-check/pack-check.mjs`
- Modify: `.gitignore` only if `dist/player/` is not already covered by `dist/`

**Interfaces:**
- Produces:
  - `dist/player/marey-player.mjs`, the entry;
  - `dist/player/render-<hash>.mjs`, plus any shared chunks, flat in `dist/player/`;
  - `dist/player/fonts/JetBrainsMono-Regular.ttf`;
  - the licences file from `thirdPartyLicenses`;
  - `dist/player/types/player/index.d.ts`.

**Build:**
- `vite.player.config.ts` builds in library mode:
  - entry `src/player/index.ts`, `formats: ["es"]`, `fileName: () => "marey-player.mjs"`;
  - `outDir: "dist/player"`, `emptyOutDir: true`, `copyPublicDir: false`, `target: "es2022"`;
  - `rolldownOptions.output.chunkFileNames: "[name]-[hash].mjs"`, with code splitting left on.
- Plugins:
  - `thirdPartyLicenses({ projectRoot: resolve(".") })`;
  - an emit plugin for `fonts/JetBrainsMono-Regular.ttf`, copied from `vite.exportpage.config.ts`'s `exportFont`.
- Check the exact option name for output chunk names under Vite 8 against the installed version. `vite.config.ts` and the build's warning text name `rolldownOptions`.
- `tsconfig.player.json` mirrors `tsconfig.lib.json`, with `"lib": ["ES2022", "DOM", "DOM.Iterable"]`, `include: ["src/player/index.ts"]` and `outDir: "dist/player/types"`.
- `package.json`:
  - `"build:player": "vite build --config vite.player.config.ts && tsc -p tsconfig.player.json && node tools/build/fix-dts-extensions.mjs dist/player/types"`;
  - `build:package` runs `build:player` after `build:lib`;
  - `exports["./player"] = { "types": "./dist/player/types/player/index.d.ts", "import": "./dist/player/marey-player.mjs" }`;
  - `files` gains `"dist/player/"`.

**`pack-check.mjs` additions,** after the library import check. Update the header comment's numbered list.
- `marey-lang/player resolves through exports`:
  - `node --input-type=module -e "console.log(import.meta.resolve('marey-lang/player'))"`, run in `installDir`;
  - expect a `file:` URL ending `node_modules/marey-lang/dist/player/marey-player.mjs`.
- `player entry chunk holds no PixiJS`: the installed `marey-player.mjs` text does not include `"pixi"`, the same test as the library's.
- `player draws an inline scene in Chromium`:
  - Start a `node:http` static server on port 0, serving the installed `dist/player/` and one generated `index.html`.
  - That page has `<script type="module" src="./marey-player.mjs">` and `<marey-player autoplay>` with an inline 2 s scene of one circle.
  - Launch `chromium` from `playwright-core`, the repository's own, with `EXPORT_LAUNCH_ARGS` copied as a literal array and a comment naming `src/cli/exportDriver.ts`. Wait up to 20 s for `ready`, then for a `<canvas>` in the shadow root.
  - Fail on any `pageerror` or console error.
  - Close the browser and the server in `finally`.
- `tarball file count`:
  - `EXPECTED_FILE_COUNT` is a constant, with a comment saying it must change whenever `files` or a build's outputs change.
  - Set it to the count measured on this task's own run, and record that count in the report. The tarball's own file list is the reference, and the number is not decided in advance.

- [ ] **Step 1: Implement the configs, scripts and `package.json`.**
- [ ] **Step 2: Build.**
  - Run: `npm run build:player`, then list `dist/player/` and its sizes.
  - Expected: the entry, at least one `render-*.mjs`, the font, a licences file and the declarations. `grep -c pixi dist/player/marey-player.mjs` prints 0. No base64 `font/ttf` data URL appears in any chunk.
- [ ] **Step 3: Run the pack check.**
  - Run: `npm run check:pack`
  - Expected: every line is `ok`, including the four new ones.
- [ ] **Step 4: Run the four checks and commit.** Commit with `feat(9a): build and ship the player as marey-lang/player, with a browser load and file-count check in check:pack`.

---

### Task 7: The browser harness for exit criteria 2–6

**Files:**
- Create: `tools/visual-check/player-check.mjs`
- Create: `tools/visual-check/player/agreement.html`
- Create: `tools/visual-check/player/many.html`
- Create: `tools/visual-check/player/errors.html`
- Modify: `tools/visual-check/README.md` (a "Checking the player" section, in the style of "Checking playback")

**Interfaces:**
- Consumes:
  - the built `dist/player/` (Task 6);
  - `bin/marey.mjs export`, after `npm run build:export-page && npm run build:cli`;
  - the test hook (Task 5).

**What the script does:**
- It builds the player.
- It serves the repository root through a `node:http` static server on an ephemeral port that the script starts and closes itself. No Vite server is involved, and the report prints the port it used and freed.
- It launches Playwright Chromium with `--use-angle=swiftshader --enable-unsafe-swiftshader --use-gl=angle`.
- It writes `report.json` to `--out`, default `.visual-check/phase9a/player`.
- It exits 1 on any failed requirement or page error.

**Requirements:**
1. **Agreement** (criterion 2). Scenes:
   - `src/examples/physics-pile.marey` (physics);
   - `docs/media/bars-reveal.marey` (reveal);
   - `src/examples/bar-chart-reveal.marey` (text).

   For each, run `node bin/marey.mjs export <scene> --format lottie --fps 30 --out <tmp>/x.json` and parse `N frames` and `frames <hash>` from the printed line. In the page, `liveFramesHash` over the ticks `[0, 4, 8, …, 4*(N-1)]` must equal that hash. Record both hashes.
2. **Context budget and far players** (criterion 3, Review Focus 5). `many.html` holds 24 `autoplay` players stacked at 400 px tall each, over the pile and bars scenes alternately.
   - At load: players more than about 2 screens down have no `<canvas>` in their shadow root, every player has fired `ready`, and the network log holds no `render-*.mjs` request until the first player intersects. Record the order of the requests.
   - Pause player 0 at tick 200 through `currentTime` and record `liveFramesHash([200])`. Then scroll to the bottom in 400 px steps with a 150 ms settle.
   - At the bottom: every player in view has a canvas, and `webglcontextlost` was never observed on a player in view. The page attaches the listener to each canvas as it appears.
   - Scroll back to the top. Player 0's `liveFramesHash([200])` equals the recorded value.
3. **Reduced motion** (criterion 4). With `page.emulateMedia({ reducedMotion: "reduce" })`, an `autoplay` bars player reports `paused === true` and `currentTime === duration`.
4. **Errors** (criterion 5), in `errors.html`:
   - a type-error scene → `error.detail.code === "PLAYER_COMPILE_FAILED"`, and the shadow root's diagnostics text contains the compiler's `[TYPE_` code and `line:`;
   - `src="missing.marey"` → `PLAYER_FETCH_FAILED`;
   - a text scene loaded after `page.route("**/JetBrainsMono-Regular.ttf", r => r.abort())` → `PLAYER_FONT_UNAVAILABLE`;
   - a player with no source → `PLAYER_NO_SOURCE`.
5. **currentTime** (criterion 6). On a playing bars player, `el.currentTime = 1` gives `currentTime === 1` immediately and `paused === false` 300 ms later. `el.currentTime = 0` followed by `pause()` gives `liveFramesHash([0])` equal to the CLI's frame-0 hash for the same scene. Compute that with a one-frame export (`--duration 0.25 --fps 4`: frame 0 is tick 0) and parse its `frames` hash.

- [ ] **Step 1: Write the pages and the script.**
- [ ] **Step 2: Run the harness.**
  - Run: `node tools/visual-check/player-check.mjs`
  - Expected: exit 0, every requirement `pass: true`.
  - If a requirement fails, debug it with superpowers:systematic-debugging. Do not weaken the requirement.
  - Look at the screenshots the script saves: one of the agreement page and one of the bottom of the many-player page. Describe what they show in the report.
- [ ] **Step 3: Revert-check one requirement.** Temporarily make `render.ts`'s `destroy()` skip `loseContext()` and the app destroy. Re-run requirement 2 and confirm it fails, or record exactly why it does not. Then restore the code (lesson §2).
- [ ] **Step 4: Run the four checks and commit.** Commit with `test(9a): browser harness for the player's agreement with export, context budget, reduced motion and errors`.

---

### Task 8: Documentation, evidence and version

**Files:**
- Modify: `README.md` (new "Embed a scene" section after "As a library")
- Create: `eval/RESULTS-PHASE-9A.md`
- Modify: `docs/architecture/README.md` (Phase 9A status paragraph, above the Phase 8 paragraph)
- Modify: `docs/architecture/roadmap-and-process.md` (Phase 9A bullet, with the same status, in the same edit)
- Modify: `package.json` (`"version": "0.6.0"`), and `package-lock.json` through `npm install --package-lock-only`

**Content:**
- **README "Embed a scene":**
  - the two snippets from spec §1, with the version written `0.6.0`;
  - the attribute table (§3.2);
  - one sentence each on the poster frame and reduced motion, and on events and errors, listing the five codes;
  - the 16-context note (§4.4);
  - the Chromium scope of agreement with export (§2);
  - the framework sentence from §6 criterion 9.
  - Do not mention the test hook. Do not claim any framework that was not run.
- **`RESULTS-PHASE-9A.md`**, in the format of `eval/RESULTS-PHASE-8.md`: one section per exit criterion, each with its command and measured output. It includes:
  - check:pack's new lines;
  - player-check's `report.json` summary, with the hashes;
  - the transport-check pass from Task 2;
  - the sizes of `marey-player.mjs` and `render-*.mjs`, raw and gzipped, measured with `node -e` and `zlib.gzipSync` (criterion 8);
  - the four checks' counts.
- **Status lines:** "9A — embeddable player is done on `phase-9a-player`", with a pointer to the spec, the plan and the evidence. Say that 0.6.0 awaits the owner's `npm publish --ignore-scripts`.

- [ ] **Step 1: Write the docs, measure the sizes and fill in the evidence.**
- [ ] **Step 2: Check the docs.** Run `npx vitest run src/compiler/languageDocs.test.ts`. Expected: PASS. If it compiles README `marey` blocks, the new HTML snippets are not `marey` blocks.
- [ ] **Step 3: Run the four checks plus `npm run check:pack`.** Expected: all pass, and check:pack prints `0.6.0`.
- [ ] **Step 4: Commit.** Use `docs(9a): embed guide, Phase 9A evidence, and 0.6.0`.

---

## Execution notes

(Filled in during execution: rulings, deferrals, measured numbers that differ from the plan's expectations.)
