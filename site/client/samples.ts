/**
 * Brings the page's `figure.sample` elements to life (the contract is in
 * `site/build/samples.ts`). Every kind gets a toolbar with Copy. `live`
 * samples also get the editor, a debounced compile and a player; `run`
 * samples a Run button; `solution` samples go live when their `details`
 * opens; `showcase` samples play on their own with the source behind a
 * disclosure. `error` and `fragment` samples stay static.
 *
 * Players come from the shared pool, never straight from `createElement`, so
 * a long page holds at most 12 of them.
 */
import "../../src/player";
import { compileSource } from "../../src/compiler/compileSource";
import { buildShareURLFor } from "../../src/lib/share";
import { createEditor, errorLocations, type Editor } from "./editor";
import { wireCopy } from "./nav";
import { sharedPool } from "./pool";

/** Quiet time after the last keystroke before the text is compiled. */
export const COMPILE_DELAY_MS = 400;
const FALLBACK_PLAYGROUND = "https://marey.pages.dev/";

type Mode = "live" | "run" | "error" | "fragment" | "solution" | "showcase";

let hints = 0;

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = make("button", "button button-small", label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

/** The playground, without a share fragment. */
function playgroundBase(figure: HTMLElement): string {
  const given = figure.dataset.playground;
  return given ? (given.split("#")[0] ?? FALLBACK_PLAYGROUND) : FALLBACK_PLAYGROUND;
}

function copyButton(text: () => string, select: () => void): HTMLButtonElement {
  const b = make("button", "button button-small copy-sample", "Copy");
  b.type = "button";
  b.setAttribute("aria-label", "Copy the code");
  wireCopy(b, text, select);
  return b;
}

function selectContents(node: Node): () => void {
  return () => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  };
}

function playgroundLink(figure: HTMLElement): HTMLAnchorElement | null {
  if (!figure.dataset.playground) return null;
  const a = make("a", "button button-small", "Open in playground");
  a.href = figure.dataset.playground;
  a.target = "_blank";
  a.rel = "noopener";
  return a;
}

function toolbar(...parts: Array<HTMLElement | null>): HTMLDivElement {
  const bar = make("div", "sample-toolbar");
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Sample controls");
  for (const p of parts) if (p) bar.append(p);
  return bar;
}

interface PlayerOptions {
  readonly autoplay: boolean;
}

/**
 * Hands a scene to the pool for `stage`. The scene's address is read when the
 * pool makes the player, so a player made late, or made again after the pool
 * took it away, plays the latest text.
 */
function requestPlayer(
  stage: HTMLElement,
  address: () => string,
  options: PlayerOptions,
  onSettled: () => void = () => undefined,
): void {
  sharedPool().request(stage, () => {
    const player = document.createElement("marey-player");
    player.controls = true;
    player.loop = true;
    player.autoplay = options.autoplay;
    player.addEventListener("ready", () => {
      player.classList.remove("is-failed");
      player.classList.add("is-ready");
      onSettled();
    });
    player.addEventListener("error", () => {
      player.classList.remove("is-ready");
      player.classList.add("is-failed");
      onSettled();
    });
    player.src = address();
    return player;
  });
}

function currentPlayer(stage: HTMLElement): HTMLElementTagNameMap["marey-player"] | null {
  return stage.querySelector("marey-player");
}

/**
 * A `blob:` address for a source text. A sample has one address for its
 * lifetime unless its text changes (live samples): run and showcase samples
 * keep theirs, because the pool may take their player away and make a new one
 * from the same address, and the cost is one small blob per sample on a page.
 *
 * `<marey-player>` fetches `src` asynchronously, so an address that was just
 * replaced may still be in flight. Replaced addresses are retired, and revoked
 * once the player has settled (`ready` or `error`), when a player is next made,
 * or at once when there is no player to be reading one.
 */
function blobSource(initial: string): {
  address: () => string;
  set: (text: string, stage: HTMLElement) => void;
  settled: () => void;
} {
  const make = (text: string): string => URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  let url = make(initial);
  let retired: string[] = [];
  const flush = (): void => {
    for (const old of retired) URL.revokeObjectURL(old);
    retired = [];
  };
  return {
    address: () => {
      flush();
      return url;
    },
    set(text, stage) {
      retired.push(url);
      url = make(text);
      const player = currentPlayer(stage);
      if (player) player.src = url;
      else flush();
    },
    settled: flush,
  };
}

function countLabel(n: number): string {
  return n === 1 ? "1 error" : `${n} errors`;
}

