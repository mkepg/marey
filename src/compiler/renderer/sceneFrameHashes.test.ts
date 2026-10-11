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
 * Sampled-frame hashes of every first-party scene that runs headless, taken
 * before Phase 8 changed anything (spec E3). A red here means existing output
 * moved: find out why before touching BASELINE.
 *
 * Same corpus as playback.test.ts, through import.meta.glob for the same
 * reason (src/** type-checks with browser types only). Scenes with text are
 * skipped because text needs a DOM. Scenes added after the baseline are not
 * in it and are not compared.
 */
const SOURCES: Record<string, string> = {
  ...import.meta.glob("../../examples/*.marey", { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob("../../../eval/scenes-3b/*.marey", { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob("../../../tools/visual-check/scenes/*.marey", { query: "?raw", import: "default", eager: true }),
};

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
  "../../../eval/scenes-3b/compound-logo.marey": "39dfd698",
  "../../../eval/scenes-3b/radial-dots.marey": "07dcbbd7",
  "../../../tools/visual-check/scenes/fit-contain.marey": "7251531b",
  "../../../tools/visual-check/scenes/fit-cover.marey": "7251531b",
  "../../../tools/visual-check/scenes/fit-fill.marey": "7251531b",
  "../../../tools/visual-check/scenes/fit-none.marey": "7251531b",
  "../../../tools/visual-check/scenes/freeze-midair.marey": "cebbb6db",
  "../../../tools/visual-check/scenes/freeze.marey": "79a41153",
  "../../../tools/visual-check/scenes/ghost.marey": "b7fbd35a",
  "../../../tools/visual-check/scenes/idle.marey": "89812134",
  "../../../tools/visual-check/scenes/linear-motion.marey": "03ed227f",
  "../../../tools/visual-check/scenes/logo-freeze.marey": "6470848b",
  "../../../tools/visual-check/scenes/logo.marey": "d6d24f1e",
  "../../../tools/visual-check/scenes/lottie-easing-halfframe.marey": "6842c45c",
  "../../../tools/visual-check/scenes/lottie-layer-order.marey": "486ce2fb",
  "../../../tools/visual-check/scenes/lottie-line-caps.marey": "7a1c0af7",
  "../../../tools/visual-check/scenes/lottie-line-miter.marey": "53c47bff",
  "../../../tools/visual-check/scenes/lottie-line-scale.marey": "a840db9f",
  "../../../tools/visual-check/scenes/lottie-opacity-flatten.marey": "0e715d13",
  "../../../tools/visual-check/scenes/lottie-outpoint.marey": "44e44158",
  "../../../tools/visual-check/scenes/lottie-version-field.marey": "28d446a7",
  "../../../tools/visual-check/scenes/pile.marey": "1d3fae36",
  "../../../tools/visual-check/scenes/tumble.marey": "fe842e1e",
  "../../examples/dusk-hills.marey": "18c4b41d",
  "../../examples/physics-pile.marey": "a9e555f8",
};

describe("sampled frames of every headless first-party scene", () => {
  it("are byte-identical to the Phase 8 baseline", () => {
    const actual: Record<string, string> = {};
    for (const [key, source] of Object.entries(SOURCES)) {
      if (!(key in BASELINE) && Object.keys(BASELINE).length > 0) continue;
      const out = compileSource(source);
      if (!out.ir || hasText(out.ir)) continue;
      actual[key] = hashScene(out.ir);
    }
    expect(Object.keys(BASELINE).length).toBeGreaterThanOrEqual(15);
    expect(actual).toEqual(BASELINE);
  });
});
