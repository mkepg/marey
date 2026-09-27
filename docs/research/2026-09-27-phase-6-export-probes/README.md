# Phase 6 export probes

Throwaway measurements behind the Phase 6 design's choice of how `marey export`
runs from a terminal
(`docs/specs/2026-09-27-marey-phase-6-packaging-and-legibility-design.md`, §4).
They are kept so the numbers the design cites can be re-run, not as tests. None
of them is part of any suite.

All runs: Windows 11, Node 22.13.1, Playwright 1.62.1 (Chromium build 1234,
default headless launch), 2026-09-27.

## `node-sample.test.ts`: the export prefix in plain Node

Builds and samples the four canonical scenes with the same modules
`withRasterExport` uses, in Node with no browser.

```bash
npx vitest run --config docs/research/2026-09-27-phase-6-export-probes/vitest.config.ts --reporter=verbose
```

| Scene | Result |
|---|---|
| `radial-dots` | 30 frames sampled |
| `compound-logo` | 240 frames sampled |
| `bar-chart` | `ReferenceError: document is not defined` at build |
| `timeline-ticks` | `ReferenceError: document is not defined` at build |

The two failures are the two scenes containing `text`: pixi's `Text` measures
itself on a canvas.

## `insecure-origin.mjs`: a page on a plain `http://` custom origin

```bash
node docs/research/2026-09-27-phase-6-export-probes/insecure-origin.mjs
```

- `isSecureContext` is false, and `VideoEncoder` does not exist.
- A `fetch` from that page to a `127.0.0.1` server fails ("Failed to fetch"):
  Chromium blocks a public-looking origin from reaching a local address.

So the export page must be served from `https://` or from `localhost`.

## `secure-origins.mjs`: transport of raw 1600×1200 RGBA frames

```bash
node docs/research/2026-09-27-phase-6-export-probes/secure-origins.mjs
```

Both origins are secure contexts with WebGL2 on SwiftShader. The script's
`avc: false` is its own mistake: it asks for `avc1.42001f`, H.264 level 3.1,
which cannot code 1600×1200 (see the next script).

| Transport | Run 1 | Run 2 |
|---|---|---|
| (b) page and sink on one `127.0.0.1` Node `http` server, 30 frames | 8 MB/s | 27 MB/s |
| (a) `page.route` on `https://marey.export/`, 2 frames (15.4 MB) | 3,523 ms | 1,071 ms |

An earlier version pushed 180 raw frames (1.38 GB) through `page.route` and did
not finish within 300 s, which is consistent with run 1's rate.

## `evaluate-and-png.mjs`: H.264 levels, `evaluate` transport, PNG cost

```bash
node docs/research/2026-09-27-phase-6-export-probes/evaluate-and-png.mjs
```

| Measure | Run 1 | Run 2 |
|---|---|---|
| H.264 at 1600×1200: `avc1.420028` / `4d0028` / `640028` (level 4.0) | supported | supported |
| H.264 at 1600×1200: `avc1.42001f` (level 3.1) | not supported | not supported |
| `page.evaluate` returning a `Uint8Array`, 10 raw frames | 24 MB/s | 68 MB/s |
| `page.evaluate` returning base64, 10 raw frames | 22 MB/s | 62 MB/s |
| PNG of a flat 1600×1200 synthetic frame (`OffscreenCanvas.convertToBlob`) | 21.5 ms, 52,946 B | 4.7 ms, 52,946 B |

A raw frame is 7,680,000 B; the PNG is about 145× smaller and lossless. The
synthetic frame is a few flat shapes, not a Marey scene, so its size is an
estimate of the order of magnitude, not of any real scene.

## Playwright's bundled ffmpeg

`ms-playwright/ffmpeg-1011/ffmpeg-win64.exe -encoders` lists only `png` and
`libvpx` (VP8). It has no H.264 encoder and cannot stand in for a user's
ffmpeg.
