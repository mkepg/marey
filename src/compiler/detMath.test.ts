/**
 * `detMath` is measured against a high-precision reference written here, in
 * BigInt fixed point, never against `Math.sin`, `Math.cos` or `Math.exp`:
 * those are what `detMath` replaces, and their results differ between
 * engines.
 *
 * The reference works at 2^-160 (48 decimal digits). Each test input is a
 * double, so its exact value is a dyadic rational and converts to fixed
 * point without rounding. Errors are reported in ulps of the reference:
 * `|result - ref| / ulp(ref)`, where `ulp(ref)` is the spacing of doubles in
 * the binade that holds `ref`, read off the reference's bit length.
 */
import { describe, it, expect } from "vitest";
import { sinDeg, cosDeg, detExp, RAD_TO_DEG } from "./detMath";
import detMathSource from "./detMath.ts?raw";

// ---------------------------------------------------------------------------
// Exact double <-> BigInt conversion
// ---------------------------------------------------------------------------

const view = new DataView(new ArrayBuffer(8));

/** `x = m * 2^e` exactly, with `m` a signed integer. */
function decompose(x: number): { m: bigint; e: number } {
  view.setFloat64(0, x);
  const hi = view.getUint32(0);
  const lo = view.getUint32(4);
  const biased = (hi >>> 20) & 0x7ff;
  let m = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let e: number;
  if (biased === 0) {
    e = -1074;
  } else {
    m |= 1n << 52n;
    e = biased - 1075;
  }
  if (m === 0n) return { m: 0n, e: 0 };
  return { m: hi >>> 31 ? -m : m, e };
}

/** The next double after finite nonzero `x`, away from zero. */
function nextAwayFromZero(x: number): number {
  view.setFloat64(0, x);
  view.setBigUint64(0, view.getBigUint64(0) + 1n);
  return view.getFloat64(0);
}

function abs(a: bigint): bigint {
  return a < 0n ? -a : a;
}

function bitLength(a: bigint): number {
  return a.toString(2).length;
}

function mod(a: bigint, n: bigint): bigint {
  return ((a % n) + n) % n;
}

/** `a / b` rounded to the nearest integer, `b > 0`. */
function roundDiv(a: bigint, b: bigint): bigint {
  return a >= 0n ? (a + b / 2n) / b : -((-a + b / 2n) / b);
}

/**
 * Error of the double `y` against the reference `ref * 2^scale`, in ulps of
 * the reference. `ref` must be nonzero.
 */
function ulpError(y: number, ref: bigint, scale: number): number {
  const { m, e } = decompose(y);
  const shift = e - scale;
  if (m !== 0n && shift < 0) throw new Error(`reference scale too coarse for ${y}`);
  const yScaled = m === 0n ? 0n : m << BigInt(shift);
  const diff = abs(yScaled - ref);
  // ref lies in [2^q, 2^(q+1)) with q = bitLength - 1 + scale, where the
  // doubles are spaced 2^(q - 52); in units of 2^scale that is
  // 2^(bitLength - 53).
  return Number(diff) / 2 ** (bitLength(abs(ref)) - 53);
}

// ---------------------------------------------------------------------------
// Fixed-point reference at 160 fraction bits
// ---------------------------------------------------------------------------

const P = 160;
const PB = BigInt(P);
const ONE = 1n << PB;
const GUARD = 32n;
const WIDE = PB + GUARD;

/** `x` at scale 2^-P, exactly; throws if `x` has bits below 2^-P. */
function exactFixed(x: number): bigint {
  const { m, e } = decompose(x);
  if (m === 0n) return 0n;
  if (e + P < 0) throw new Error(`${x} is finer than the reference scale`);
  return m << BigInt(e + P);
}

/** atan(1/n) at scale 2^-bits. */
function atanInverse(n: bigint, bits: bigint): bigint {
  let power = (1n << bits) / n;
  let sum = 0n;
  for (let k = 0n; power !== 0n; k++) {
    const term = power / (2n * k + 1n);
    sum += k % 2n === 0n ? term : -term;
    power /= n * n;
  }
  return sum;
}

