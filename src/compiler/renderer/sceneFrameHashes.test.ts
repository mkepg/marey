import { describe, it, expect } from "vitest";
import { Container } from "pixi.js";
import { buildNode } from "./builder";
import { createWorldForScene } from "./physicsWorld";
import { SceneRuntime } from "./sceneRuntime";
import { sampleFrames } from "./frameSampler";
import { hashFrames } from "../export/frameHash";
import { planExport } from "../export/exportContract";
import { compileSource } from "../compileSource";
import type { IRSceneNode } from "../sceneIR";

/*
 * Sampled-frame hashes of every first-party scene. The first 25 entries were
 * taken before Phase 8 changed anything (spec E3); the rest were added in
 * Phase 10A so that every later change to the language is judged against a
 * recorded "before". A red here means existing output moved: find out why
 * before touching BASELINE.
 *
 * The corpus is every tracked .marey file, pulled in through import.meta.glob
 * (src/** type-checks with browser types only, so node:fs is not available).
 * Dot-directories (git-ignored local state such as .visual-check and .worktrees),
 * node_modules, dist and demo/ (git-ignored local scratch) hold no tracked
 * scene and are excluded.
 *
 * Each BASELINE value is one of:
 *   - an 8-hex hash of 4 s at 30 fps;
 *   - "text": the scene has text, which needs a DOM, so it is not hashed here;
 *   - "error": the scene must fail to compile (a deliberate error sample).
 * The table is closed: a new scene needs an entry, and a removed one must go.
 */
const SOURCES: Record<string, string> = import.meta.glob(
  [
    "../../../**/*.marey",
    "!../../../node_modules/**",
    "!../../../dist/**",
    "!../../../.*/**",
    "!../../../demo/**",
  ],
  { query: "?raw", import: "default", eager: true },
);

function hasText(ir: IRSceneNode): boolean {
  return Object.values(ir.registry).some((n) => n.props.kind === "text");
}

/** 4 s at 30 fps, overriding the scene's own length so indefinite scenes have an end. */
function hashScene(ir: IRSceneNode): string {
  const root = new Container();
  for (const node of ir.children) root.addChild(buildNode(node));
  const runtime = new SceneRuntime(createWorldForScene(ir), root);
  const planned = planExport(ir, { fps: 30, durationSeconds: 4 });
  if (!planned.ok) throw new Error(planned.diagnostics.map((d) => d.message).join("; "));
  return hashFrames(sampleFrames(runtime, root, planned.plan));
}

