// Throwaway. (b) page AND sink on one 127.0.0.1 http server; (a) page.route on an https:// fake origin.
import { chromium } from "playwright";
import http from "node:http";
const N = Number(process.env.N ?? 30);
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const browser = await chromium.launch();
const capsFn = async () => {
  const gl = document.createElement("canvas").getContext("webgl2");
  const dbg = gl && gl.getExtension("WEBGL_debug_renderer_info");
  const q = (codec) => VideoEncoder.isConfigSupported({ codec, width: 1600, height: 1200, bitrate: 8e6 }).then((r) => r.supported);
  return { secure: isSecureContext, renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,
    avc: typeof VideoEncoder === "undefined" ? "no VideoEncoder" : await q("avc1.42001f"), vp9: typeof VideoEncoder === "undefined" ? "-" : await q("vp09.00.10.08") };
};
const push = async ({ N, url }) => { const f = new Uint8Array(1600 * 1200 * 4); for (let i = 0; i < N; i++) { f[0] = i; await fetch(url + i, { method: "POST", body: f }); } };

// (b)
let srvBytes = 0;
const srv = http.createServer((req, res) => {
  if (req.method === "POST") { req.on("data", (c) => (srvBytes += c.length)); req.on("end", () => { res.statusCode = 204; res.end(); }); return; }
  res.setHeader("content-type", "text/html"); res.end("<!doctype html><title>x</title>");
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${srv.address().port}`;
const pb = await browser.newPage();
await pb.goto(origin + "/");
log("(b) caps", JSON.stringify(await pb.evaluate(capsFn)));
let t = Date.now();
await pb.evaluate(push, { N, url: origin + "/f/" });
let dt = Date.now() - t; log(`(b) localhost server: ${N} frames, ${(srvBytes / 1e6).toFixed(1)} MB, ${dt} ms, ${(srvBytes / 1e6 / (dt / 1000)).toFixed(0)} MB/s`);

// (a)
let routed = 0;
const pa = await browser.newPage();
await pa.route("https://marey.export/**", async (route) => {
  const req = route.request();
  if (req.method() === "POST") { routed += (req.postDataBuffer() ?? Buffer.alloc(0)).length; return route.fulfill({ status: 204 }); }
  return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>x</title>" });
});
await pa.goto("https://marey.export/");
log("(a) caps", JSON.stringify(await pa.evaluate(capsFn)));
t = Date.now();
const r = await Promise.race([pa.evaluate(push, { N: 2, url: "https://marey.export/f/" }).then(() => "ok"), new Promise((res) => setTimeout(() => res("TIMEOUT 90s"), 90000))]);
log(`(a) page.route POST, 2 frames: ${r}, ${(routed / 1e6).toFixed(1)} MB, ${Date.now() - t} ms`);
srv.close(); await browser.close(); process.exit(0);
