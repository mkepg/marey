import { describe, it, expect } from "vitest";
import { crc32, encodeApng } from "./apngEncode";

/**
 * A tiny in-test chunk reader, independent of `apngEncode.ts`'s own chunk
 * writer -- it exists so a bug in the muxer's own parsing (if it had any)
 * could not make this test agree with it by construction. Returns each
 * chunk's `type`, `data`, and the trailing 4-byte `crc` field as it sits on
 * the wire, for the "every chunk has a correct CRC" test below.
 */
function chunks(bytes: Uint8Array): { type: string; data: Uint8Array; crc: number }[] {
  const out = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let o = 8; o < bytes.length; ) {
    const len = view.getUint32(o);
    const type = String.fromCharCode(...bytes.subarray(o + 4, o + 8));
    const data = bytes.subarray(o + 8, o + 8 + len);
    const crc = view.getUint32(o + 8 + len);
    out.push({ type, data, crc });
    o += 12 + len;
  }
  return out;
}

/**
 * An independent CRC-32 table and function -- deliberately NOT
 * `apngEncode.ts`'s `crc32` re-imported under a different name. If
 * `apngEncode.ts`'s own CRC implementation were wrong in a way consistent
 * with itself, reusing it here to build fixtures and to check its own output
 * would let the mistake cancel out. This is the standard IEEE 802.3 /
 * PNG-spec CRC-32 (polynomial 0xEDB88320, reflected), the same algorithm
 * `apngEncode.ts`'s comment cites -- written from the algorithm, not from
 * that file's source.
 */
const TEST_CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function testCrc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TEST_CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Builds one on-wire chunk (len, type, data, crc), using `testCrc32` above. */
function buildChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array(type.length);
  for (let i = 0; i < type.length; i++) typeBytes[i] = type.charCodeAt(i);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  const out = new Uint8Array(4 + body.length + 4);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  out.set(body, 4);
  v.setUint32(4 + body.length, testCrc32(body));
  return out;
}

/**
 * A minimal valid PNG: signature, IHDR (w, h, 8-bit RGBA -- colour type 6,
 * matching what Task 5's Step 1 measured Chromium's own encoder emit), one
 * IDAT with `payload`, IEND. Built with `buildChunk`/`testCrc32` above, never
 * with `apngEncode.ts`'s own chunk writer -- a fakePng built with the code
 * under test could not fail against that same code.
 */
