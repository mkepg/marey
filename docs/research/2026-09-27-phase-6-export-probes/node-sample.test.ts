// Phase 6 probe: builds and samples the four canonical scenes in plain Node,
// with no browser, to see which parts of the export prefix need a DOM.
// Prints OK with a frame count and hash, or the error the build threw.
import { it } from "vitest";
import { readFileSync } from "node:fs";
import { Container } from "pixi.js";
import { compileSource } from "../../../src/compiler/compileSource";
import { planExport } from "../../../src/compiler/export/exportContract";
import { buildNode } from "../../../src/compiler/renderer/builder";
import { sampleFrames } from "../../../src/compiler/renderer/frameSampler";
import { SceneRuntime } from "../../../src/compiler/renderer/sceneRuntime";
import { MatterWorld } from "../../../src/compiler/renderer/physicsWorld";
import { hashFrames } from "../../../src/compiler/export/frameHash";

for (const f of ["bar-chart", "radial-dots", "compound-logo", "timeline-ticks"]) {
  it(f, () => {
    const src = readFileSync(`eval/scenes-3b/${f}.marey`, "utf8");
    const ir = compileSource(src).ir!;
    const p = planExport(ir, { fps: 30 });
    if (!p.ok) throw new Error(JSON.stringify(p.diagnostics));
    try {
      const root = new Container();
      for (const n of ir.children) root.addChild(buildNode(n));
      const rt = new SceneRuntime(new MatterWorld(ir.width, ir.height), root);
      const frames = sampleFrames(rt, root, p.plan);
      console.log(f, "OK frames", frames.length, "hash", hashFrames(frames));
    } catch (e) { console.log(f, "THROWS", String(e).slice(0, 160)); }
  });
}
