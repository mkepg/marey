// Probe: does extract.canvas({ antialias: true }) actually antialias?
import { Application, Graphics, Rectangle } from "pixi.js";

function intermediate(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext("2d")!;
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 10 && d[i] < 245) n++;
  return n;
}

export async function run(opts: { antialias: boolean; extractResolution: number }) {
  const app = new Application();
  await app.init({ width: 200, height: 200, antialias: opts.antialias, resolution: 1, autoDensity: false, background: "#000000", backgroundAlpha: 1, autoStart: false });
  const g = new Graphics().circle(100, 100, 70).fill(0xffffff);
  const r = app.renderer as unknown as { type: number; context?: { webGLVersion: number; supports: { msaa: boolean } }; gl?: WebGL2RenderingContext };
  const extracted = app.renderer.extract.canvas({ target: g, frame: new Rectangle(0, 0, 200, 200), resolution: opts.extractResolution, antialias: true, clearColor: [0, 0, 0, 1] }) as HTMLCanvasElement;
  let downscaled = extracted;
  if (opts.extractResolution !== 1) {
    downscaled = document.createElement("canvas");
    downscaled.width = 200; downscaled.height = 200;
    const x = downscaled.getContext("2d")!;
    x.imageSmoothingQuality = "high";
    x.drawImage(extracted, 0, 0, 200, 200);
  }
  const out = {
    rendererType: r.type,
    webGLVersion: r.context?.webGLVersion,
    supportsMsaa: r.context?.supports.msaa,
    maxSamples: r.gl?.getParameter(r.gl.MAX_SAMPLES),
    glRenderer: r.gl ? r.gl.getParameter(r.gl.RENDERER) : null,
    extractedSize: [extracted.width, extracted.height],
    edgePixels: intermediate(downscaled),
  };
  app.destroy({ removeView: true, releaseGlobalResources: false }, { children: true });
  return out;
}
