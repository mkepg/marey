import type { FrameSnapshot } from "../renderer/frameSampler";

/**
 * A stable content hash for a sampled sequence.
 *
 * FNV-1a over the snapshots' JSON, written by hand rather than taken from a
 * dependency because it must produce the identical digest in Node and in the
 * browser — `node:crypto` is not available in one and `crypto.subtle` is async
 * in both. 32 bits is ample: this detects change, it is not a security
 * primitive.
 *
 * Values are **not** rounded before hashing. IEEE-754 arithmetic is
 * deterministic for an identical sequence of operations and Matter.js is
 * deterministic given identical call order, so exact values are both more
 * honest and equally stable. Rounding would hide a real divergence smaller
 * than its own precision.
 *
 * This hashes *simulation output*, so unlike a PNG byte hash it carries the
 * determinism claim across machines as well as across runs.
 */
export function hashFrames(frames: ReadonlyArray<FrameSnapshot>): string {
  let h = 0x811c9dc5;
  const text = JSON.stringify(frames);
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
