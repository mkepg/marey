import { chromium } from "playwright";
const b = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle"],
});
const p = await b.newPage();
await p.setContent("<canvas id=c></canvas>");
const info = await p.evaluate(() => {
  const c = document.getElementById("c");
  const gl = c.getContext("webgl2") || c.getContext("webgl");
  if (!gl) return { ok: false, why: "no webgl context" };
  const d = gl.getExtension("WEBGL_debug_renderer_info");
  return { ok: true, renderer: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
});
console.log(JSON.stringify(info));
console.log("webgpu:", await p.evaluate(() => !!navigator.gpu));
await b.close();
