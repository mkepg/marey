/**
 * A pure, in-house APNG muxer. No pixi.js, no Scene IR, no DOM (spec §7's
 * boundary table) -- PNG chunk bytes go in, one APNG byte sequence comes
 * out, and there is a headless test for every claim below
 * (`apngEncode.test.ts`).
 *
 * Chunk layouts and the sequence-number rule are confirmed against the
 * Mozilla APNG Specification (<https://wiki.mozilla.org/APNG_Specification>,
 * read directly for this task):
 * - `acTL` (8 bytes): `num_frames` (u32), `num_plays` (u32, 0 = loop
 *   forever).
 * - `fcTL` (26 bytes): `sequence_number` (u32), `width`/`height` (u32),
 *   `x_offset`/`y_offset` (u32), `delay_num`/`delay_den` (u16),
 *   `dispose_op`/`blend_op` (u8 each). "The first fcTL chunk must contain
 *   sequence number 0", and its `x_offset`/`y_offset` must be 0 with
 *   dimensions matching IHDR when it is also the default image (true for
 *   every frame here -- see the full-frame judgment call below).
 * - `fdAT` (sequence_number (u32) + the IDAT payload for frames after the
 *   first): "Both chunk types [fcTL and fdAT] share the sequence [counter]"
 *   and "the sequence numbers ... must be in order, with no gaps or
 *   duplicates".
 */

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/**
 * PNG's CRC-32 (ISO 3309 / ITU-T V.42, the reflected 0xEDB88320 polynomial):
 * every chunk's trailing 4 bytes are this over `type ‖ data`. Tested against
 * the PNG spec's own published check values (`apngEncode.test.ts`).
 */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface ParsedChunk {
  readonly type: string;
  readonly data: Uint8Array;
}

/** Validates the 8-byte PNG signature, then returns every chunk that follows it, in file order. */
function readPngChunks(bytes: Uint8Array, frameIndex: number): ParsedChunk[] {
  const isPng =
    bytes.length >= 8 && PNG_SIGNATURE.every((sigByte, i) => bytes[i] === sigByte);
  if (!isPng) {
    throw new Error(`[export] frame ${frameIndex} is not a PNG`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: ParsedChunk[] = [];
  let o = 8;
  while (o + 12 <= bytes.length) {
    const len = view.getUint32(o);
    const type = String.fromCharCode(...bytes.subarray(o + 4, o + 8));
    chunks.push({ type, data: bytes.subarray(o + 8, o + 8 + len) });
    o += 12 + len; // length(4) + type(4) + data(len) + crc(4)
  }
  return chunks;
}

/** Writes one on-wire chunk: 4-byte length, 4-byte type, `data`, then `crc32(type ‖ data)`. */
function writeChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array(4);
  for (let i = 0; i < 4; i++) typeBytes[i] = type.charCodeAt(i);
  const body = new Uint8Array(4 + data.length);
  body.set(typeBytes, 0);
  body.set(data, 4);

  const out = new Uint8Array(4 + body.length + 4);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  out.set(body, 4);
  v.setUint32(4 + body.length, crc32(body));
  return out;
}

/** Every `IDAT` chunk's data, concatenated in file order -- PNG's zlib stream may be split across any number of them. */
function concatIdat(chunks: ReadonlyArray<ParsedChunk>): Uint8Array {
  const idats = chunks.filter((c) => c.type === "IDAT");
  const total = idats.reduce((n, c) => n + c.data.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of idats) {
    out.set(c.data, o);
    o += c.data.length;
  }
  return out;
}

/** A comparison key for IHDR bytes -- every field, byte for byte. */
function ihdrKey(ihdr: Uint8Array): string {
  return Array.from(ihdr).join(",");
}

/** `acTL` body (8 bytes): `num_frames`, `num_plays`. */
function acTL(numFrames: number, numPlays: number): Uint8Array {
  const b = new Uint8Array(8);
  const v = new DataView(b.buffer);
  v.setUint32(0, numFrames);
  v.setUint32(4, numPlays);
  return b;
}

/**
 * `fcTL` body (26 bytes): seq, w, h, x=0, y=0, delay 1/fps, dispose NONE,
 * blend SOURCE.
 *
 * The three judgment calls this task pins with a test each (spec §5.1),
 * flipped and reverted in Step 4 to confirm each is load-bearing:
 * - **`num_plays = 0`** (in `acTL`, not here): loop forever. An exported
 *   motion graphic that plays once and freezes is a worse default than one
 *   that loops the way the live preview, the Lottie export, and the video
 *   export's own player controls all already do.
 * - **`blend_op = SOURCE` (0), not `OVER` (1):** every frame here is already
 *   a full, independently rendered raster of the whole canvas
 *   (`frameRaster.ts`'s rasterizer redraws the entire scene per frame, never
 *   a delta), so compositing it `OVER` the previous frame would double-blend
 *   any pixel that is translucent in both frames. `SOURCE` replaces the
 *   region outright, which is what "already a complete frame" requires.
 * - **Full-frame (`x=0, y=0`, `width`/`height` = the whole canvas), not a
 *   diffed sub-region:** region diffing is a size optimisation (spec §5.1;
 *   design §10 lists it "not needed for correctness"). This task's job is a
 *   correct muxer, not a smaller file -- revisit only if a measured size is
 *   a problem.
 */
function fcTL(seq: number, w: number, h: number, fps: number): Uint8Array {
  const b = new Uint8Array(26),
    v = new DataView(b.buffer);
  v.setUint32(0, seq);
  v.setUint32(4, w);
  v.setUint32(8, h);
  v.setUint32(12, 0);
  v.setUint32(16, 0);
  v.setUint16(20, 1);
  v.setUint16(22, fps);
  b[24] = 0; // dispose_op: APNG_DISPOSE_OP_NONE
  b[25] = 0; // blend_op: APNG_BLEND_OP_SOURCE
  return b;
}

/** `fdAT` body: a 4-byte sequence number, then the frame's `IDAT` payload unchanged. */
function fdATBody(seq: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + payload.length);
  new DataView(out.buffer).setUint32(0, seq);
  out.set(payload, 4);
  return out;
}

