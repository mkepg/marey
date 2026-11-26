/**
 * Portable sine and cosine in degrees, and the exponential.
 *
 * `Math.sin`, `Math.cos` and `Math.exp` are not specified to the last bit:
 * ECMA-262 leaves their accuracy to the engine, and V8, SpiderMonkey and
 * JavaScriptCore return different doubles for the same input. A scene that
 * computes positions through them can therefore hash differently in two
 * browsers. Everything here is built from operations IEEE 754 specifies
 * exactly, so every engine, and a C port, returns the same bits:
 *
 * - `+`, `-`, `*` and `/` on doubles, each correctly rounded;
 * - `%`, which ECMA-262 defines as the exact remainder (C's `fmod`);
 * - `Math.floor`, `Math.abs` and `Math.trunc`, which are exact;
 * - comparisons, and writing exponent bits into a double through a DataView.
 *
 * `detMath.test.ts` measures every function against a 160-bit fixed-point
 * reference and rejects any other `Math` function in this file.
 *
 * Porting. JavaScript never fuses `a * b + c` into one rounding. A C port
 * must not either: compile it with `-ffp-contract=off` (and without
 * `-ffast-math`), evaluate in double precision (`FLT_EVAL_METHOD == 0`, so
 * SSE2 rather than x87 on x86), and keep every expression in the order
 * written here.
 *
 * The polynomial kernels and the exponential's reduction are those of
 * fdlibm (Sun Microsystems, 1993), as kept in FreeBSD's `k_sin.c`,
 * `k_cos.c` and `e_exp.c`. Their coefficients are minimax fits; each is
 * listed with its bit pattern so a port can check it copied the same double.
 */

/** Degrees per radian, the double nearest 180/pi. */
export const RAD_TO_DEG = 57.29577951308232;

/** Radians per degree, the double nearest pi/180 (0x3F91DF46_A2529D39). */
const DEG_TO_RAD = 0.017453292519943295;

// sin(x) ~ x + S1 x^3 + ... + S6 x^13 on |x| <= pi/4; |error| < 2^-58.
const S1 = -1.66666666666666324348e-1; // 0xBFC55555_55555549
const S2 = 8.33333333332248946124e-3; //  0x3F811111_1110F8A6
const S3 = -1.98412698298579493134e-4; // 0xBF2A01A0_19C161D5
const S4 = 2.75573137070700676789e-6; //  0x3EC71DE3_57B1FE7D
const S5 = -2.50507602534068634195e-8; // 0xBE5AE5E6_8A2B9CEB
const S6 = 1.58969099521155010221e-10; // 0x3DE5D93A_5ACFD57C

// cos(x) ~ 1 - x^2/2 + C1 x^4 + ... + C6 x^14 on |x| <= pi/4; |error| < 2^-58.
const C1 = 4.16666666666666019037e-2; //  0x3FA55555_5555554C
const C2 = -1.38888888888741095749e-3; // 0xBF56C16C_16C15177
const C3 = 2.48015872894767294178e-5; //  0x3EFA01A0_19CB1590
const C4 = -2.75573143513906633035e-7; // 0xBE927E4F_809C52AD
const C5 = 2.08757232129817482790e-9; //  0x3E21EE9E_BDB4B1C4
const C6 = -1.13596475577881948265e-11; // 0xBDA8FAE9_BE8838D4

/** sin(x) for x in [0, pi/4] radians. */
function sinKernel(x: number): number {
  const z = x * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  const v = z * x;
  // The correction is under a tenth of `x` on this range, so its own
  // rounding errors shrink by that factor before the one final add.
  return x + v * (S1 + z * r);
}

/** cos(x) for x in [0, pi/4] radians. */
function cosKernel(x: number): number {
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  const hz = 0.5 * z;
  const w = 1 - hz;
  // `1 - w` and then `(1 - w) - hz` are both exact (Sterbenz), so together
  // they recover the rounding error of `w`, which is added back with the
  // polynomial tail.
  return w + ((1 - w - hz) + z * r);
}

/** sin(a degrees) for a in [0, 90]. */
function sinFirstQuadrant(a: number): number {
  // 90 - a is exact for a in [45, 90] (Sterbenz), so the octant fold adds
  // no rounding; the single rounding of the conversion is the multiply.
  return a <= 45 ? sinKernel(a * DEG_TO_RAD) : cosKernel((90 - a) * DEG_TO_RAD);
}

/** cos(a degrees) for a in [0, 90]. */
function cosFirstQuadrant(a: number): number {
  return a <= 45 ? cosKernel(a * DEG_TO_RAD) : sinKernel((90 - a) * DEG_TO_RAD);
}

