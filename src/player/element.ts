import { PlayerController, PlayerError } from "./controller";
import type { PlayheadState } from "./controller";
import { formatTime, diagnosticLines } from "./format";
import { buildShareURLFor } from "../lib/share";
import { tickToTime } from "../compiler/sceneIR";
import type { CompilerError } from "../compiler/types";

/** The playground the "Open in playground" link points at, not the embedding page. */
const PLAYGROUND = "https://marey.pages.dev/";

const STYLE = `
:host { display: block; position: relative; aspect-ratio: var(--marey-aspect, 16 / 9); overflow: hidden; }
[hidden] { display: none !important; }
.stage { position: absolute; inset: 0; }
.stage canvas { display: block; width: 100%; height: 100%; }
.diagnostics {
  position: absolute; inset: 0; overflow: auto; box-sizing: border-box; padding: 12px;
  font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: #ffb4b4; background: rgba(20, 12, 12, 0.92);
}
[part=controls] {
  position: absolute; left: 0; right: 0; bottom: 0; display: flex; align-items: center; gap: 8px;
  padding: 6px 8px; font: 12px system-ui, sans-serif; color: #fff; background: rgba(0, 0, 0, 0.55);
}
[part=seek] { flex: 1; min-width: 0; }
[part=playground-link] { color: inherit; white-space: nowrap; }
`;

/**
 * `<marey-player>`: a thin DOM shell over `PlayerController`. The controller
 * owns playback and every async-ordering rule; this class owns the shadow
 * root, the controls, the visibility trigger and the events.
 *
 * The renderer (pixi.js and the physics engine) is reached only through the
 * one dynamic import below, so a page that defines the element and never
 * scrolls it into view downloads none of it.
 */
export class MareyPlayerElement extends HTMLElement {
  static observedAttributes = ["src", "autoplay", "loop", "controls"];

  private readonly controller: PlayerController;
  private readonly stage: HTMLDivElement;
  private readonly diagnostics: HTMLDivElement;
  private controlsEl: HTMLDivElement | null = null;
  private playButton!: HTMLButtonElement;
  private seek!: HTMLInputElement;
  private timeEl!: HTMLSpanElement;
  private observer: IntersectionObserver | null = null;
  private visible = false;
  /** True from connectedCallback, which starts the first load, until disconnectedCallback. */
  private loading = false;
  private shown: PlayheadState = { tick: 0, playing: false, endTick: null, reachedTick: 0 };

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLE;
    this.stage = document.createElement("div");
    this.stage.className = "stage";
    this.diagnostics = document.createElement("div");
    this.diagnostics.className = "diagnostics";
    this.diagnostics.setAttribute("role", "alert");
    this.diagnostics.hidden = true;
    root.append(style, this.stage, this.diagnostics);

