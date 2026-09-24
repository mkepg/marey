// Probe: lossless frames at a chosen raster scale, built with the pipeline's own
// pieces, then encoded/decoded under several raw WebCodecs configs and scored.
import { Application, Container, Rectangle } from "pixi.js";
import { compileSource } from "/src/compiler/compileSource";
import { planExport } from "/src/compiler/export/exportContract";
import { applySnapshot } from "/src/compiler/export/frameRaster";
import { buildNode } from "/src/compiler/renderer/builder";
import { sampleFrames } from "/src/compiler/renderer/frameSampler";
import { SceneRuntime } from "/src/compiler/renderer/sceneRuntime";
import { MatterWorld } from "/src/compiler/renderer/physicsWorld";

type Ref = { bmp: ImageBitmap; data: Uint8ClampedArray };

export async function lossless(source: string, scale: number): Promise<{ W: number; H: number; refs: Ref[] }> {
  const ir = compileSource(source).ir!;
  const planned = planExport(ir, { fps: 30 });
  if (!planned.ok) throw new Error("plan failed");
  const app = new Application();
  await app.init({ width: ir.width, height: ir.height, background: ir.background, backgroundAlpha: 1, antialias: true, resolution: 1, autoDensity: false, autoStart: false });
  const root = new Container();
  for (const n of ir.children) root.addChild(buildNode(n));
  const runtime = new SceneRuntime(new MatterWorld(ir.width, ir.height), root);
  const frames = sampleFrames(runtime, root, planned.plan);
  const region = new Rectangle(0, 0, ir.width, ir.height);
  const W = ir.width * scale, H = ir.height * scale;
  const refs: Ref[] = [];
  for (const f of frames) {
    applySnapshot(root, f);
    const c = app.renderer.extract.canvas({ target: root, frame: region, resolution: scale, clearColor: app.renderer.background.colorRgba, antialias: true }) as HTMLCanvasElement;
    const o = new OffscreenCanvas(W, H); const x = o.getContext("2d")!; x.drawImage(c, 0, 0);
    refs.push({ bmp: await createImageBitmap(o), data: x.getImageData(0, 0, W, H).data });
    c.width = 0; c.height = 0;
  }
  app.destroy({ removeView: true, releaseGlobalResources: false }, { children: true });
  return { W, H, refs };
}

export async function score(W: number, H: number, refs: Ref[], cfg: any) {
  const support = await VideoEncoder.isConfigSupported({ ...cfg.encoder, width: W, height: H });
  if (!support.supported) return { name: cfg.name, supported: false };
  const chunks: { type: EncodedVideoChunkType; ts: number; dur: number | null; b: Uint8Array }[] = [];
  let decCfg: VideoDecoderConfig | null = null;
  const enc = new VideoEncoder({
    output: (chunk, meta) => { if (meta?.decoderConfig) decCfg = meta.decoderConfig; const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); chunks.push({ type: chunk.type, ts: chunk.timestamp, dur: chunk.duration, b }); },
    error: (e) => { throw e; },
  });
  enc.configure({ ...cfg.encoder, width: W, height: H });
  for (let k = 0; k < refs.length; k++) {
    const vf = new VideoFrame(refs[k].bmp, { timestamp: Math.round((k * 1e6) / 30), duration: Math.round(1e6 / 30) });
    const opts: any = { keyFrame: k % 30 === 0 };
    if (cfg.quantizer != null) opts[cfg.qkey] = { quantizer: cfg.quantizer };
    enc.encode(vf, opts);
    vf.close();
    while (enc.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 1));
  }
  await enc.flush(); enc.close();
  const bytes = chunks.reduce((s, c) => s + c.b.length, 0);
  const decoded: { ts: number; data: Uint8ClampedArray }[] = [];
  const dec = new VideoDecoder({
    output: (f) => { const c = new OffscreenCanvas(W, H); const x = c.getContext("2d")!; x.drawImage(f, 0, 0); decoded.push({ ts: f.timestamp, data: x.getImageData(0, 0, W, H).data }); f.close(); },
    error: (e) => { throw e; },
  });
  dec.configure(decCfg!);
  for (const c of chunks) dec.decode(new EncodedVideoChunk({ type: c.type, timestamp: c.ts, duration: c.dur ?? undefined, data: c.b }));
  await dec.flush(); dec.close();
  decoded.sort((a, b) => a.ts - b.ts);
  let totalSpecks = 0, mseSum = 0;
  for (let k = 0; k < decoded.length; k++) {
    const a = decoded[k].data, b = refs[k].data;
    let se = 0;
    for (let i = 0; i < a.length; i += 4) {
      const dr = a[i] - b[i], dg = a[i + 1] - b[i + 1], db = a[i + 2] - b[i + 2];
      se += dr * dr + dg * dg + db * db;
      if (Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db)) > 64) totalSpecks++;
    }
    mseSum += se / ((a.length / 4) * 3);
  }
  return { name: cfg.name, W, H, supported: true, frames: decoded.length, kbps: Math.round((bytes * 8) / (refs.length / 30) / 1000), psnr: +(10 * Math.log10(65025 / (mseSum / decoded.length))).toFixed(2), specksPerFrame: +(totalSpecks / decoded.length).toFixed(1) };
}
