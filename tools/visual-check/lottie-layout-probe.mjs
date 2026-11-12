/**
 * Measures, in two real Lottie players, the four document layouts the fitted
 * keyframe encoder relies on. It needs no Marey code: every document is
 * written here by hand.
 *
 * For each question it builds two 200x200, 60-frame, 30 fps documents with one
 * 40x40 rectangle layer:
 *
 *   - a CANDIDATE that uses the layout in question, and
 *   - a REFERENCE that encodes the same motion as one linear keyframe per
 *     frame (the layout the per-frame encoder emits), with every value
 *     computed by evaluating the candidate's cubic at that frame.
 *
 * Both are rendered with `lottie-render-worker.mjs` (its `--input`/`--output`
 * JSON contract is documented in that file's header) in `lottie-web` and
 * `dotlottie-web`, at frames 0, 7, 15, 15.5, 30, 44 and 59, and compared pixel
 * by pixel. A row passes when the maximum channel delta is 2 or less.
 *
 * Two verdicts are printed. The primary one compares against the per-frame
 * reference, which draws a straight chord between samples and so is wrong at
 * the fractional frame 15.5. The deciding one compares against a reference
 * keyed every half frame, which is what separates a layout error from chord
 * error. The exit code follows the deciding verdict: 0 when every
 * non-diagnostic row passes against the half-frame reference, 1 when any
 * fails or errors. A player that really misreads a layout (dotlottie-web on
 * per-component easing) therefore makes the exit code 1.
 *
 * Questions:
 *   split-position      p: {s: true, x: {...}, y: {...}}, x and y keyframed at
 *                       different times.
 *   per-component-ease  scale and fill colour whose components carry their own
 *                       easing (handle y is an array).
 *   overshoot-handles   a segment with o.y = 1.4 and i.y = 1.2 (outside [0, 1]).
 *   bare-final-key      a last keyframe with `t` and `s` only.
 *
 * In Lottie both easing handles of a segment (`o` and `i`) sit on the keyframe
 * that STARTS the segment; lottie-web reads both from the leaving keyframe.
 *
 * Usage: node tools/visual-check/lottie-layout-probe.mjs --out <dir>
 * Writes <dir>/report.json and one folder of frame PNGs per document.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const outDir = resolve(arg("out", ".visual-check/lottie-probe"));
const workerPath = resolve(here, "lottie-render-worker.mjs");
const lottiePath = resolve(root, "node_modules/lottie-web/build/player/lottie.min.js");
const dotlottiePath = resolve(root, "node_modules/@lottiefiles/dotlottie-web/dist/index.js");
const dotlottieWasmPath = resolve(root, "node_modules/@lottiefiles/dotlottie-web/dist/dotlottie-player.wasm");

const FRAMES = [0, 7, 15, 15.5, 30, 44, 59];
const FRAME_COUNT = 60;
const TOLERANCE = 2;
const RENDERERS = ["lottie-web", "dotlottie-web"];

// ---- easing model --------------------------------------------------------

// Cubic-bezier handles of one segment, one entry per component.
const LINEAR = { ox: 1 / 3, oy: 1 / 3, ix: 2 / 3, iy: 2 / 3 };
const EASE_IN = { ox: 1 / 3, oy: 0, ix: 2 / 3, iy: 1 / 3 };
const EASE_OUT = { ox: 1 / 3, oy: 2 / 3, ix: 2 / 3, iy: 1 };

/** Eased progress at time fraction `frac`: solves x(s) = frac, returns y(s). */
function ease(h, frac) {
  if (frac <= 0) return 0;
  if (frac >= 1) return 1;
  const bez = (a, b, s) => 3 * (1 - s) * (1 - s) * s * a + 3 * (1 - s) * s * s * b + s * s * s;
  let lo = 0;
  let hi = 1;
  for (let n = 0; n < 80; n++) {
    const mid = (lo + hi) / 2;
    if (bez(h.ox, h.ix, mid) < frac) lo = mid;
    else hi = mid;
  }
  return bez(h.oy, h.iy, (lo + hi) / 2);
}

