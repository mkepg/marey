import { describe, it, expect } from "vitest";
import { Container } from "pixi.js";
import { buildNode } from "./builder";
import { MatterWorld } from "./physicsWorld";
import { SceneRuntime } from "./sceneRuntime";
import { Playback, type PlaybackHost, type PlaybackState } from "./playback";
import { compileSource } from "../compileSource";
import { secondsToTicks, type IRAnimation, type IRObjectProps, type IRSceneNode } from "../sceneIR";
import { TICK_MS } from "./clock";

/*
 * The corpus is pulled in through `import.meta.glob`, not `node:fs`:
 * `tsconfig.app.json` type-checks `src/**` with browser types only, so
 * `import "node:fs"` would break `tsc -b` even though the test runs in Node
 * (the same reason `frameSampler.test.ts` gives).
 */
const SOURCES: Record<string, string> = {
  ...import.meta.glob("../../examples/*.marey", { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob("../../../eval/scenes-3b/*.marey", { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob("../../../tools/visual-check/scenes/*.marey", { query: "?raw", import: "default", eager: true }),
};

/** `../../examples/x.marey` → `src/examples/x.marey`; `../../../eval/…` → `eval/…`. */
function repoPath(globKey: string): string {
  if (globKey.startsWith("../../../")) return globKey.slice("../../../".length);
  return `src/${globKey.slice("../../".length)}`;
}

function compile(source: string): IRSceneNode {
  const out = compileSource(source);
  if (!out.ir) throw new Error(`fixture did not compile: ${out.errors.map((e) => e.message).join("; ")}`);
  return out.ir;
}

function hasText(ir: IRSceneNode): boolean {
  return Object.values(ir.registry).some((n) => n.props.kind === "text");
}

/** Every animation an object declares: direct, in a sequence, or in a parallel step. */
function animationsOf(props: IRObjectProps): IRAnimation[] {
  const out: IRAnimation[] = [...props.animations];
  for (const seq of props.sequences) {
    for (const step of seq.steps) {
      if ("type" in step) {
        for (const inner of step.steps) if ("property" in inner) out.push(inner);
      } else if ("property" in step) {
        out.push(step);
      }
    }
  }
  return out;
}

function hasSequence(ir: IRSceneNode): boolean {
  return Object.values(ir.registry).some((n) => n.props.sequences.length > 0);
}

function hasHandoff(ir: IRSceneNode): boolean {
  return Object.values(ir.registry).some((n) => animationsOf(n.props).some((a) => a.handoff));
}

function hasPhysics(ir: IRSceneNode): boolean {
  return Object.values(ir.registry).some(
    (n) => n.props.physics !== undefined
      || n.props.sequences.some((s) => s.steps.some((st) =>
        "type" in st ? st.steps.some((x) => !("property" in x)) : !("property" in st))),
  );
}

interface CorpusScene { readonly name: string; readonly ir: IRSceneNode }

const INCLUDED: CorpusScene[] = [];
const SKIPPED: Array<{ name: string; reason: string }> = [];
const ENTRIES = Object.entries(SOURCES).map(([key, source]) => [repoPath(key), source] as const);
for (const [name, source] of ENTRIES.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
  const out = compileSource(source);
  if (!out.ir) SKIPPED.push({ name, reason: "does not compile" });
  else if (hasText(out.ir)) SKIPPED.push({ name, reason: "text (needs a DOM)" });
  else INCLUDED.push({ name, ir: out.ir });
}

/**
 * Owns nothing but the tree it is handed, like the adapter will. `runtime` is
 * the runtime of the tree currently attached, so a test can ask it `isIdle()`;
 * `referenceHash` builds too, and its build is never attached.
 */
class TestHost implements PlaybackHost {
  builds = 0;
  renders = 0;
  root: Container | null = null;
  runtime: SceneRuntime | null = null;
  private readonly built = new Map<Container, SceneRuntime>();
  private readonly ir: IRSceneNode;
  constructor(ir: IRSceneNode) { this.ir = ir; }
  build() {
    this.builds++;
    const root = new Container();
    for (const n of this.ir.children) root.addChild(buildNode(n));
    const runtime = new SceneRuntime(new MatterWorld(this.ir.width, this.ir.height), root);
    this.built.set(root, runtime);
    return { root, runtime };
  }
  attach(root: Container) {
    this.root?.destroy({ children: true });
    this.root = root;
    this.runtime = this.built.get(root) ?? null;
  }
  render() { this.renders++; }
}

function endTickOf(ir: IRSceneNode): number | null {
  return ir.duration === null ? null : secondsToTicks(ir.duration);
}

/** Bursts of 1, 7 and 12 ticks with sub-tick remainders near 0.25, 0.5 and 0.75. */
const LIVE_DELTAS = [1.25 * TICK_MS, 7.5 * TICK_MS, 12.75 * TICK_MS];

/** Four seconds, with a position animation and a body under gravity, so every tick differs. */
const FIXTURE = `
scene {
  size: (400, 300)
  duration: 4
  circle mover {
    position: (40, 60), radius: 10, color: cyan
    animate { property: position, to: (360, 60), duration: 3, easing: easeInOut }
  }
  rectangle faller {
    position: (200, 40), size: (30, 30), color: orange
    physics { gravity: (0, 900), bounce: 0.4, duration: indefinitely, collideBounds: true }
  }
}
`;

describe("Playback · seeking equals playing, on every first-party scene without text", () => {
  it("covers a corpus that can tell the paths apart", () => {
    const names = INCLUDED.map((s) => s.name);
    expect(names).toContain("src/examples/physics-pile.marey");
    expect(INCLUDED.filter((s) => hasSequence(s.ir)).length).toBeGreaterThan(0);
    expect(INCLUDED.filter((s) => hasHandoff(s.ir)).length).toBeGreaterThan(0);
    expect(INCLUDED.filter((s) => hasPhysics(s.ir)).length).toBeGreaterThan(0);
    // Pinned, so a scene cannot drop out of the comparison unnoticed: a source
    // that stops compiling or gains a `text` block has to be listed here.
    expect(SKIPPED).toEqual([
      { name: "eval/scenes-3b/bar-chart.marey", reason: "text (needs a DOM)" },
      { name: "eval/scenes-3b/timeline-ticks.marey", reason: "text (needs a DOM)" },
      { name: "src/examples/bar-chart-reveal.marey", reason: "text (needs a DOM)" },
      { name: "src/examples/logo-reveal.marey", reason: "text (needs a DOM)" },
      { name: "tools/visual-check/scenes/bars-reveal.marey", reason: "text (needs a DOM)" },
      { name: "tools/visual-check/scenes/hello-face.marey", reason: "text (needs a DOM)" },
      { name: "tools/visual-check/scenes/lottie-text-ascii.marey", reason: "text (needs a DOM)" },
      { name: "tools/visual-check/scenes/lottie-text-ligature.marey", reason: "text (needs a DOM)" },
      { name: "tools/visual-check/scenes/lottie-text-mark.marey", reason: "text (needs a DOM)" },
      { name: "tools/visual-check/scenes/lottie-text-multiline.marey", reason: "text (needs a DOM)" },
      { name: "tools/visual-check/scenes/lottie-text-scaled.marey", reason: "text (needs a DOM)" },
      { name: "tools/visual-check/scenes/origin-physics.marey", reason: "text (needs a DOM)" },
      { name: "tools/visual-check/scenes/ring-pulse.marey", reason: "text (needs a DOM)" },
      { name: "tools/visual-check/scenes/test-card.marey", reason: "text (needs a DOM)" },
      { name: "tools/visual-check/scenes/timeline-sweep.marey", reason: "text (needs a DOM)" },
      { name: "tools/visual-check/scenes/wave-row.marey", reason: "text (needs a DOM)" },
    ]);
  });

  it.each(INCLUDED.map((s) => [s.name, s] as const))("%s", (name, { ir }) => {
    const endTick = endTickOf(ir);
    const T = Math.min(endTick ?? 480, 480);

    const straight = new Playback(new TestHost(ir), endTick, { tick: T, playing: false });
    expect(straight.getState().tick, `${name}: straight tick`).toBe(T);
    expect(straight.snapshotHash(), `${name}: straight`).toBe(straight.referenceHash(T));
    straight.destroy();

    // An indefinite scene's seek clamps to the furthest tick reached, so its
    // jumps start from a construction at T (which reaches T) rather than at 0.
    const jumpy = endTick === null
      ? new Playback(new TestHost(ir), endTick, { tick: T, playing: false })
      : new Playback(new TestHost(ir), endTick);
    if (endTick !== null) {
      jumpy.seek(T);
      jumpy.frame(0);
    }
    jumpy.seek(Math.floor(T / 3));
    jumpy.frame(0);
    expect(jumpy.getState().tick, `${name}: jumpy back`).toBe(Math.floor(T / 3));
    jumpy.seek(T);
    jumpy.frame(0);
    expect(jumpy.getState().tick, `${name}: jumpy tick`).toBe(T);
    expect(jumpy.snapshotHash(), `${name}: jumpy`).toBe(jumpy.referenceHash(T));
    jumpy.destroy();

    const live = new Playback(new TestHost(ir), endTick);
    live.play();
    for (let i = 0; live.getState().tick < T && live.getState().playing; i++) {
      if (i > 10_000) throw new Error(`${name}: live playback never reached ${T}`);
      live.frame(LIVE_DELTAS[i % LIVE_DELTAS.length]);
    }
    live.pause();
    const P = live.getState().tick;
    expect(P, `${name}: live advanced`).toBeGreaterThan(0);
    expect(live.snapshotHash(), `${name}: live at ${P}`).toBe(live.referenceHash(P));
    live.destroy();
  });
});

describe("Playback · seek", () => {
  it("continues forward without a rebuild and rebuilds going backward", () => {
    const host = new TestHost(compile(FIXTURE));
    const pb = new Playback(host, 480);
    expect(host.builds).toBe(1);
    pb.seek(100);
    expect(pb.hasPendingSeek()).toBe(true);
    pb.frame(0);
    expect(pb.hasPendingSeek()).toBe(false);
    expect(pb.getState().tick).toBe(100);
    expect(host.builds).toBe(1);
    pb.seek(40);
    pb.frame(0);
    expect(host.builds).toBe(2);
    expect(pb.getState().tick).toBe(40);
    expect(pb.snapshotHash()).toBe(pb.referenceHash(40));
  });

  it("performs only the latest of a burst of seeks, as one replay", () => {
    const host = new TestHost(compile(FIXTURE));
    // Start past every target, so each seek in the burst but one is backward
    // and performing them all would rebuild three times.
    const pb = new Playback(host, 480, { tick: 400, playing: false });
    pb.seek(300);
    pb.seek(10);
    pb.seek(200);
    pb.seek(50);
    const before = host.builds;
    pb.frame(0);
    expect(host.builds - before).toBe(1);
    expect(pb.getState().tick).toBe(50);
    expect(pb.getState().reachedTick).toBe(400);
    expect(pb.snapshotHash()).toBe(pb.referenceHash(50));
  });
});

describe("Playback · the end of a scene", () => {
  it("stops at endTick, paints the exact tick there, and plays again from zero", () => {
    const ir = compile(FIXTURE);
    const pb = new Playback(new TestHost(ir), 240);
    pb.play();
    // 240 is a multiple of the 12-tick cap a 1000 ms frame is held to, so
    // without an offset the bursts would land on 240 exactly and the end
    // would never have to cut one short. Five ticks first (5.5 ticks' worth of
    // milliseconds: exactly 5 can round down to 4), and 5 + 12k skips 240.
    pb.frame(5.5 * TICK_MS);
    expect(pb.getState().tick).toBe(5);
    for (let i = 0; pb.getState().playing; i++) {
      if (i > 100) throw new Error("never stopped");
      pb.frame(1000);
      expect(pb.getState().tick).toBeLessThanOrEqual(240);
    }
    expect(pb.getState()).toEqual({ tick: 240, playing: false, endTick: 240, reachedTick: 240 });
    expect(pb.snapshotHash()).toBe(pb.referenceHash(240));
    pb.play();
    expect(pb.getState().tick).toBe(0);
    expect(pb.getState().playing).toBe(true);
  });

  it("pauses an indefinite scene on the frame it goes idle, and play continues from there", () => {
    const host = new TestHost(compile(`
scene {
  size: (400, 300)
  circle dot {
    position: (40, 60), radius: 10, color: cyan
    animate { property: position, to: (360, 60), duration: 0.5 }
  }
}
`));
    const pb = new Playback(host, null);
    pb.play();
    let stoppedAt = -1;
    for (let i = 0; i < 1000; i++) {
      pb.frame(TICK_MS);
      const idle = host.runtime!.isIdle();
      const { playing, tick } = pb.getState();
      // The playhead pauses exactly when the runtime first reports idle.
      expect(playing, `tick ${tick}`).toBe(!idle);
      if (!playing) { stoppedAt = tick; break; }
    }
    expect(stoppedAt).toBeGreaterThanOrEqual(secondsToTicks(0.5));
    const s = pb.getState();
    expect(s.reachedTick).toBe(s.tick);
    expect(s.endTick).toBeNull();
    expect(pb.snapshotHash()).toBe(pb.referenceHash(stoppedAt));

    pb.seek(s.reachedTick + 50);
    pb.frame(0);
    expect(pb.getState().tick).toBe(stoppedAt);
    expect(pb.getState().reachedTick).toBe(stoppedAt);

    pb.play();
    expect(pb.getState().tick).toBe(stoppedAt);
    pb.frame(TICK_MS);
    expect(pb.getState().tick).toBe(stoppedAt + 1);
    expect(pb.getState().reachedTick).toBe(stoppedAt + 1);
  });

  it("keeps a paused playhead when a longer scene replaces a shorter one, and continues forward", () => {
    const ir = compile(FIXTURE);
    const first = new Playback(new TestHost(ir), 240, { tick: 240, playing: false });
    const { tick, playing } = first.getState();
    expect({ tick, playing }).toEqual({ tick: 240, playing: false });
    first.destroy();

    const second = new Playback(new TestHost(ir), 480, { tick, playing });
    expect(second.getState().tick).toBe(240);
    expect(second.getState().playing).toBe(false);
    second.play();
    second.frame(TICK_MS);
    expect(second.getState().tick).toBe(241);
  });

  it("clamps a start beyond a shorter scene to its end, paused", () => {
    const pb = new Playback(new TestHost(compile(FIXTURE)), 240, { tick: 400, playing: true });
    expect(pb.getState().tick).toBe(240);
    expect(pb.getState().playing).toBe(false);
  });
});

describe("Playback · state", () => {
  it("notifies every change with the new values, until unsubscribed", () => {
    const pb = new Playback(new TestHost(compile(FIXTURE)), 240);
    const seen: PlaybackState[] = [];
    const unsubscribe = pb.subscribe((s) => seen.push(s));

    pb.play();
    expect(seen.at(-1)).toEqual({ tick: 0, playing: true, endTick: 240, reachedTick: 0 });
    pb.pause();
    expect(seen.at(-1)).toEqual({ tick: 0, playing: false, endTick: 240, reachedTick: 0 });
    pb.seek(100);
    const beforeSeekFrame = seen.length;
    pb.frame(0);
    expect(seen.length).toBe(beforeSeekFrame + 1);
    expect(seen.at(-1)).toEqual({ tick: 100, playing: false, endTick: 240, reachedTick: 100 });
    pb.play();
    for (let i = 0; pb.getState().playing && i < 100; i++) pb.frame(1000);
    expect(seen.at(-1)).toEqual({ tick: 240, playing: false, endTick: 240, reachedTick: 240 });

    unsubscribe();
    const count = seen.length;
    pb.play();
    pb.pause();
    expect(seen.length).toBe(count);
  });

  it("restart replays to zero and plays, while a performed seek to zero stays paused", () => {
    const host = new TestHost(compile(FIXTURE));
    const pb = new Playback(host, 480);
    pb.seek(150);
    pb.frame(0);
    expect(pb.getState()).toMatchObject({ tick: 150, playing: false });
    const before = host.builds;

    pb.restart();
    expect(pb.getState()).toMatchObject({ tick: 0, playing: true });
    expect(host.builds).toBe(before + 1);
    expect(pb.snapshotHash()).toBe(pb.referenceHash(0));
    pb.frame(TICK_MS * 1.5);
    expect(pb.getState().tick).toBe(1);

    // A performed seek pauses, so seek(0) followed by play() is not a restart.
    pb.seek(0);
    pb.play();
    pb.frame(0);
    expect(pb.getState()).toMatchObject({ tick: 0, playing: false });
    // Tick 0 is the sampler's frame 0, the tree as built.
    expect(pb.snapshotHash()).toBe(pb.referenceHash(0));
  });
});