    this.controller = new PlayerController({
      autoplay: () => this.autoplay,
      loop: () => this.loop,
      // Read at load time, so a changed preference applies to the next load.
      reducedMotion: () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      onReady: ({ width, height, duration }) => {
        this.diagnostics.hidden = true;
        // On the host's own style rather than in the shadow CSS, so a page
        // rule on aspect-ratio or height still wins.
        this.style.setProperty("--marey-aspect", String(width / height));
        this.dispatchEvent(new CustomEvent("ready", { detail: { width, height, duration } }));
      },
      onError: (code, message, errors) => this.showError(code, message, errors),
      onEnded: () => this.dispatchEvent(new Event("ended")),
      // A later mount can succeed after a font or render failure (the element
      // left view and came back), so the box from that failure goes.
      onMounted: () => {
        this.diagnostics.hidden = true;
        this.updateControls();
      },
      onState: (s) => {
        this.shown = s;
        this.updateControls();
      },
    });
    this.syncControls();
  }

  get src(): string {
    return this.getAttribute("src") ?? "";
  }
  set src(value: string) {
    this.setAttribute("src", value);
  }
  get autoplay(): boolean {
    return this.hasAttribute("autoplay");
  }
  set autoplay(value: boolean) {
    this.toggleAttribute("autoplay", value);
  }
  get loop(): boolean {
    return this.hasAttribute("loop");
  }
  set loop(value: boolean) {
    this.toggleAttribute("loop", value);
  }
  get controls(): boolean {
    return this.hasAttribute("controls");
  }
  set controls(value: boolean) {
    this.toggleAttribute("controls", value);
  }

  play(): void {
    this.controller.play();
  }
  pause(): void {
    this.controller.pause();
  }
  restart(): void {
    this.controller.restart();
  }
  get currentTime(): number {
    return this.controller.currentTime;
  }
  set currentTime(seconds: number) {
    this.controller.currentTime = seconds;
  }
  get duration(): number {
    return this.controller.duration;
  }
  get paused(): boolean {
    return this.controller.paused;
  }
  get errors(): ReadonlyArray<CompilerError> {
    return this.controller.errors;
  }

  /**
   * Test hook for the browser harness, on the global symbol registry so it
   * needs no import from this module. Not part of the documented surface.
   */
  get [Symbol.for("marey.player.debug")](): { liveFramesHash: (ticks: readonly number[]) => Promise<string> } {
    return {
      liveFramesHash: (ticks) => {
        const mounted = this.controller.mounted;
        if (!mounted) return Promise.reject(new Error("not mounted"));
        // The hook seeks and pauses the mount itself. Pausing through the
        // controller first clears a resume it had armed, which would
        // otherwise outlive the hook and report a paused embed as playing.
        this.controller.pause();
        return mounted.liveFramesHash(ticks);
      },
    };
  }

  connectedCallback(): void {
    this.observer = new IntersectionObserver(
      (entries) => {
        // Entries are queued in order; the last one is the current state.
        const latest = entries[entries.length - 1];
        if (!latest) return;
        this.visible = latest.isIntersecting;
        if (this.visible) this.attachRenderer();
        else this.controller.detach();
      },
      { rootMargin: "200px 0px" },
    );
    this.observer.observe(this);
    this.loading = true;
    void this.controller.load(() => this.loadSource());
  }

  disconnectedCallback(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.visible = false;
    this.loading = false;
    this.controller.detach();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;
    if (name === "controls") this.syncControls();
    // An upgrade delivers attributeChangedCallback("src") before
    // connectedCallback, with isConnected already true, so isConnected cannot
    // tell it from a real change: only reload once connectedCallback has
    // started the first load, or an embed would fetch twice.
    if (name === "src" && this.loading) {
      this.controller.detach();
      void this.controller.load(() => this.loadSource());
      // detach() cleared the controller's wish to be mounted; restore it if
      // the element is still on screen, since no observer entry will say so.
      if (this.visible) this.attachRenderer();
    }
  }

  /**
   * Called whenever the element is in view. It does not wait for the scene to
   * be ready: the controller remembers the mount function and mounts as soon
   * as a load finishes, which is what a still-loading scene needs.
   */
  private attachRenderer(): void {
    if (this.controller.mounted) return;
    void this.controller.attach((ir, start) => import("./render").then((m) => m.mountPlayer(this.stage, ir, start)));
  }

  private async loadSource(): Promise<string> {
    const src = this.getAttribute("src");
    if (src) {
      const url = new URL(src, document.baseURI).href;
      let res: Response;
      try {
        res = await fetch(url);
      } catch (e) {
        throw new PlayerError("PLAYER_FETCH_FAILED", `${e instanceof Error ? e.message : "network error"} ${url}`);
      }
      if (!res.ok) throw new PlayerError("PLAYER_FETCH_FAILED", `${res.status} ${url}`);
      return res.text();
    }
    // A parser-created element can be upgraded before its children exist.
    if (document.readyState === "loading") {
      await new Promise<void>((done) => document.addEventListener("DOMContentLoaded", () => done(), { once: true }));
    }
    const script = this.querySelector(':scope > script[type="text/marey"]');
    if (script) return script.textContent ?? "";
    throw new PlayerError("PLAYER_NO_SOURCE", 'Set the src attribute or add a <script type="text/marey"> child.');
  }

  private showError(code: string, message: string, errors: ReadonlyArray<CompilerError>): void {
    // Shown before it is filled, so the alert region announces its contents.
    this.diagnostics.hidden = false;
    this.diagnostics.replaceChildren(
      ...diagnosticLines(code, message, errors).map((line) => {
        const row = document.createElement("div");
        row.textContent = line;
        return row;
      }),
    );
    // A failed load leaves no scene: drop the previous one's time and share
    // link rather than keep showing them.
    if (!this.controller.ir) this.shown = { tick: 0, playing: false, endTick: null, reachedTick: 0 };
    this.updateControls();
    this.dispatchEvent(new CustomEvent("error", { detail: { code, errors } }));
  }

  /** Builds or removes the controls bar to match the `controls` attribute. */
  private syncControls(): void {
    if (!this.controls) {
      this.controlsEl?.remove();
      this.controlsEl = null;
      return;
    }
    if (this.controlsEl) return;
    const bar = document.createElement("div");
    bar.setAttribute("part", "controls");

    this.playButton = document.createElement("button");
    this.playButton.type = "button";
    this.playButton.setAttribute("part", "play");
    this.playButton.addEventListener("click", () => (this.controller.paused ? this.controller.play() : this.controller.pause()));

    this.seek = document.createElement("input");
    this.seek.type = "range";
    this.seek.min = "0";
    this.seek.step = "1";
    this.seek.setAttribute("part", "seek");
    this.seek.setAttribute("aria-label", "Seek");
    this.seek.addEventListener("input", () => {
      this.controller.currentTime = tickToTime(Number(this.seek.value));
    });

    this.timeEl = document.createElement("span");
    this.timeEl.setAttribute("part", "time");

    bar.append(this.playButton, this.seek, this.timeEl);
    this.controlsEl = bar;
    this.shadowRoot!.append(bar);
    this.updateControls();
  }

  private updateControls(): void {
    const bar = this.controlsEl;
    if (!bar) return;
    // The bar would paint over the diagnostic box, and has nothing to drive.
    bar.hidden = !this.diagnostics.hidden;
    const s = this.shown;
    this.playButton.setAttribute("aria-label", s.playing ? "Pause" : "Play");
    this.playButton.textContent = s.playing ? "⏸" : "▶";
    this.seek.max = String(s.endTick ?? s.reachedTick);
    this.seek.value = String(s.tick);
    this.timeEl.textContent = `${formatTime(tickToTime(s.tick))} / ${formatTime(this.controller.duration)}`;

    // The share link follows the loaded source and is omitted when the
    // source is too long to encode.
    const source = this.controller.source;
    let link = bar.querySelector<HTMLAnchorElement>("a[part=playground-link]");
    const href = source === null ? null : buildShareURLFor(PLAYGROUND, source);
    if (href === null) {
      link?.remove();
    } else {
      if (!link) {
        link = document.createElement("a");
        link.setAttribute("part", "playground-link");
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = "Open in playground";
        bar.append(link);
      }
      if (link.getAttribute("href") !== href) link.setAttribute("href", href);
    }
  }
}
