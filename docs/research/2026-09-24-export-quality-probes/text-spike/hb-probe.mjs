// Phase 5C Task 6, Q1: does harfbuzzjs load and instantiate its wasm, both
// under `npm run dev` and inside a real `npm run build` + `vite preview`
// page? Not production code -- nothing in src/ imports this or harfbuzzjs
// yet.
//
// Used two ways:
//   - dev: dynamically imported from an already-loaded page
//     (`await import("/docs/.../hb-probe.mjs")`), then `runHbProbe()` is
//     called explicitly. Exactly how run.mjs loads textSpikeProbe.ts.
//   - build: q1-build-check.mjs temporarily adds a
//     `<script type="module" src="/docs/.../hb-probe.mjs">` tag to
//     index.html so a real `vite build` bundles this module (and
//     harfbuzzjs) into dist/, then reverts index.html. In that mode there
//     is no import() to call, so this file also runs itself as a
//     side-effecting top-level statement and stashes the result on
//     `window.__hbProbeResult` for the driver to read back.
import * as hb from "harfbuzzjs";

export async function runHbProbe() {
  try {
    const buf = await (await fetch("/fonts/JetBrainsMono-Regular.ttf")).arrayBuffer();
    const blob = new hb.Blob(buf);
    const face = new hb.Face(blob);
    const font = new hb.Font(face);
    const b = new hb.Buffer();
    b.addText("hb-probe-ok");
    b.guessSegmentProperties();
    hb.shape(font, b);
    const infos = b.getGlyphInfos();
    const result = {
      ok: true,
      upem: face.upem,
      glyphCount: infos.length,
      firstGlyphId: infos[0]?.codepoint ?? null,
    };
    window.__hbProbeResult = result;
    return result;
  } catch (e) {
    const result = { ok: false, error: String(e && e.stack ? e.stack : e) };
    window.__hbProbeResult = result;
    return result;
  }
}

runHbProbe().then((r) => console.log("HB_PROBE_RESULT", JSON.stringify(r)));