/**
 * A track: `keys` is [{ t, s: number[], seg?: handles[] }]. `seg` (one handle
 * set per component) is on the keyframe that starts the segment; the last
 * key has none.
 */
function valueAt(keys, frame) {
  if (frame <= keys[0].t) return keys[0].s.slice();
  const last = keys[keys.length - 1];
  if (frame >= last.t) return last.s.slice();
  let k = 0;
  while (keys[k + 1].t <= frame) k++;
  const a = keys[k];
  const b = keys[k + 1];
  const frac = (frame - a.t) / (b.t - a.t);
  return a.s.map((v0, c) => v0 + (b.s[c] - v0) * ease(a.seg[c], frac));
}

/** Lottie keyframes for a track. `bareFinal` drops the last key's handles. */
function emitKeys(keys, bareFinal, handleShape = "per-component") {
  return keys.map((key, n) => {
    const isLast = n === keys.length - 1;
    const out = { t: key.t, s: key.s.slice() };
    if (isLast && bareFinal) return out;
    const seg = isLast ? key.s.map(() => LINEAR) : key.seg;
    if (handleShape === "scalar") {
      out.o = { x: seg[0].ox, y: seg[0].oy };
      out.i = { x: seg[0].ix, y: seg[0].iy };
    } else if (handleShape === "array1") {
      out.o = { x: [seg[0].ox], y: [seg[0].oy] };
      out.i = { x: [seg[0].ix], y: [seg[0].iy] };
    } else {
      out.o = { x: seg.map((h) => h.ox), y: seg.map((h) => h.oy) };
      out.i = { x: seg.map((h) => h.ix), y: seg.map((h) => h.iy) };
    }
    return out;
  });
}

/**
 * One linear keyframe per frame (`step` 1), computed from the candidate's
 * cubic. A `step` of 0.5 gives the dense variant used to tell layout error
 * from chord error at half frames.
 */
function perFrameKeys(keys, step = 1) {
  const dims = keys[0].s.length;
  const lin = Array.from({ length: dims }, () => LINEAR);
  const out = [];
  for (let t = 0; t <= FRAME_COUNT - 1 + 1e-9; t += step) out.push({ t, s: valueAt(keys, t), seg: lin });
  return out;
}

// ---- document builder ----------------------------------------------------

const still = (k) => ({ a: 0, k });
const animated = (keys, bareFinal = false, handleShape = "per-component") => ({
  a: 1,
  k: emitKeys(keys, bareFinal, handleShape),
});

function document_(name, { p, s, c }) {
  return {
    v: "5.7.0",
    fr: 30,
    ip: 0,
    op: FRAME_COUNT,
    w: 200,
    h: 200,
    nm: name,
    ddd: 0,
    assets: [],
    layers: [
      {
        ddd: 0,
        ind: 1,
        ty: 4,
        nm: "box",
        sr: 1,
        ip: 0,
        op: FRAME_COUNT,
        st: 0,
        ks: {
          o: still(100),
          r: still(0),
          p,
          a: still([0, 0, 0]),
          s,
        },
        shapes: [
          {
            ty: "gr",
            nm: "g",
            it: [
              { ty: "rc", nm: "r", p: still([0, 0]), s: still([40, 40]), r: still(0) },
              { ty: "fl", nm: "f", c, o: still(100) },
              {
                ty: "tr",
                p: still([0, 0]),
                a: still([0, 0]),
                s: still([100, 100]),
                r: still(0),
                o: still(100),
                sk: still(0),
                sa: still(0),
              },
            ],
          },
        ],
      },
    ],
  };
}

const REST_P = still([100, 100, 0]);
const REST_S = still([100, 100, 100]);
const REST_C = still([0.22, 0.74, 0.97, 1]);

