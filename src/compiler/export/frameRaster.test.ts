import { describe, it, expect } from "vitest";
import { Container } from "pixi.js";
import { buildNode } from "../renderer/builder";
import { snapshotFor } from "../renderer/frameSampler";
import { assertFrameSetMatchesTree } from "./frameRaster";
import { lex } from "../lexer";
import { parse } from "../parser";
import { typeCheck } from "../typeChecker";
import type { IRSceneNode } from "../sceneIR";
import type { FrameSnapshot } from "../renderer/frameSampler";

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
