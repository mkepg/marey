import { describe, it, expect } from "vitest";
import { pathToContours } from "./textOutline";

/**
 * `pathToContours` is the pure core of spec §6.3 step 5: harfbuzzjs's
 * `glyphToPath` SVG path data (font units, y up) to Lottie-shaped contours
 * (pixels, y down, tangents relative to their own vertex).
 *
 * The grammar these fixtures use is the one harfbuzzjs 1.6.2 actually emits
 * for JetBrains Mono, measured in Node before this file was written:
 * `M140,290L140,370L460,370L460,290L140,290Z` for `-`, and for `a` a run of
 * `Q` segments whose last one ends exactly on the `M` point before `Z`
 * (`...Q329,-10 252,-10Z` after `M252,-10`). So no command letter is ever
 * separated from its first number by a space, pairs are comma-joined, and
 * the two pairs of a `Q` are space-separated.
 */
describe("pathToContours", () => {
  it("converts a quadratic to the exact cubic (2/3 rule), flipping y and scaling", () => {
    // M0,0 Q30,60 60,0 Z at scale 1, baseline dy = 100: y flips to 100 - y.
    const [c] = pathToContours("M0,0Q30,60 60,0Z", 1, 0, 100);
    expect(c.v).toEqual([[0, 100], [60, 100]]);
    expect(c.o[0]).toEqual([20, -40]); // (2/3)·((30,40) − (0,100)) relative to v0
    expect(c.i[1]).toEqual([-20, -40]); // (2/3)·((30,40) − (60,100)) relative to v1
  });

  it("applies scale and the x offset before taking tangent differences", () => {
    // Same curve at scale 0.5, pen at x = 7, baseline at y = 50.
    const [c] = pathToContours("M0,0Q30,60 60,0Z", 0.5, 7, 50);
    expect(c.v).toEqual([[7, 50], [37, 50]]);
    expect(c.o[0]).toEqual([10, -20]);
    expect(c.i[1]).toEqual([-10, -20]);
  });

  it("gives straight segments zero tangents", () => {
    const [c] = pathToContours("M0,0L10,0L10,10Z", 1, 0, 0);
    expect(c.v).toHaveLength(3);
    expect(c.i.every(([x, y]) => x === 0 && y === 0)).toBe(true);
    expect(c.o.every(([x, y]) => x === 0 && y === 0)).toBe(true);
  });

  it("splits on M into separate contours (a glyph with a counter)", () => {
    const contours = pathToContours("M0,0L1,0L1,1ZM2,2L3,2L3,3Z", 1, 0, 0);
    expect(contours).toHaveLength(2);
    expect(contours[1].v[0]).toEqual([2, -2]);
  });

  it("drops the duplicate closing vertex when a contour ends where it began", () => {
    const [c] = pathToContours("M0,0L10,0L0,0Z", 1, 0, 0);
    expect(c.v).toEqual([[0, 0], [10, 0]]);
    expect(c.i).toHaveLength(2);
    expect(c.o).toHaveLength(2);
  });

  it("keeps the closing curve's in-tangent on the first vertex when it drops the duplicate", () => {
    // The shape harfbuzzjs emits for `a`: the last Q lands exactly on the M
    // point. Dropping that duplicate vertex must not drop its curve -- the
    // closing segment (last vertex -> v0) still bends, so its second control
    // point becomes v0's in-tangent. Lottie draws a closed path's closing
    // segment from o[last] to i[0].
    const [c] = pathToContours("M0,0L10,0Q10,10 0,0Z", 1, 0, 0);
    expect(c.v).toEqual([[0, 0], [10, 0]]);
    // Q control (10,10) flips to (10,-10). From v1 = (10,0): (2/3)(0,-10).
    expect(c.o[1][0]).toBeCloseTo(0, 12);
    expect(c.o[1][1]).toBeCloseTo(-20 / 3, 12);
    // Into v0 = (0,0): (2/3)((10,-10) − (0,0)).
    expect(c.i[0][0]).toBeCloseTo(20 / 3, 12);
    expect(c.i[0][1]).toBeCloseTo(-20 / 3, 12);
  });

  it("passes a cubic's control points through, relative to their own vertices", () => {
    const [c] = pathToContours("M0,0C0,10 10,10 10,0Z", 1, 0, 0);
    expect(c.v).toEqual([[0, 0], [10, 0]]);
    expect(c.o[0]).toEqual([0, -10]);
    expect(c.i[1]).toEqual([0, -10]);
  });

  it("returns no contours for an empty path (a space glyph)", () => {
    expect(pathToContours("", 1, 0, 0)).toEqual([]);
  });

  it("refuses a path command it does not understand rather than dropping it", () => {
    expect(() => pathToContours("M0,0A5,5 0 0 1 10,0Z", 1, 0, 0)).toThrow(/unsupported path command 'A'/);
  });
});