// ---- the four questions --------------------------------------------------

const seg3 = (h) => [h, h, h];

/**
 * A question: a candidate document and a reference factory. `reference(step)`
 * rebuilds the per-frame reference at that keyframe spacing.
 */
function question(id, candidate, reference, diagnostic = false) {
  return { id, diagnostic, candidate, reference };
}

function questions() {
  // 1. Split position. x: one eased segment over 0..59; y: keyed 0, 30, 59.
  const xKeys = [
    { t: 0, s: [30], seg: [EASE_OUT] },
    { t: 59, s: [170] },
  ];
  const yKeys = [
    { t: 0, s: [40], seg: [EASE_IN] },
    { t: 30, s: [160], seg: [EASE_OUT] },
    { t: 59, s: [60] },
  ];
  const q1 = question(
    "split-position",
    document_("split-position", {
      p: { s: true, x: animated(xKeys), y: animated(yKeys) },
      s: REST_S,
      c: REST_C,
    }),
    (step) => {
      const combined = [];
      for (let t = 0; t <= FRAME_COUNT - 1 + 1e-9; t += step) {
        combined.push({ t, s: [valueAt(xKeys, t)[0], valueAt(yKeys, t)[0], 0], seg: seg3(LINEAR) });
      }
      return document_("split-position-ref", { p: animated(combined), s: REST_S, c: REST_C });
    },
  );

  // 2. Per-component easing on scale and colour.
  const scaleKeys = [
    { t: 0, s: [100, 100, 100], seg: [LINEAR, EASE_IN, LINEAR] },
    { t: 59, s: [200, 45, 100] },
  ];
  const colourKeys = [
    { t: 0, s: [0.22, 0.74, 0.97, 1], seg: [LINEAR, EASE_IN, EASE_OUT, LINEAR] },
    { t: 59, s: [0.98, 0.45, 0.09, 1] },
  ];
  const q2 = question(
    "per-component-ease",
    document_("per-component-ease", { p: REST_P, s: animated(scaleKeys), c: animated(colourKeys) }),
    (step) =>
      document_("per-component-ease-ref", {
        p: REST_P,
        s: animated(perFrameKeys(scaleKeys, step)),
        c: animated(perFrameKeys(colourKeys, step)),
      }),
  );
  // Diagnostics: which of the two properties the players disagree on.
  const q2s = question(
    "per-component-ease/scale-only",
    document_("pce-scale", { p: REST_P, s: animated(scaleKeys), c: REST_C }),
    (step) => document_("pce-scale-ref", { p: REST_P, s: animated(perFrameKeys(scaleKeys, step)), c: REST_C }),
    true,
  );
  const q2c = question(
    "per-component-ease/colour-only",
    document_("pce-colour", { p: REST_P, s: REST_S, c: animated(colourKeys) }),
    (step) => document_("pce-colour-ref", { p: REST_P, s: REST_S, c: animated(perFrameKeys(colourKeys, step)) }),
    true,
  );

  // Diagnostics: one easing shared by every component, written as a scalar
  // handle or as a one-element array. These are the layouts to fall back on
  // if a player ignores per-component handles.
  const sharedScale = [
    { t: 0, s: [100, 100, 100], seg: seg3(EASE_OUT) },
    { t: 59, s: [200, 45, 100] },
  ];
  const sharedColour = [
    { t: 0, s: [0.22, 0.74, 0.97, 1], seg: [EASE_OUT, EASE_OUT, EASE_OUT, EASE_OUT] },
    { t: 59, s: [0.98, 0.45, 0.09, 1] },
  ];
  const sharedQuestion = (id, shape) =>
    question(
      id,
      document_(id, {
        p: REST_P,
        s: animated(sharedScale, false, shape),
        c: animated(sharedColour, false, shape),
      }),
      (step) =>
        document_(`${id}-ref`, {
          p: REST_P,
          s: animated(perFrameKeys(sharedScale, step)),
          c: animated(perFrameKeys(sharedColour, step)),
        }),
      true,
    );
  const qShared1 = sharedQuestion("shared-ease/scalar-handles", "scalar");
  const qShared2 = sharedQuestion("shared-ease/one-element-arrays", "array1");
  const qShared3 = sharedQuestion("shared-ease/per-component-arrays", "per-component");

  // 3. Overshoot handles: o.y = 1.4, i.y = 1.2. The handles are per-component
  // on a position whose y and z do not move, so this tests overshoot, not
  // per-component easing (question 2 does that).
  const OVERSHOOT = { ox: 1 / 3, oy: 1.4, ix: 2 / 3, iy: 1.2 };
  const overKeys = [
    { t: 0, s: [30, 100, 0], seg: [OVERSHOOT, LINEAR, LINEAR] },
    { t: 59, s: [140, 100, 0] },
  ];
  const q3 = question(
    "overshoot-handles",
    document_("overshoot-handles", { p: animated(overKeys), s: REST_S, c: REST_C }),
    (step) => document_("overshoot-handles-ref", { p: animated(perFrameKeys(overKeys, step)), s: REST_S, c: REST_C }),
  );

  // 4. Final keyframe with `t` and `s` only.
  const bareKeys = [
    { t: 0, s: [30, 100, 0], seg: seg3(EASE_OUT) },
    { t: 30, s: [150, 50, 0], seg: seg3(EASE_IN) },
    { t: 59, s: [60, 150, 0] },
  ];
  const q4 = question(
    "bare-final-key",
    document_("bare-final-key", { p: animated(bareKeys, true), s: REST_S, c: REST_C }),
    (step) => document_("bare-final-key-ref", { p: animated(perFrameKeys(bareKeys, step)), s: REST_S, c: REST_C }),
  );

  return [q1, q2, q3, q4, q2s, q2c, qShared1, qShared2, qShared3];
}

