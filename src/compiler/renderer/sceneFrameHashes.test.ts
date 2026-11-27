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
  "../../../eval/layout/reference/L1-centred.marey": "fb362fcf",
  "../../../eval/layout/reference/L1-centreline.marey": "82fe38e3",
  "../../../eval/layout/reference/L1-gaps.marey": "66e53c33",
  "../../../eval/layout/reference/L1-ok.marey": "5a65c6df",
  "../../../eval/layout/reference/L2-bottom.marey": "1d4882b7",
  "../../../eval/layout/reference/L2-centred.marey": "81b93a7f",
  "../../../eval/layout/reference/L2-gaps.marey": "4426b06f",
  "../../../eval/layout/reference/L2-ok.marey": "1b6e6eb3",
  "../../../eval/layout/reference/L3-centreline.marey": "48bb2be3",
  "../../../eval/layout/reference/L3-equal-gaps.marey": "31465b1b",
  "../../../eval/layout/reference/L3-left-edge.marey": "175a3fab",
  "../../../eval/layout/reference/L3-ok.marey": "2efaa797",
  "../../../eval/layout/reference/L3-right-edge.marey": "6f8f07eb",
  "../../../eval/layout/reference/L4-centred.marey": "b2548003",
  "../../../eval/layout/reference/L4-gaps.marey": "1ef50333",
  "../../../eval/layout/reference/L4-left.marey": "2c4fb2e3",
  "../../../eval/layout/reference/L4-ok.marey": "4dffc183",
  "../../../eval/layout/reference/L5-centred.marey": "25085a37",
  "../../../eval/layout/reference/L5-centreline.marey": "15674b27",
  "../../../eval/layout/reference/L5-ok.marey": "38178583",
  "../../../eval/layout/reference/L5-spacing.marey": "e4da0577",
  "../../../eval/layout/reference/L6-centred.marey": "8677f0db",
  "../../../eval/layout/reference/L6-hgap.marey": "c92d0cb3",
  "../../../eval/layout/reference/L6-lattice.marey": "2e1bf533",
  "../../../eval/layout/reference/L6-ok.marey": "f76ef13b",
  "../../../eval/layout/reference/L6-vgap.marey": "7310db47",
  "../../../eval/layout/reference/L7-centred.marey": "447cda7b",
  "../../../eval/layout/reference/L7-columns.marey": "d8f90b2b",
  "../../../eval/layout/reference/L7-hgap.marey": "3fe4dadb",
  "../../../eval/layout/reference/L7-ok.marey": "09491e1b",
  "../../../eval/layout/reference/L7-vgap.marey": "a445145b",
  "../../../eval/layout/reference/L8-direction.marey": "b6fb8f6b",
  "../../../eval/layout/reference/L8-distance.marey": "789f7707",
  "../../../eval/layout/reference/L8-ok.marey": "e85d3ac7",
  "../../../eval/layout/reference/L8-start.marey": "4bf37f5f",
  "../../../eval/layout/reference/L8-step.marey": "40213adb",
  "../../../eval/layout/reference/L9-distance.marey": "cf1ac7cf",
  "../../../eval/layout/reference/L9-fifth.marey": "478c65a7",
  "../../../eval/layout/reference/L9-ok.marey": "478c65a7",
  "../../../eval/layout/reference/L9-orient.marey": "443eed2b",
  "../../../eval/layout/reference/L9-step.marey": "9ec8ebc7",
  "../../../eval/scenes-3b/bar-chart.marey": "text",
  "../../../eval/scenes-3b/compound-logo.marey": "39dfd698",
  "../../../eval/scenes-3b/radial-dots.marey": "16109237",
  "../../../eval/scenes-3b/timeline-ticks.marey": "text",
  "../../../eval/scenes-layout/A-badge-row.marey": "02066cdf",
  "../../../eval/scenes-layout/A-card-grid.marey": "7e34a693",
  "../../../eval/scenes-layout/A-clock-ticks.marey": "478c65a7",
  "../../../eval/scenes-layout/A-left-stack.marey": "1760251f",
  "../../../eval/scenes-layout/A-mixed-row.marey": "6777b3d3",
  "../../../eval/scenes-layout/A-ring-12.marey": "fd708b93",
  "../../../eval/scenes-layout/A-spread-dots.marey": "a9c94f77",
  "../../../eval/scenes-layout/A-stack-columns.marey": "d14282db",
  "../../../eval/scenes-layout/A-toolbar-row.marey": "b48a3e87",
  "../../../eval/scenes-layout/B-badge-row.marey": "38178583",
  "../../../eval/scenes-layout/B-card-grid.marey": "9b24ead3",
  "../../../eval/scenes-layout/B-clock-ticks.marey": "80ef0d73",
  "../../../eval/scenes-layout/B-left-stack.marey": "35b97d93",
  "../../../eval/scenes-layout/B-mixed-row.marey": "6777b3d3",
  "../../../eval/scenes-layout/B-ring-12.marey": "7f863c67",
  "../../../eval/scenes-layout/B-spread-dots.marey": "a9c94f77",
  "../../../eval/scenes-layout/B-stack-columns.marey": "c53fde83",
  "../../../eval/scenes-layout/B-toolbar-row.marey": "b48a3e87",
  "../../../eval/scenes-layout/C-badge-row.marey": "38178583",
  "../../../eval/scenes-layout/C-card-grid.marey": "697e48cf",
  "../../../eval/scenes-layout/C-clock-ticks.marey": "478c65a7",
  "../../../eval/scenes-layout/C-left-stack.marey": "70af22a7",
  "../../../eval/scenes-layout/C-mixed-row.marey": "6777b3d3",
  "../../../eval/scenes-layout/C-ring-12.marey": "6345e37f",
  "../../../eval/scenes-layout/C-spread-dots.marey": "a9c94f77",
  "../../../eval/scenes-layout/C-stack-columns.marey": "fe74666b",
  "../../../eval/scenes-layout/C-toolbar-row.marey": "b48a3e87",
  "../../../eval/scenes-layout/D-badge-row.marey": "38178583",
  "../../../eval/scenes-layout/D-card-grid.marey": "a7ad1b47",
  "../../../eval/scenes-layout/D-clock-ticks.marey": "478c65a7",
  "../../../eval/scenes-layout/D-left-stack.marey": "35b97d93",
  "../../../eval/scenes-layout/D-mixed-row.marey": "7a0a91a3",
  "../../../eval/scenes-layout/D-ring-12.marey": "6345e37f",
  "../../../eval/scenes-layout/D-spread-dots.marey": "a9c94f77",
  "../../../eval/scenes-layout/D-stack-columns.marey": "c53fde83",
  "../../../eval/scenes-layout/D-toolbar-row.marey": "b48a3e87",
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
