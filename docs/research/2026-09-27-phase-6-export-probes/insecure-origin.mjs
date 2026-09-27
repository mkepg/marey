// Throwaway. Stage-by-stage, with a small frame count, three transports:
// (a) POST to a page.route-intercepted origin, (b) POST to a real Node http server on 127.0.0.1, (c) exposeBinding base64.
import { chromium } from "playwright";
import http from "node:http";
const N = Number(process.env.N ?? 5);
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const args = process.argv.includes("--swiftshader") ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [];
let t = Date.now();
const browser = await chromium.launch({ args });
log("launched", Date.now() - t, "ms", args);
const page = await browser.newPage();
let routedBytes = 0;
await page.route("http://marey.export/**", async (route) => {
  const req = route.request();
  if (req.method() === "POST") { routedBytes += (req.postDataBuffer() ?? Buffer.alloc(0)).length; return route.fulfill({ status: 204 }); }
  return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>x</title>" });
});
t = Date.now(); await page.goto("http://marey.export/"); log("goto routed page", Date.now() - t, "ms");
const caps = await page.evaluate(async () => {
  const gl = document.createElement("canvas").getContext("webgl2");
  const dbg = gl && gl.getExtension("WEBGL_debug_renderer_info");
  const avc = typeof VideoEncoder !== "undefined" ? await VideoEncoder.isConfigSupported({ codec: "avc1.42001f", width: 1600, height: 1200, bitrate: 8e6 }) : null;
  const vp9 = typeof VideoEncoder !== "undefined" ? await VideoEncoder.isConfigSupported({ codec: "vp09.00.10.08", width: 1600, height: 1200, bitrate: 8e6 }) : null;
  return { webgl2: !!gl, renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null, avc: avc?.supported, vp9: vp9?.supported, secure: isSecureContext };
});
log("caps", JSON.stringify(caps));

// (b) real server
let srvBytes = 0;
const srv = http.createServer((req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  if (req.method === "OPTIONS") { res.setHeader("access-control-allow-methods", "POST"); res.setHeader("access-control-allow-headers", "*"); return res.end(); }
  req.on("data", (c) => (srvBytes += c.length)); req.on("end", () => { res.statusCode = 204; res.end(); });
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const port = srv.address().port;
t = Date.now();
await page.evaluate(async ({ N, port }) => {
  const f = new Uint8Array(1600 * 1200 * 4);
  for (let i = 0; i < N; i++) { f[0] = i; await fetch(`http://127.0.0.1:${port}/f/${i}`, { method: "POST", body: f }); }
}, { N, port });
let dt = Date.now() - t; log(`(b) localhost http: ${N} frames, ${(srvBytes / 1e6).toFixed(1)} MB, ${dt} ms, ${(srvBytes / 1e6 / (dt / 1000)).toFixed(0)} MB/s`);

// (c) exposeBinding base64
let bindBytes = 0;
await page.exposeBinding("__put", (_s, b64) => { bindBytes += Buffer.from(b64, "base64").length; });
t = Date.now();
await page.evaluate(async (N) => {
  const f = new Uint8Array(1600 * 1200 * 4);
  for (let i = 0; i < N; i++) {
    f[0] = i;
    const b64 = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(",")[1]); fr.readAsDataURL(new Blob([f])); });
    await window.__put(b64);
  }
}, N);
dt = Date.now() - t; log(`(c) exposeBinding b64: ${N} frames, ${(bindBytes / 1e6).toFixed(1)} MB, ${dt} ms, ${(bindBytes / 1e6 / (dt / 1000)).toFixed(0)} MB/s`);

// (a) routed POST, 1 frame only, with a timeout
t = Date.now();
const r = await Promise.race([
  page.evaluate(async () => { const f = new Uint8Array(1600 * 1200 * 4); await fetch("http://marey.export/f/0", { method: "POST", body: f }); return "ok"; }),
  new Promise((res) => setTimeout(() => res("TIMEOUT 60s"), 60000)),
]);
log(`(a) page.route POST, 1 frame: ${r}, ${(routedBytes / 1e6).toFixed(1)} MB, ${Date.now() - t} ms`);
srv.close(); await browser.close(); log("done");
process.exit(0);