// ---- PNG decode (8-bit, non-interlaced, colour types 2 and 6) -------------

function decodePng(buf) {
  let pos = 8;
  let width = 0;
  let height = 0;
  let colourType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colourType = data[9];
      if (data[8] !== 8 || data[12] !== 0 || (colourType !== 2 && colourType !== 6)) {
        throw new Error("unsupported PNG layout");
      }
    } else if (type === "IDAT") {
      idat.push(data);
    }
    pos += 12 + len;
  }
  const bpp = colourType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const rgba = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = new Uint8Array(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = (line[i] + add) & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      rgba[o] = line[x * bpp];
      rgba[o + 1] = line[x * bpp + 1];
      rgba[o + 2] = line[x * bpp + 2];
      rgba[o + 3] = bpp === 4 ? line[x * bpp + 3] : 255;
    }
    prev = line;
  }
  return { width, height, rgba };
}

function maxDelta(pathA, pathB) {
  const a = decodePng(readFileSync(pathA));
  const b = decodePng(readFileSync(pathB));
  if (a.width !== b.width || a.height !== b.height) throw new Error("size mismatch");
  let max = 0;
  let differing = 0;
  for (let i = 0; i < a.rgba.length; i += 4) {
    let px = 0;
    for (let c = 0; c < 4; c++) px = Math.max(px, Math.abs(a.rgba[i + c] - b.rgba[i + c]));
    if (px > 0) differing++;
    if (px > max) max = px;
  }
  return { max, differing };
}

// ---- rendering -----------------------------------------------------------