/** atanh(1/n) at scale 2^-bits. */
function atanhInverse(n: bigint, bits: bigint): bigint {
  let power = (1n << bits) / n;
  let sum = 0n;
  for (let k = 0n; power !== 0n; k++) {
    sum += power / (2n * k + 1n);
    power /= n * n;
  }
  return sum;
}

// Machin: pi = 16 atan(1/5) - 4 atan(1/239). ln 2 = 2 atanh(1/3).
const PI_WIDE = 16n * atanInverse(5n, WIDE) - 4n * atanInverse(239n, WIDE);
const PI = PI_WIDE >> GUARD;
const PI_OVER_180 = (PI_WIDE / 180n) >> GUARD;
const LN2 = (2n * atanhInverse(3n, WIDE)) >> GUARD;

/** `[1/0!, 1/1!, 1/2!, ...]` at scale 2^-P. */
const INVERSE_FACTORIAL: bigint[] = [];
{
  let f = 1n;
  for (let n = 0n; n <= 60n; n++) {
    if (n > 0n) f *= n;
    INVERSE_FACTORIAL.push(((1n << WIDE) / f) >> GUARD);
  }
}

/**
 * sin(t), t at scale 2^-P, summed term by term until the terms vanish.
 * Each term is formed from the previous one, so its rounding is relative to
 * the term. (Horner on fixed-point coefficients would not do: 1/n! is stored
 * to 2^-P absolute, and for |t| > 1 the t^n it is multiplied by amplifies
 * that, which put sin(pi/2) 2^-137 off.)
 */
function sinTaylor(t: bigint): bigint {
  const t2 = (t * t) >> PB;
  let s = t;
  let term = t;
  for (let n = 2n; term !== 0n; n += 2n) {
    term = -((term * t2) >> PB) / (n * (n + 1n));
    s += term;
  }
  return s;
}

/**
 * exp(r) for |r| <= 0.36, r at scale 2^-P. Terms through r^34. Horner is
 * safe here because |r| < 1: each coefficient's 2^-P rounding is shrunk by
 * r^n, not amplified.
 */
function expTaylor(r: bigint): bigint {
  let s = 0n;
  for (let n = 34; n >= 0; n--) s = INVERSE_FACTORIAL[n] + ((s * r) >> PB);
  return s;
}

/**
 * sin(j/100 degrees) for every j in [0, 36000), each from its own Taylor
 * series after an exact fold into [-90, 90] degrees.
 */
const GRID = 36000n;
const SIN_GRID: bigint[] = [];
for (let j = 0n; j < GRID; j++) {
  // sin(a) = sin(180 - a), and sin(a) = sin(a - 360).
  const folded = j <= 9000n ? j : j <= 27000n ? 18000n - j : j - GRID;
  SIN_GRID.push(sinTaylor((folded * PI) / 18000n));
}

/** sin(d) and cos(d) for a small d (radians, scale 2^-P), by series to convergence. */
function smallSinCos(d: bigint): { s: bigint; c: bigint } {
  const d2 = (d * d) >> PB;
  let s = d;
  let c = ONE;
  let term = d;
  for (let n = 2n; term !== 0n; n += 2n) {
    term = -((term * d2) >> PB) / (n * (n + 1n));
    s += term;
  }
  term = ONE;
  for (let n = 1n; term !== 0n; n += 2n) {
    term = -((term * d2) >> PB) / (n * (n + 1n));
    c += term;
  }
  return { s, c };
}

const HALF_TURN = 180n * ONE;

/**
 * sin and cos of `deg` degrees at scale 2^-P, with a flag for each when the
 * true value is exactly zero. The angle is split exactly into its nearest
 * 0.01-degree grid point g and a remainder delta, and combined by the
 * addition formulas from the grid table and a short series in delta.
 */