const BASELINE: Readonly<Record<string, string>> = {
  "../../../docs/media/bars-reveal.marey": "43daf7ed",
  "../../../docs/research/2026-09-24-export-quality-probes/edge-band/text-stem.marey": "text",
  "../../../eval/scenes-3b/bar-chart.marey": "text",
  "../../../eval/scenes-3b/compound-logo.marey": "39dfd698",
  "../../../eval/scenes-3b/radial-dots.marey": "16109237",
  "../../../eval/scenes-3b/timeline-ticks.marey": "text",
  "../../../eval/scenes-r2/arc-row.marey": "efb158e3",
  "../../../eval/scenes-r2/bar-chart.marey": "26e2c16b",
  "../../../eval/scenes-r2/collide-stack.marey": "9333816c",
  "../../../eval/scenes-r2/cross-fade.marey": "9da3d089",
  "../../../eval/scenes-r2/drop-ball.marey": "59c21a99",
  "../../../eval/scenes-r2/fade-then-drop.marey": "e35a3882",
  "../../../eval/scenes-r2/fade-title.marey": "text",
  "../../../eval/scenes-r2/freeze-mid.marey": "50d91413",
  "../../../eval/scenes-r2/grid-16.marey": "31aacdaf",
  "../../../eval/scenes-r2/param-easing.marey": "ade13aeb",
  "../../../eval/scenes-r2/pulse-dot.marey": "496d226f",
  "../../../eval/scenes-r2/radial-dots.marey": "ede3658f",
  "../../../eval/scenes-r2/repeated-badge.marey": "3ca13e27",
  "../../../eval/scenes-r2/scale-ramp.marey": "497be997",
  "../../../eval/scenes-r2/slide-card.marey": "19227344",
  "../../../eval/scenes-r2/spin-triangle.marey": "4688688c",
  "../../../eval/scenes-r2/stagger-bars.marey": "5fc1433a",
  "../../../eval/scenes-r2/three-act.marey": "9403aca0",
  "../../../eval/scenes-r2/throw-arc.marey": "a23fe813",
  "../../../eval/scenes-r2/timeline-ticks.marey": "ec55ded3",
  "../../../eval/scenes/arc-row.marey": "text",
  "../../../eval/scenes/bar-chart.marey": "text",
  "../../../eval/scenes/collide-stack.marey": "5149a23e",
  "../../../eval/scenes/cross-fade.marey": "01745c81",
  "../../../eval/scenes/drop-ball.marey": "c7228d4a",
  "../../../eval/scenes/fade-then-drop.marey": "190b948a",
  "../../../eval/scenes/fade-title.marey": "text",
  "../../../eval/scenes/freeze-mid.marey": "dcad5e8b",
  "../../../eval/scenes/grid-16.marey": "3484e16f",
  "../../../eval/scenes/param-easing.marey": "text",
  "../../../eval/scenes/pulse-dot.marey": "83af4d37",
  "../../../eval/scenes/radial-dots.marey": "30b0eacb",
  "../../../eval/scenes/repeated-badge.marey": "3dd2df8f",
  "../../../eval/scenes/scale-ramp.marey": "text",
  "../../../eval/scenes/slide-card.marey": "19227344",
  "../../../eval/scenes/spin-triangle.marey": "013d9036",
  "../../../eval/scenes/stagger-bars.marey": "0a974a0c",
  "../../../eval/scenes/three-act.marey": "7b06fec7",
  "../../../eval/scenes/throw-arc.marey": "38c19e07",
  "../../../eval/scenes/timeline-ticks.marey": "text",
  "../../../examples/starter/hello.marey": "6166ea56",
  "../../../site/gallery/aurora.marey": "fc3c6e30",
  "../../../site/gallery/day-to-night.marey": "e593bfb3",
  "../../../site/gallery/domino-run.marey": "b77f71d6",
  "../../../site/gallery/easing-race.marey": "text",
  "../../../site/gallery/fireworks.marey": "eca6dc52",
  "../../../site/gallery/forest.marey": "d679d5fc",
  "../../../site/gallery/hourglass.marey": "fea19796",
  "../../../site/gallery/lighthouse.marey": "db91b0cf",
  "../../../site/gallery/metronome.marey": "ce519e9f",
  "../../../site/gallery/orrery.marey": "text",
  "../../../site/gallery/plinko.marey": "text",
  "../../../site/gallery/postcard.marey": "text",
  "../../../site/gallery/ripple.marey": "d0184acb",
  "../../../site/gallery/set-sail.marey": "text",
  "../../../site/gallery/spring-cards.marey": "text",
  "../../../site/gallery/sunrise.marey": "1d86398c",
  "../../../site/gallery/title-card.marey": "text",
  "../../../site/gallery/toy-box.marey": "text",
  "../../../tools/share-image/share-image.marey": "text",
  "../../../tools/visual-check/scenes/bars-reveal.marey": "text",
  "../../../tools/visual-check/scenes/color-sequence.marey": "text",
  "../../../tools/visual-check/scenes/fit-contain.marey": "7251531b",
  "../../../tools/visual-check/scenes/fit-cover.marey": "7251531b",
  "../../../tools/visual-check/scenes/fit-fill.marey": "7251531b",
  "../../../tools/visual-check/scenes/fit-none.marey": "7251531b",
  "../../../tools/visual-check/scenes/freeze-midair.marey": "cebbb6db",
  "../../../tools/visual-check/scenes/freeze.marey": "79a41153",
  "../../../tools/visual-check/scenes/ghost.marey": "b7fbd35a",
  "../../../tools/visual-check/scenes/hello-face.marey": "text",
  "../../../tools/visual-check/scenes/idle.marey": "89812134",
  "../../../tools/visual-check/scenes/linear-motion.marey": "03ed227f",
  "../../../tools/visual-check/scenes/logo-freeze.marey": "6470848b",
  "../../../tools/visual-check/scenes/logo.marey": "d6d24f1e",
  "../../../tools/visual-check/scenes/lottie-ease-handoff-yoyo.marey": "cb330345",
  "../../../tools/visual-check/scenes/lottie-ease-handoff.marey": "9e1427cf",
  "../../../tools/visual-check/scenes/lottie-ease-in.marey": "19c03279",
  "../../../tools/visual-check/scenes/lottie-ease-inout.marey": "378aa964",
  "../../../tools/visual-check/scenes/lottie-ease-linear.marey": "1105d04e",
  "../../../tools/visual-check/scenes/lottie-ease-out.marey": "a2bdf655",
  "../../../tools/visual-check/scenes/lottie-easing-halfframe.marey": "6842c45c",
  "../../../tools/visual-check/scenes/lottie-layer-order.marey": "486ce2fb",
  "../../../tools/visual-check/scenes/lottie-line-caps.marey": "7a1c0af7",
  "../../../tools/visual-check/scenes/lottie-line-miter.marey": "53c47bff",
  "../../../tools/visual-check/scenes/lottie-line-scale.marey": "a840db9f",
  "../../../tools/visual-check/scenes/lottie-opacity-flatten.marey": "0e715d13",
  "../../../tools/visual-check/scenes/lottie-outpoint.marey": "44e44158",
  "../../../tools/visual-check/scenes/lottie-text-ascii.marey": "text",
  "../../../tools/visual-check/scenes/lottie-text-ligature.marey": "text",
  "../../../tools/visual-check/scenes/lottie-text-mark.marey": "text",
  "../../../tools/visual-check/scenes/lottie-text-multiline.marey": "text",
  "../../../tools/visual-check/scenes/lottie-text-scaled.marey": "text",
  "../../../tools/visual-check/scenes/lottie-version-field.marey": "28d446a7",
  "../../../tools/visual-check/scenes/origin-physics.marey": "text",
  "../../../tools/visual-check/scenes/pile.marey": "1d3fae36",
  "../../../tools/visual-check/scenes/ring-pulse.marey": "text",
  "../../../tools/visual-check/scenes/spring-from.marey": "59bc2edc",
  "../../../tools/visual-check/scenes/test-card.marey": "text",
  "../../../tools/visual-check/scenes/timeline-sweep.marey": "text",
  "../../../tools/visual-check/scenes/tumble.marey": "fe842e1e",
  "../../../tools/visual-check/scenes/wave-row.marey": "text",
  "../../examples/bar-chart-reveal.marey": "text",
  "../../examples/dusk-hills.marey": "64a175b5",
  "../../examples/ledges.marey": "a7c966fc",
  "../../examples/logo-reveal.marey": "text",
  "../../examples/physics-pile.marey": "a9e555f8",
};

describe("sampled frames of every first-party scene", () => {
  it("has an entry for every first-party scene and no stale entries", () => {
    expect(Object.keys(SOURCES).sort()).toEqual(Object.keys(BASELINE).sort());
  });

  // "error" entries: a scene that starts compiling gets a hash or "text" here,
  // which differs from "error" and turns this red.
  it("matches the recorded baseline", () => {
    const actual: Record<string, string> = {};
    for (const [key, source] of Object.entries(SOURCES)) {
      const out = compileSource(source);
      if (!out.ir) {
        actual[key] = "error";
      } else if (hasText(out.ir)) {
        actual[key] = "text";
      } else {
        actual[key] = hashScene(out.ir);
      }
    }
    expect(actual).toEqual(BASELINE);
  }, 60_000);
});