function appendAll(parts: ReadonlyArray<Uint8Array>): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/**
 * Mux a sequence of single-frame PNGs (each already a complete, independent
 * PNG -- e.g. from `pngSequence.ts`'s `pngBytesOf`) into one APNG.
 *
 * Emits, in order: the PNG signature; frame 0's `IHDR`; any ancillary chunk
 * Chromium's own encoder wrote before `IDAT` in frame 0 (measured in Task 5
 * Step 1 to be none -- see `apngEncode.test.ts`'s zero-ancillary-chunk test
 * -- but carried through generically rather than assumed, in case a
 * different encoder ever adds one); `acTL`; then per frame an `fcTL` (frame
 * 0's precedes its `IDAT`, so a non-APNG viewer's default image is frame 0)
 * and that frame's image data, as `IDAT` for frame 0 and `fdAT` for every
 * later frame; `IEND`. `fcTL`/`fdAT` sequence numbers share one counter from
 * 0 (Mozilla APNG spec, this file's header comment).
 *
 * Throws, naming what is wrong:
 * - `frame N is not a PNG` -- missing signature;
 * - `no frames` -- `pngs` is empty;
 * - `frame N's IHDR differs from frame 0's` -- a per-frame colour-type or
 *   size change, which would corrupt the file (every `fcTL` here declares
 *   frame 0's own width/height and the whole file has one `IHDR`);
 * - an `fps` that does not fit `fcTL`'s `delay_den` (u16, 1..65535) or is
 *   not an integer, naming the value given.
 */
export function encodeApng(
  pngs: ReadonlyArray<Uint8Array>,
  opts: { readonly fps: number },
): Uint8Array {
  if (pngs.length === 0) {
    throw new Error("[export] encodeApng received no frames");
  }
  if (!Number.isInteger(opts.fps) || opts.fps < 1 || opts.fps > 65535) {
    throw new Error(
      `[export] encodeApng requires an integer fps in 1..65535 (fcTL's delay_den is a u16), got ${opts.fps}`,
    );
  }

  const parsed = pngs.map((bytes, i) => readPngChunks(bytes, i));

  const ihdr0 = parsed[0].find((c) => c.type === "IHDR");
  if (!ihdr0) throw new Error("[export] frame 0 is not a PNG");
  for (let i = 1; i < parsed.length; i++) {
    const ihdrI = parsed[i].find((c) => c.type === "IHDR");
    if (!ihdrI || ihdrKey(ihdrI.data) !== ihdrKey(ihdr0.data)) {
      throw new Error(`[export] frame ${i}'s IHDR differs from frame 0's`);
    }
  }
  const view0 = new DataView(ihdr0.data.buffer, ihdr0.data.byteOffset);
  const width = view0.getUint32(0);
  const height = view0.getUint32(4);

  // Ancillary chunks between IHDR and IDAT, from frame 0 only -- see this
  // function's own docstring and the header comment for why none is the
  // measured case, and why they are still carried generically.
  const ancillary0 = parsed[0].filter((c) => c.type !== "IHDR" && c.type !== "IDAT" && c.type !== "IEND");

  const parts: Uint8Array[] = [PNG_SIGNATURE, writeChunk("IHDR", ihdr0.data)];
  for (const c of ancillary0) parts.push(writeChunk(c.type, c.data));
  parts.push(writeChunk("acTL", acTL(pngs.length, 0)));

  let seq = 0;
  parts.push(writeChunk("fcTL", fcTL(seq, width, height, opts.fps)));
  seq += 1;
  parts.push(writeChunk("IDAT", concatIdat(parsed[0])));

  for (let i = 1; i < parsed.length; i++) {
    parts.push(writeChunk("fcTL", fcTL(seq, width, height, opts.fps)));
    seq += 1;
    parts.push(writeChunk("fdAT", fdATBody(seq, concatIdat(parsed[i]))));
    seq += 1;
  }

  parts.push(writeChunk("IEND", new Uint8Array(0)));

  return appendAll(parts);
}