function referenceSinCos(deg: number): { sin: bigint; cos: bigint; sinZero: boolean; cosZero: boolean } {
  const x = exactFixed(deg);
  const inHalfTurn = mod(x, HALF_TURN);
  const j = roundDiv(x * 100n, ONE);
  const delta = x - roundDiv(j * ONE, 100n);
  const { s, c } = smallSinCos((delta * PI_OVER_180) >> PB);
  const jj = mod(j, GRID);
  const sg = SIN_GRID[Number(jj)];
  const cg = SIN_GRID[Number(mod(jj + 9000n, GRID))];
  return {
    sin: (sg * c + cg * s) >> PB,
    cos: (cg * c - sg * s) >> PB,
    sinZero: inHalfTurn === 0n,
    cosZero: inHalfTurn === 90n * ONE,
  };
}

/** exp(x) as `mant * 2^(k - P)`. */
function referenceExp(x: number): { mant: bigint; scale: number } {
  const k = Math.round(x / Math.LN2);
  const r = exactFixed(x) - BigInt(k) * LN2;
  if (abs(r) > (36n * ONE) / 100n) throw new Error(`reduction failed for ${x}`);
  return { mant: expTaylor(r), scale: k - P };
}

/** The first `n` decimals of a fixed-point value, as digits after its integer part. */
function decimals(x: bigint, n: number): string {
  return ((x * 10n ** BigInt(n)) >> PB).toString();
}

// ---------------------------------------------------------------------------
// The reference itself
// ---------------------------------------------------------------------------

describe("the high-precision reference", () => {
  it("carries pi, ln 2 and e to 45 decimals", () => {
    expect(decimals(PI, 45)).toBe("3141592653589793238462643383279502884197169399");
    expect(decimals(LN2, 45)).toBe("693147180559945309417232121458176568075500134");
    // e = exp(1/4)^4, squaring twice.
    const quarter = expTaylor(ONE / 4n);
    const half = (quarter * quarter) >> PB;
    expect(decimals((half * half) >> PB, 45)).toBe("2718281828459045235360287471352662497757247093");
  });

  it("gets the grid table's exact angles right", () => {
    expect(SIN_GRID[0]).toBe(0n);
    expect(SIN_GRID[18000]).toBe(0n);
    // sin 30 = 1/2, sin 90 = 1, sin 270 = -1, sin 45 = cos 45, all to 2^-150.
    const tol = 1n << 10n;
    expect(abs(SIN_GRID[3000] - ONE / 2n)).toBeLessThan(tol);
    expect(abs(SIN_GRID[9000] - ONE)).toBeLessThan(tol);
    expect(abs(SIN_GRID[27000] + ONE)).toBeLessThan(tol);
    expect(abs(2n * ((SIN_GRID[4500] * SIN_GRID[4500]) >> PB) - ONE)).toBeLessThan(tol);
  });

  it("agrees with a direct series off the grid", () => {
    // 12.345678 degrees is far from any grid point's exact value, so this
    // exercises the remainder series rather than the table alone.
    const deg = 12.3456789;
    const direct = sinTaylor((exactFixed(deg) * PI_OVER_180) >> PB);
    expect(abs(referenceSinCos(deg).sin - direct)).toBeLessThan(1n << 10n);
  });
});

// ---------------------------------------------------------------------------
// detMath
// ---------------------------------------------------------------------------