function enhanceLive(figure: HTMLElement): void {
  const source = figure.dataset.source ?? "";
  const stage = figure.querySelector<HTMLElement>(":scope > .sample-stage");
  const pre = figure.querySelector<HTMLElement>(":scope > pre.code");
  if (!stage || !pre) return;

  const scene = blobSource(source);
  requestPlayer(stage, scene.address, { autoplay: true }, scene.settled);

  const status = make("span", "sample-status is-ok", "Runs");
  status.setAttribute("role", "status");
  const errorList = make("ol", "sample-errors");
  errorList.hidden = true;
  const hint = make("span", "visually-hidden", "Press Escape, then Tab, to leave the editor.");
  hint.id = `editor-hint-${++hints}`;

  let editor: Editor;
  let timer = 0;
  let lastCompiled = source;

  const check = (): void => {
    window.clearTimeout(timer);
    const text = editor.getValue();
    const outcome = compileSource(text);
    if (outcome.ok) {
      errorList.hidden = true;
      errorList.replaceChildren();
      editor.markLines([]);
      stage.classList.remove("is-stale");
      status.textContent = "Runs";
      status.className = "sample-status is-ok";
      // Only a changed text goes to the player; Reset to the same text leaves it playing.
      if (text !== lastCompiled) {
        lastCompiled = text;
        scene.set(text, stage);
      }
      return;
    }
    const found = errorLocations(outcome.errors);
    errorList.replaceChildren(
      ...found.map((e) => {
        const item = make("li");
        if (e.line === 0) {
          item.textContent = e.message;
          return item;
        }
        const jump = make("button", "error-jump", `line ${e.line}, col ${e.col}: ${e.message}`);
        jump.type = "button";
        jump.addEventListener("click", () => editor.moveCaret(e.line, e.col));
        item.append(jump);
        return item;
      }),
    );
    errorList.hidden = false;
    editor.markLines(found.filter((e) => e.line > 0).map((e) => e.line));
    // The player keeps the last version that compiled, dimmed, until this one does.
    stage.classList.add("is-stale");
    status.textContent = countLabel(found.length);
    status.className = "sample-status is-error";
  };

  editor = createEditor(source, "Marey source", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(check, COMPILE_DELAY_MS);
  });
  editor.textarea.setAttribute("aria-describedby", hint.id);
  pre.replaceWith(editor.element);

  const reset = button("Reset", () => {
    editor.setValue(source);
    check();
  });
  const playground = playgroundLink(figure);
  const base = playgroundBase(figure);
  // The link follows the text: it is built when the reader is about to use it.
  const refreshLink = (): void => {
    if (!playground) return;
    const url = buildShareURLFor(base, editor.getValue());
    if (url === null) {
      playground.removeAttribute("href");
      playground.setAttribute("aria-disabled", "true");
      playground.title = "This text is too long for a share link.";
    } else {
      playground.href = url;
      playground.removeAttribute("aria-disabled");
      playground.removeAttribute("title");
    }
  };
  if (playground) {
    for (const type of ["pointerdown", "focus", "mouseover"] as const) playground.addEventListener(type, refreshLink);
    playground.addEventListener("click", (event) => {
      refreshLink();
      if (playground.getAttribute("aria-disabled") === "true") event.preventDefault();
    });
  }
  const copy = copyButton(() => editor.getValue(), () => editor.textarea.select());
  const bar = toolbar(status, reset, copy, playground);
  editor.element.after(hint, bar, errorList);
}

function enhanceRun(figure: HTMLElement): void {
  const source = figure.dataset.source ?? "";
  const stage = figure.querySelector<HTMLElement>(":scope > .sample-stage");
  const pre = figure.querySelector<HTMLElement>(":scope > pre.code");
  if (!stage || !pre) return;
  // The scene appears under the code, once asked for.
  stage.hidden = true;
  let started = false;
  const scene = blobSource(source);
  const run = button("Run", () => {
    if (!started) {
      started = true;
      stage.hidden = false;
      requestPlayer(stage, scene.address, { autoplay: true });
      run.textContent = "Restart";
      return;
    }
    currentPlayer(stage)?.restart();
  });
  const bar = toolbar(run, copyButton(() => source, selectContents(pre)), playgroundLink(figure));
  pre.after(bar);
  bar.after(stage);
}

function enhanceShowcase(figure: HTMLElement): void {
  const source = figure.dataset.source ?? "";
  const stage = figure.querySelector<HTMLElement>(":scope > .sample-stage");
  const pre = figure.querySelector<HTMLElement>(":scope > pre.code");
  if (!stage || !pre) return;
  const scene = blobSource(source);
  requestPlayer(stage, scene.address, { autoplay: true });
  const disclosure = make("details", "sample-source");
  disclosure.append(make("summary", undefined, "Show the source"));
  pre.replaceWith(disclosure);
  disclosure.append(pre);
  stage.after(toolbar(copyButton(() => source, selectContents(pre)), playgroundLink(figure)));
}

function enhanceStatic(figure: HTMLElement): void {
  const pre = figure.querySelector<HTMLElement>(":scope > pre.code");
  if (!pre) return;
  pre.after(toolbar(copyButton(() => figure.dataset.source ?? pre.textContent ?? "", selectContents(pre))));
}

function enhance(figure: HTMLElement): void {
  const mode = figure.dataset.mode as Mode | undefined;
  if (figure.dataset.enhanced === "true") return;
  figure.dataset.enhanced = "true";
  switch (mode) {
    case "live":
      enhanceLive(figure);
      break;
    case "run":
      enhanceRun(figure);
      break;
    case "showcase":
      enhanceShowcase(figure);
      break;
    case "solution": {
      // A solution is made live the first time it is opened, not when the page loads.
      const details = figure.closest("details");
      figure.dataset.enhanced = "";
      const start = (): void => {
        figure.dataset.enhanced = "true";
        enhanceLive(figure);
      };
      if (!details || details.open) start();
      else details.addEventListener("toggle", () => details.open && figure.dataset.enhanced !== "true" && start());
      break;
    }
    case "error":
    case "fragment":
      enhanceStatic(figure);
      break;
  }
}

export function initSamples(): void {
  for (const figure of document.querySelectorAll<HTMLElement>("figure.sample")) enhance(figure);
}