function render(doc, renderer, dir, label) {
  mkdirSync(dir, { recursive: true });
  const inputPath = resolve(dir, `${label}.input.json`);
  const outputPath = resolve(dir, `${label}.output.json`);
  writeFileSync(resolve(dir, `${label}.lottie.json`), JSON.stringify(doc));
  writeFileSync(
    inputPath,
    JSON.stringify({
      doc,
      renderer,
      requestedFrames: FRAMES,
      atPoints: [],
      pngExport: null,
      lottiePath,
      dotlottiePath,
      dotlottieWasmPath,
      headed: false,
      outDir: dir,
      inkRegion: null,
    }),
  );
  const run = spawnSync(process.execPath, [workerPath, "--input", inputPath, "--output", outputPath], {
    encoding: "utf8",
  });
  let result;
  try {
    result = JSON.parse(readFileSync(outputPath, "utf8"));
  } catch {
    result = { ok: false, error: `no worker output (exit ${run.status}): ${run.stderr}` };
  }
  return result;
}

// ---- main ----------------------------------------------------------------

function compareFrames(cand, ref) {
  return cand.frameSamples.map((cs, n) => {
    const d = maxDelta(cs.png, ref.frameSamples[n].png);
    return { frame: cs.frame, maxDelta: d.max, differingPixels: d.differing };
  });
}

mkdirSync(outDir, { recursive: true });
const rows = [];
for (const q of questions()) {
  for (const renderer of RENDERERS) {
    const base = resolve(outDir, `${q.id.replace("/", "-")}-${renderer}`);
    // Each document goes into its own folder: the worker names PNGs by frame.
    const cand = render(q.candidate, renderer, resolve(base, "candidate"), "candidate");
    const ref = render(q.reference(1), renderer, resolve(base, "reference"), "reference");
    const dense = render(q.reference(0.5), renderer, resolve(base, "reference-dense"), "reference-dense");
    const row = { question: q.id, renderer, diagnostic: q.diagnostic };
    const failed = [["candidate", cand], ["reference", ref], ["dense reference", dense]].find(([, r]) => !r.ok);
    if (failed) {
      row.verdict = "error";
      row.error = `${failed[0]}: ${failed[1].error}`;
      row.maxDelta = null;
    } else {
      const frames = compareFrames(cand, ref);
      const denseFrames = compareFrames(cand, dense);
      row.maxDelta = Math.max(...frames.map((f) => f.maxDelta));
      row.maxDeltaWholeFrames = Math.max(...frames.filter((f) => Number.isInteger(f.frame)).map((f) => f.maxDelta));
      // Against a reference keyed every half frame, a remaining delta at
      // frame 15.5 is layout error, not the chord of the per-frame line.
      row.maxDeltaDenseReference = Math.max(...denseFrames.map((f) => f.maxDelta));
      row.frames = frames;
      row.framesDenseReference = denseFrames;
      row.lottieErrors = [...(cand.lottieErrors ?? []), ...(ref.lottieErrors ?? [])];
      row.verdict = row.maxDelta <= TOLERANCE && row.lottieErrors.length === 0 ? "pass" : "fail";
      row.verdictDenseReference =
        row.maxDeltaDenseReference <= TOLERANCE && row.lottieErrors.length === 0 ? "pass" : "fail";
    }
    rows.push(row);
  }
}

writeFileSync(resolve(outDir, "report.json"), JSON.stringify({ tolerance: TOLERANCE, frames: FRAMES, rows }, null, 2));

const pad = (v, n) => String(v).padEnd(n);
console.log(
  `${pad("question", 38)}${pad("renderer", 15)}${pad("max delta", 11)}${pad("whole frames", 14)}${pad("dense ref", 11)}verdict (dense)`,
);
for (const r of rows) {
  console.log(
    `${pad(r.question, 38)}${pad(r.renderer, 15)}${pad(r.maxDelta ?? "-", 11)}${pad(r.maxDeltaWholeFrames ?? "-", 14)}${pad(r.maxDeltaDenseReference ?? "-", 11)}${r.verdict} (${r.verdictDenseReference ?? "-"})${r.error ? `  ${r.error}` : ""}`,
  );
}
process.exit(rows.filter((r) => !r.diagnostic).every((r) => r.verdictDenseReference === "pass") ? 0 : 1);