/**
 * sin of an angle in degrees, exact at every multiple of 90.
 *
 * The sign is taken off first, so `sinDeg(-x)` is `-sinDeg(x)` bit for bit,
 * and `%` reduces the magnitude into [0, 360) exactly, for any finite input.
 * Each fold below (`a - 180`, `180 - a`, `90 - a`) subtracts two doubles
 * within a factor of two of each other, which IEEE 754 does exactly, so the
 * angle reaching the polynomial is the input's exact residue. An exact zero
 * is returned as +0. NaN and infinite input give NaN.
 */
export function sinDeg(deg: number): number {
  let a = Math.abs(deg) % 360;
  let negative = deg < 0;
  if (a >= 180) {
    a -= 180;
    negative = !negative;
  }
  if (a > 90) a = 180 - a;
  const v = sinFirstQuadrant(a);
  if (v === 0) return 0;
  return negative ? -v : v;
}

/**
 * cos of an angle in degrees, exact at every multiple of 90.
 *
 * The same exact reduction as `sinDeg`; cos is even, so the sign is simply
 * dropped. An exact zero comes out as +0 with no special case: the result is
 * negated only when the folded angle is below 90, where cos is positive.
 * NaN and infinite input give NaN.
 */
export function cosDeg(deg: number): number {
  let a = Math.abs(deg) % 360;
  if (a > 180) a = 360 - a;
  let negative = false;
  if (a > 90) {
    a = 180 - a;
    negative = true;
  }
  const v = cosFirstQuadrant(a);
  return negative ? -v : v;
}

// ln 2 split in two (Cody-Waite). LN2_HI has its low 21 bits clear, so
// k * LN2_HI is exact for |k| < 2^21 and x - k * LN2_HI is exact too.
const LN2_HI = 6.93147180369123816490e-1; //  0x3FE62E42_FEE00000
const LN2_LO = 1.90821492927058770002e-10; // 0x3DEA39EF_35793C76
const INV_LN2 = 1.44269504088896338700; //    0x3FF71547_652B82FE

// R(r) = r (e^r + 1) / (e^r - 1) ~ 2 + P1 r^2 + P2 r^4 + ... + P5 r^10 on
// |r| <= ln2/2, with |error| < 2^-59.
const P1 = 1.66666666666666019037e-1; //  0x3FC55555_5555553E
const P2 = -2.77777777770155933842e-3; // 0xBF66C16C_16BEBD93
const P3 = 6.61375632143793436117e-5; //  0x3F11566A_AF25DE2C
const P4 = -1.65339022054652515390e-6; // 0xBEBBBD41_C5D26BF1
const P5 = 4.13813679705723846039e-8; //  0x3E663769_72BEA4D0

/**
 * Above this exp returns Infinity and below `EXP_MIN` it returns 0. The
 * range keeps the scale factor 2^k a normal double: k stays in
 * [-1021, 1023], so the final multiply is exact.
 */
const EXP_MAX = 709;
const EXP_MIN = -708;

const scaleBits = new DataView(new ArrayBuffer(8));

/** 2^k for integer k in [-1022, 1023], built from its exponent bits. */
function powerOfTwo(k: number): number {
  scaleBits.setUint32(0, (k + 1023) * 0x100000);
  scaleBits.setUint32(4, 0);
  return scaleBits.getFloat64(0);
}

/**
 * e^x. Within 2 ulp on [-50, 0], the range the spring easing uses, and of
 * the same construction everywhere else. Returns Infinity above 709, 0
 * below -708, and NaN for NaN.
 *
 * x = k ln2 + r with |r| <= ln2/2, so e^x = 2^k e^r. The reduction is exact
 * (see `LN2_HI`). e^r comes from fdlibm's rational form: with
 * c = r - (R(r) - 2), e^r = 1 + r + r c / (2 - c), evaluated as
 * `1 - ((lo - r c / (2 - c)) - hi)` so that r enters as its exact two
 * parts. Then 2^k scales without rounding.
 */
export function detExp(x: number): number {
  // NaN would come out as NaN anyway in JavaScript, but a C port converts k
  // to an integer, which is undefined behaviour for NaN.
  if (x !== x) return NaN;
  if (x > EXP_MAX) return Infinity;
  if (x < EXP_MIN) return 0;
  const k = Math.floor(x * INV_LN2 + 0.5);
  const hi = x - k * LN2_HI;
  const lo = k * LN2_LO;
  const r = hi - lo;
  const t = r * r;
  const c = r - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  const y = 1 - (lo - (r * c) / (2 - c) - hi);
  return y * powerOfTwo(k);
}
