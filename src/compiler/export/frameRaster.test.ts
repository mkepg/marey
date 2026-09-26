import { describe, it, expect } from "vitest";
import { Container } from "pixi.js";
import { buildNode } from "../renderer/builder";
import { snapshotFor } from "../renderer/frameSampler";
import { assertFrameSetMatchesTree, createFrameRasterizer } from "./frameRaster";
import { lex } from "../lexer";
import { parse } from "../parser";
import { typeCheck } from "../typeChecker";
import type { IRSceneNode } from "../sceneIR";
import type { FrameSnapshot } from "../renderer/frameSampler";
import type { Application, ICanvas } from "pixi.js";

function irFor(source: string): IRSceneNode {
  const { ast } = parse(lex(source));
  const { ir, errors } = typeCheck(ast!);
  if (!ir) throw new Error(`fixture did not compile: ${errors.map(e => e.message).join("; ")}`);
  return ir;
}

const TWO_OBJECTS = `
scene {
  size: (200, 200)
  duration: 1
  circle a { position: (50, 50) radius: 10 color: cyan }
  circle b { position: (150, 50) radius: 10 color: magenta }
}
`;

function treeFor(source: string): Container {
  const ir = irFor(source);
  const root = new Container();
  for (const node of ir.children) root.addChild(buildNode(node));
  return root;
}

function frameFrom(root: Container): FrameSnapshot {
  return { index: 0, tick: 0, objects: snapshotFor(root) };
}

describe("assertFrameSetMatchesTree", () => {
  it("accepts a frame set sampled from the same tree", () => {
    const root = treeFor(TWO_OBJECTS);
    expect(() => assertFrameSetMatchesTree(root, [frameFrom(root)])).not.toThrow();
  });

  it("names the object present only in the frames", () => {
    const root = treeFor(TWO_OBJECTS);
    const frame = frameFrom(root);
    // A frame set that mentions an object the tree does not have: the object
    // would render as one that never moves, and every hash check would pass.
    // No cast needed: `IRObjectId` is a plain `string` alias
    // (`sceneIR.ts:132`), unlike `SamplerPlan`, which IS branded. Verified
    // rather than assumed — an unnecessary cast here would teach the next
    // reader that a brand exists where none does.
    const withGhost: FrameSnapshot = {
      ...frame,
      objects: [...frame.objects, { ...frame.objects[0], id: "scene.ghost" }],
    };
    expect(() => assertFrameSetMatchesTree(root, [withGhost]))
      .toThrow(/Only in the frames: \[scene\.ghost\]/);
  });

  it("names the object present only in the tree", () => {
    const root = treeFor(TWO_OBJECTS);
    const frame = frameFrom(root);
    const missingOne: FrameSnapshot = {
      ...frame,
      objects: frame.objects.filter((o) => !o.id.endsWith("b")),
    };
    expect(() => assertFrameSetMatchesTree(root, [missingOne]))
      .toThrow(/Only in the tree: \[[^\]]*b[^\]]*\]/);
  });

  it("accepts an empty frame set rather than throwing on frames[0]", () => {
    // Guards the early return: without it this indexes undefined.
    const root = treeFor(TWO_OBJECTS);
    expect(() => assertFrameSetMatchesTree(root, [])).not.toThrow();
  });
});

describe("createFrameRasterizer · scale", () => {
  // This file had no existing mock of `Application`/`renderer.extract`
  // before this test (the suite runs in `environment: "node"`, with no
  // WebGL, so a real `Application` cannot be constructed here at all) --
  // there was no pre-existing pattern to reuse, only `treeFor`/`frameFrom`
  // for building a plain `Container`/`FrameSnapshot`. This is a minimal fake
  // covering only the three `renderer` fields `createFrameRasterizer`
  // actually reads (`width`, `height`, `background.colorRgba`) plus the one
  // method it calls (`extract.canvas`), cast through `unknown` because it
  // does not (and need not) satisfy the rest of PixiJS's `Application`
  // shape.
  function fakeApp(onExtract: (opts: { resolution: number }) => void): Application {
    return {
      renderer: {
        width: 200,
        height: 200,
        background: { colorRgba: [0, 0, 0, 1] },
        extract: {
          canvas: (opts: { resolution: number }): ICanvas => {
            onExtract(opts);
            return {} as ICanvas;
          },
        },
      },
    } as unknown as Application;
  }

  it("passes the given scale through to extract.canvas as `resolution`", () => {
    const root = treeFor(TWO_OBJECTS);
    const frame = frameFrom(root);
    const calls: number[] = [];
    const rasterize = createFrameRasterizer(fakeApp((opts) => calls.push(opts.resolution)), root, [frame], 2);
    rasterize(frame);
    expect(calls).toEqual([2]);
  });

  it("passes scale 1 through unchanged, the PNG/APNG exporters' own call", () => {
    const root = treeFor(TWO_OBJECTS);
    const frame = frameFrom(root);
    const calls: number[] = [];
    const rasterize = createFrameRasterizer(fakeApp((opts) => calls.push(opts.resolution)), root, [frame], 1);
    rasterize(frame);
    expect(calls).toEqual([1]);
  });
});
