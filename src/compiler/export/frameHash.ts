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
 * This hashes *simulation output*, so unlike a PNG byte hash it is not tied
 * to one machine's GPU or rasteriser. **But it is not a cross-engine
 * guarantee either, and measurement (not argument) found the gap:**
 * `eval/scenes-3b/compound-logo.marey`'s hash matches bit-for-bit between a
 * headless Node run and a Chromium run (`eval/RESULTS-GATE-B.md`), while
 * `radial-dots.marey`'s does not — traced to `Math.sin` returning a
 * different last bit at exactly 240° between Node's V8 and Playwright's
 * bundled Chromium V8. `+`, `-`, `*`, `/` and `Math.sqrt` are the operations
 * IEEE-754 (and ECMA-262) require to be correctly rounded everywhere;
 * `Math.sin`/`Math.cos` are explicitly "implementation-approximated" by the
 * spec and are not. `parseExpr.ts`'s `sin`/`cos` fold to literals at parse
 * time, so any scene using them can carry this gap into its baked IR; a
 * scene with no trig (arithmetic and Matter.js collision response only, as
 * `compound-logo.marey` measured) is not shown to have it.
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