function fakePng(w: number, h: number, payload: number[]): Uint8Array {
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, w);
  v.setUint32(4, h);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour with alpha (RGBA)
  ihdr[10] = 0; // compression method
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace method

  const parts = [
    signature,
    buildChunk("IHDR", ihdr),
    buildChunk("IDAT", new Uint8Array(payload)),
    buildChunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

describe("crc32", () => {
  it("matches the PNG spec's check value for IEND", () => {
    expect(crc32(new TextEncoder().encode("IEND"))).toBe(0xae426082);
  });
  it("matches the standard check value for '123456789'", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("encodeApng", () => {
  const a = fakePng(4, 2, [1, 2, 3]),
    b = fakePng(4, 2, [4, 5]),
    c = fakePng(4, 2, [6]);

  it("writes IHDR, acTL, then fcTL before frame 0's IDAT, and fdAT for later frames", () => {
    const types = chunks(encodeApng([a, b, c], { fps: 30 })).map((x) => x.type);
    expect(types).toEqual(["IHDR", "acTL", "fcTL", "IDAT", "fcTL", "fdAT", "fcTL", "fdAT", "IEND"]);
  });

  it("declares the frame count and loops forever (num_plays 0)", () => {
    const actl = chunks(encodeApng([a, b, c], { fps: 30 })).find((x) => x.type === "acTL")!.data;
    const v = new DataView(actl.buffer, actl.byteOffset);
    expect([v.getUint32(0), v.getUint32(4)]).toEqual([3, 0]);
  });

  it("gives every frame a 1/fps delay, full size, dispose NONE, blend SOURCE", () => {
    const fctls = chunks(encodeApng([a, b], { fps: 24 })).filter((x) => x.type === "fcTL");
    for (const f of fctls) {
      const v = new DataView(f.data.buffer, f.data.byteOffset);
      expect([v.getUint32(4), v.getUint32(8), v.getUint32(12), v.getUint32(16)]).toEqual([4, 2, 0, 0]);
      expect([v.getUint16(20), v.getUint16(22), f.data[24], f.data[25]]).toEqual([1, 24, 0, 0]);
    }
  });

  it("numbers fcTL and fdAT chunks with one shared sequence from 0", () => {
    const cs = chunks(encodeApng([a, b, c], { fps: 30 })).filter((x) => x.type === "fcTL" || x.type === "fdAT");
    expect(cs.map((x) => new DataView(x.data.buffer, x.data.byteOffset).getUint32(0))).toEqual([0, 1, 2, 3, 4]);
  });

  it("carries each frame's image data unchanged after the fdAT sequence number", () => {
    const fdats = chunks(encodeApng([a, b, c], { fps: 30 })).filter((x) => x.type === "fdAT");
    expect([...fdats[0].data.subarray(4)]).toEqual([4, 5]);
    expect([...fdats[1].data.subarray(4)]).toEqual([6]);
  });

  it("writes a correct CRC on every chunk", () => {
    const bytes = encodeApng([a, b, c], { fps: 30 });
    for (const { type, data, crc } of chunks(bytes)) {
      const typeBytes = new Uint8Array(type.length);
      for (let i = 0; i < type.length; i++) typeBytes[i] = type.charCodeAt(i);
      const body = new Uint8Array(typeBytes.length + data.length);
      body.set(typeBytes, 0);
      body.set(data, typeBytes.length);
      expect(crc).toBe(testCrc32(body));
    }
    // Sanity: the file actually has more than one chunk, so this test could
    // not vacuously pass over an empty loop.
    expect(chunks(bytes).length).toBeGreaterThan(3);
  });

  it("refuses frames whose IHDR differs from frame 0's", () => {
    expect(() => encodeApng([a, fakePng(4, 3, [1])], { fps: 30 })).toThrow("frame 1's IHDR differs from frame 0's");
  });

  it("refuses zero frames and a non-PNG", () => {
    expect(() => encodeApng([], { fps: 30 })).toThrow("no frames");
    expect(() => encodeApng([new Uint8Array([1, 2, 3])], { fps: 30 })).toThrow("frame 0 is not a PNG");
  });

  // Delete-and-run (global constraint 11) found that the test above alone
  // does not pin the signature check: a 3-byte input trips the "no IHDR
  // chunk found" fallback regardless of whether the 8-byte signature is
  // ever inspected, so deleting the signature check left every test green.
  // This fixture isolates it: a well-formed chunk sequence (a real IHDR
  // sits at the same offset a valid PNG would put it) behind a corrupted
  // first signature byte, so only an actual signature check can catch it.
  it("refuses a frame whose signature is corrupted even though its chunks parse fine", () => {
    const corrupted = fakePng(4, 2, [1]);
    corrupted[0] = 0x00;
    expect(() => encodeApng([corrupted], { fps: 30 })).toThrow("frame 0 is not a PNG");
  });

  // Delete-and-run also found this line unreachable by every other test: a
  // valid signature followed by no IHDR chunk at all (truncated right after
  // the signature) is a distinct, legitimate way for a frame to have no
  // IHDR without ever tripping the signature check above.
  it("refuses a frame with a valid signature but no IHDR chunk", () => {
    const signatureOnly = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(() => encodeApng([signatureOnly], { fps: 30 })).toThrow("frame 0 is not a PNG");
  });

  it("refuses an fps that does not fit fcTL's u16 delay_den field", () => {
    expect(() => encodeApng([a], { fps: 0 })).toThrow("0");
    expect(() => encodeApng([a], { fps: 1.5 })).toThrow("1.5");
    expect(() => encodeApng([a], { fps: 65536 })).toThrow("65536");
  });

  // Step 1 measured that Chromium's own PNG encoder (a plain <canvas> and a
  // pixi extract.canvas() result alike) writes NO ancillary chunk between
  // IHDR and IDAT -- see the task report for the exact chunk lists. Pinned
  // here per the brief's "if it emits none, pin that with a test too": a
  // fakePng carries none, and the muxer must not invent one.
  it("carries forward none of frame 0's chunks besides IHDR/IDAT, when there are none to carry", () => {
    const types = chunks(encodeApng([a], { fps: 30 })).map((x) => x.type);
    expect(types).toEqual(["IHDR", "acTL", "fcTL", "IDAT", "IEND"]);
  });

  /**
   * Final review M-6. Chromium's encoder writes no ancillary chunk (the test
   * above), so this is the carry's only test. It uses a hand-built frame 0
   * with chunks on both sides of IDAT:
   * - `gAMA` and `pHYs` before it (PNG 3rd ed. Table 7: "Before PLTE and
   *   IDAT" and "Before IDAT");
   * - `tEXt` after it (ordering constraint "None").
   *
   * Each chunk keeps its side of the image data. The pre-IDAT ones go before
   * `acTL`, which must itself come before IDAT. The post-IDAT one goes after
   * the last `fdAT`, just before `IEND`. PNG's rule for editors is that a
   * copied unknown chunk keeps its position relative to IDAT, and the carry
   * is generic, so it cannot know the types it copies. Moving a post-IDAT
   * chunk ahead of IDAT, which the carry's first version did, breaks that
   * rule for any type whose position matters.
   */
  it("carries frame 0's ancillary chunks through, each on its own side of the image data", () => {
    const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = chunks(a).find((x) => x.type === "IHDR")!.data;
    const gama = new Uint8Array([0, 0, 0xb1, 0x8f]); // gamma 45455
    const phys = new Uint8Array([0, 0, 0x0b, 0x13, 0, 0, 0x0b, 0x13, 1]); // 2835 px/m, metre
    const text = new TextEncoder().encode("Comment\0carried");
    const parts = [
      signature,
      buildChunk("IHDR", ihdr),
      buildChunk("gAMA", gama),
      buildChunk("pHYs", phys),
      buildChunk("IDAT", new Uint8Array([1, 2, 3])),
      buildChunk("tEXt", text),
      buildChunk("IEND", new Uint8Array(0)),
    ];
    const frame0 = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
      frame0.set(p, o);
      o += p.length;
    }

    const out = chunks(encodeApng([frame0, b], { fps: 30 }));
    expect(out.map((x) => x.type)).toEqual([
      "IHDR", "gAMA", "pHYs", "acTL", "fcTL", "IDAT", "fcTL", "fdAT", "tEXt", "IEND",
    ]);
    // Carried byte for byte, with a valid CRC (checked independently).
    for (const [type, data] of [["gAMA", gama], ["pHYs", phys], ["tEXt", text]] as const) {
      const chunk = out.find((x) => x.type === type)!;
      expect([...chunk.data]).toEqual([...data]);
      const body = new Uint8Array(4 + chunk.data.length);
      body.set(new TextEncoder().encode(type), 0);
      body.set(chunk.data, 4);
      expect(chunk.crc).toBe(testCrc32(body));
    }
  });
});