describe("sinDeg and cosDeg", () => {
  it("are exact at the cardinal angles", () => {
    expect(sinDeg(0)).toBe(0);
    expect(sinDeg(90)).toBe(1);
    expect(sinDeg(180)).toBe(0);
    expect(sinDeg(270)).toBe(-1);
    expect(cosDeg(0)).toBe(1);
    expect(cosDeg(90)).toBe(0);
    expect(cosDeg(180)).toBe(-1);
    expect(cosDeg(270)).toBe(0);
  });

  it("are exact at negative angles and angles past one turn", () => {
    expect(sinDeg(-90)).toBe(-1);
    expect(sinDeg(450)).toBe(1);
    expect(sinDeg(-450)).toBe(-1);
    expect(cosDeg(-180)).toBe(-1);
    expect(cosDeg(720)).toBe(1);
    // A cardinal angle far out still reduces exactly: 360e12 + 90 is a double.
    expect(sinDeg(360e12 + 90)).toBe(1);
    expect(cosDeg(-(360e12 + 180))).toBe(-1);
  });

  it("give exactly 1/2 at 30 degrees and its reflections", () => {
    // One rounded multiply, 30 * DEG_TO_RAD, gives the double below the one
    // nearest pi/6, and sin(30) = 0.49999999999999994. The pi/180 tail, or
    // the exact product's low part passed to the kernel, each fix it on
    // their own (see firstOctant in detMath.ts), so this test pins the
    // corrected product as a whole, not either term alone. 150 folds to 30
    // by 180 - a, and cos(60) folds to sin(30) by 90 - a, both exactly.
    expect(sinDeg(30)).toBe(0.5);
    expect(sinDeg(150)).toBe(0.5);
    expect(cosDeg(60)).toBe(0.5);
    expect(sinDeg(-30)).toBe(-0.5);
    expect(sinDeg(210)).toBe(-0.5);
    expect(cosDeg(120)).toBe(-0.5);
    expect(cosDeg(-300)).toBe(0.5);
  });

  it("give the correctly rounded sqrt(1/2) at 45 degrees, from both kernels", () => {
    // 45 is the octant boundary, so sinDeg and cosDeg both take the a <= 45
    // branch and send one argument, hi + lo, to the two different kernels.
    // Here hi is 45 * DEG_TO_RAD rounded once, so the result rests on lo,
    // which carries the pi/180 tail. Without the tail the argument is
    // exactly 45 * DEG_TO_RAD = pi/4 - 1.33e-17, whose true sine lies 0.020
    // ulp below the rounding midpoint, so a correct kernel gives
    // 0.7071067811865475. sin(pi/4) lies 0.065 ulp above the midpoint, so
    // the double nearest it is 0.7071067811865476 (Math.SQRT1_2, a constant
    // rather than a computed call). This test pins both the tail and lo.
    const nearest = 0.7071067811865476;
    expect(nearest).toBe(Math.SQRT1_2);
    expect(sinDeg(45)).toBe(nearest);
    expect(cosDeg(45)).toBe(nearest);
    expect(sinDeg(135)).toBe(nearest);
    expect(cosDeg(135)).toBe(-nearest);
    expect(cosDeg(-45)).toBe(nearest);
  });

  it("return +0, never -0, for an exact zero", () => {
    // `toBe` compares with Object.is, so each of these fails on -0.
    for (const deg of [0, -0, 180, -180, 360, -360, 540]) expect(sinDeg(deg)).toBe(0);
    for (const deg of [90, -90, 270, -270, 450]) expect(cosDeg(deg)).toBe(0);
  });

  it("return NaN for NaN and infinite input", () => {
    for (const deg of [NaN, Infinity, -Infinity]) {
      expect(sinDeg(deg)).toBeNaN();
      expect(cosDeg(deg)).toBeNaN();
    }
  });

  // Every 0.01 degrees on [-720, 720]: 144,001 inputs, each a double near
  // i/100. Computed on first use and shared by the three tests below.
  let sweepResult: ReturnType<typeof runSweep> | undefined;
  const sweep = () => (sweepResult ??= runSweep());
  function runSweep() {
    let maxSin = 0;
    let maxCos = 0;
    let argSin = 0;
    let argCos = 0;
    const zeroMisses: string[] = [];
    const symmetryMisses: number[] = [];
    for (let i = -72000; i <= 72000; i++) {
      const deg = i / 100;
      const ref = referenceSinCos(deg);
      const s = sinDeg(deg);
      const c = cosDeg(deg);
      if (ref.sinZero) {
        if (!Object.is(s, 0)) zeroMisses.push(`sinDeg(${deg}) = ${s}`);
      } else {
        const e = ulpError(s, ref.sin, -P);
        if (e > maxSin) [maxSin, argSin] = [e, deg];
      }
      if (ref.cosZero) {
        if (!Object.is(c, 0)) zeroMisses.push(`cosDeg(${deg}) = ${c}`);
      } else {
        const e = ulpError(c, ref.cos, -P);
        if (e > maxCos) [maxCos, argCos] = [e, deg];
      }
      if (i > 0 && (sinDeg(-deg) !== -s || cosDeg(-deg) !== c)) symmetryMisses.push(deg);
    }
    console.log(
      `detMath sweep, every 0.01 deg on [-720, 720]: ` +
        `sinDeg max ${maxSin.toFixed(4)} ulp at ${argSin}, cosDeg max ${maxCos.toFixed(4)} ulp at ${argCos}`,
    );
    return { maxSin, maxCos, zeroMisses, symmetryMisses };
  }

  it("are below 0.72 ulp every 0.01 degrees on [-720, 720]", () => {
    // The requirement is 2 ulp (spec section 3.3, global constraints).
    // Results are the same bits on every engine, so a bound near the
    // measured maximum cannot flake, and the bounds below are what pin the
    // correction terms. Measured sweep maxima with each one removed:
    //   cos kernel's recovered rounding error (1 - w - hz)   1.2274
    //   cos kernel's - x * y tail                            1.0202
    //   product partial dl * DEG_TO_RAD_LO                   1.0663
    //   the pi/180 tail d * DEG_TO_RAD_TAIL                  0.7923
    //   sin kernel's 0.5 * y (the -y x^2/2 term)             0.7416
    // The 1-ulp bound catches the first three. The measured maximum is
    // 0.7000 ulp, and the 0.72 bound catches the last two. (The tail is also
    // pinned by the 45-degree test above.)
    expect(sweep().maxSin).toBeLessThanOrEqual(1);
    expect(sweep().maxCos).toBeLessThanOrEqual(1);
    expect(sweep().maxSin).toBeLessThan(0.72);
    expect(sweep().maxCos).toBeLessThan(0.72);
  });

  it("return exactly +0 wherever the true value is zero on the sweep", () => {
    expect(sweep().zeroMisses).toEqual([]);
  });

  it("are exactly odd and even, bit for bit", () => {
    // The sign is folded off before the reduction, so sin(-x) is -sin(x) and
    // cos(-x) is cos(x) exactly. Reducing a negative angle into [0, 360)
    // with `+ 360` instead would round, and these would differ in the last bit.
    expect(sweep().symmetryMisses).toEqual([]);
  });

  it("are within 1 ulp at large and tiny magnitudes", () => {
    let maxErr = 0;
    let arg = 0;
    // 1.37 * 2^p for p in [-30, 1020], both signs, and a few awkward values.
    const inputs: number[] = [0.1, 1e6 + 0.37, 1e10 + 0.25, 2 ** 52 + 1, 1e15 + 7, 1e300, Number.MAX_VALUE];
    let base = 1.37;
    for (let p = 0; p > -30; p--) base /= 2;
    for (let p = -30; p <= 1020; p += 5) {
      inputs.push(base);
      for (let q = 0; q < 5; q++) base *= 2;
    }
    for (const x of inputs) {
      for (const deg of [x, -x]) {
        const ref = referenceSinCos(deg);
        for (const [y, r, zero] of [
          [sinDeg(deg), ref.sin, ref.sinZero],
          [cosDeg(deg), ref.cos, ref.cosZero],
        ] as const) {
          if (zero) {
            expect(y).toBe(0);
            continue;
          }
          const e = ulpError(y, r, -P);
          if (e > maxErr) [maxErr, arg] = [e, deg];
        }
      }
    }
    console.log(`detMath wide magnitudes: max ${maxErr.toFixed(4)} ulp at ${arg}`);
    expect(maxErr).toBeLessThanOrEqual(1);

    // Below 2^-30 degrees sin(x) = x * pi/180 to well under an ulp, so the
    // exact product is the reference.
    for (const x of [2 ** -31, 1e-12, 1e-100, 1e-300]) {
      const { m, e } = decompose(x);
      expect(ulpError(sinDeg(x), m * PI_OVER_180, e - P)).toBeLessThanOrEqual(1);
      expect(ulpError(sinDeg(-x), -m * PI_OVER_180, e - P)).toBeLessThanOrEqual(1);
    }
  });

  it("export RAD_TO_DEG as the double nearest 180/pi", () => {
    expect(RAD_TO_DEG).toBe(57.29577951308232);
    expect(ulpError(RAD_TO_DEG, (180n * ONE * ONE) / PI, -P)).toBeLessThanOrEqual(0.5);
  });
});

describe("detExp", () => {
  it("is exactly 1 at 0", () => {
    expect(detExp(0)).toBe(1);
    expect(detExp(-0)).toBe(1);
  });

  it("returns NaN for NaN", () => {
    expect(detExp(NaN)).toBeNaN();
  });

  it("returns Infinity above 709 and 0 below -708, and is finite between", () => {
    const top = detExp(709);
    expect(Number.isFinite(top)).toBe(true);
    expect(top).toBeGreaterThan(8.218e307);
    expect(detExp(nextAwayFromZero(709))).toBe(Infinity);
    expect(detExp(710)).toBe(Infinity);
    expect(detExp(Infinity)).toBe(Infinity);

    const bottom = detExp(-708);
    expect(bottom).toBeGreaterThanOrEqual(2.2250738585072014e-308); // still normal
    expect(detExp(nextAwayFromZero(-708))).toBe(0);
    expect(detExp(-745)).toBe(0);
    expect(detExp(-Infinity)).toBe(0);
  });

  it("is within 2 ulp every 0.001 on [-50, 0]", () => {
    let maxErr = 0;
    let arg = 0;
    let previous = 0;
    let monotone = true;
    for (let i = -50000; i <= 0; i++) {
      const x = i / 1000;
      const y = detExp(x);
      const { mant, scale } = referenceExp(x);
      const e = ulpError(y, mant, scale);
      if (e > maxErr) [maxErr, arg] = [e, x];
      if (y < previous) monotone = false;
      previous = y;
    }
    console.log(`detMath sweep, every 0.001 on [-50, 0]: detExp max ${maxErr.toFixed(4)} ulp at ${arg}`);
    expect(maxErr).toBeLessThanOrEqual(2);
    expect(monotone).toBe(true);
  });

  it("is monotone and finite every 0.1 on [-700, 700] (error logged, not bounded)", () => {
    let maxErr = 0;
    let arg = 0;
    let previous = 0;
    let monotone = true;
    let finite = true;
    for (let i = -7000; i <= 7000; i++) {
      const x = i / 10;
      const y = detExp(x);
      const { mant, scale } = referenceExp(x);
      const e = ulpError(y, mant, scale);
      if (e > maxErr) [maxErr, arg] = [e, x];
      if (y < previous) monotone = false;
      if (!(y > 0 && Number.isFinite(y))) finite = false;
      previous = y;
    }
    console.log(`detMath sweep, every 0.1 on [-700, 700]: detExp max ${maxErr.toFixed(4)} ulp at ${arg}`);
    expect(monotone).toBe(true);
    expect(finite).toBe(true);
  });
});

describe("portability", () => {
  // Comments are stripped first so prose may name the functions this file
  // replaces. Every remaining reference to `Math` must be one of three
  // functions that are exact on every engine.
  const code = detMathSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("reads the real source", () => {
    expect(code).toContain("export function sinDeg");
    expect(code).toContain("Math.floor");
  });

  it("calls no Math function but floor, abs and trunc", () => {
    const uses = code.match(/\bMath\b(?:\s*\.\s*\w+)?/g) ?? [];
    const allowed = new Set(["Math.floor", "Math.abs", "Math.trunc"]);
    expect(uses.filter((u) => !allowed.has(u.replace(/\s+/g, "")))).toEqual([]);
  });

  it("uses no exponentiation operator and imports nothing", () => {
    expect(code).not.toMatch(/\*\*/);
    expect(code).not.toMatch(/^\s*import\b/m);
  });

  it("states the no-FMA requirement for a port", () => {
    expect(detMathSource).toContain("-ffp-contract=off");
  });
});
