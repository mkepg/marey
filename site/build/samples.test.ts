import { describe, expect, it } from "vitest";
import { escapeHtml } from "./escape";
import { checkSample, renderSample, type Sample } from "./samples";

const GOOD = "scene {\n  size: (960, 540)\n  circle dot { position: (10, 10), radius: 4 }\n}";
const LOOP_STEP = `scene {
  size: (800, 600)
  rectangle card {
    position: (100, 300)
    size: (40, 40)
    sequence {
      animate { property: position, to: (400, 300), duration: 1, loop: true }
    }
  }
}`;

function sample(over: Partial<Sample> & Pick<Sample, "source">): Sample {
  return { mode: "live", file: "site/content/x.md", line: 10, code: null, ...over };
}

describe("checkSample", () => {
  it("accepts a fence that compiles", () => {
    expect(checkSample(sample({ source: GOOD }))).toEqual([]);
  });

  it("reports file:line and the compiler's message for one that fails", () => {
    const errors = checkSample(sample({ source: "scene {\n  size: (960, 540)\n  circle { radius: 4 }\n}" }));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/^site\/content\/x\.md:\d+: \S/);
  });

  it("measures the line from the fence, not from the snippet", () => {
    const errors = checkSample(sample({ source: "scene {\n  @\n}", line: 20 }));
    expect(errors[0]).toMatch(/^site\/content\/x\.md:22: /);
  });

  it("holds an error=CODE fence to its code", () => {
    expect(checkSample(sample({ mode: "error", code: "TYPE_SEQ_LOOP", source: LOOP_STEP }))).toEqual([]);
    const wrong = checkSample(sample({ mode: "error", code: "TYPE_SEQ_YOYO", source: LOOP_STEP }));
    expect(wrong).toHaveLength(1);
    expect(wrong[0]).toContain("TYPE_SEQ_YOYO");
    expect(wrong[0]).toContain("got [TYPE_SEQ_LOOP]");
  });

  it("does not let a code match only the start of the raised code", () => {
    const wrong = checkSample(sample({ mode: "error", code: "TYPE_SEQ", source: LOOP_STEP }));
    expect(wrong).toHaveLength(1);
    expect(wrong[0]).toContain("[TYPE_SEQ_LOOP]");
  });

  it("lets a bare error fence pass on any error and fails it on a clean compile", () => {
    expect(checkSample(sample({ mode: "error", source: LOOP_STEP }))).toEqual([]);
    const clean = checkSample(sample({ mode: "error", source: GOOD }));
    expect(clean).toHaveLength(1);
    expect(clean[0]).toMatch(/^site\/content\/x\.md:10: /);
  });

  it("rejects a fragment that contains a scene block", () => {
    expect(checkSample(sample({ mode: "fragment", source: "scene {\n}" }))).toHaveLength(1);
    expect(checkSample(sample({ mode: "fragment", source: "circle dot { radius: 4 }" }))).toEqual([]);
    expect(checkSample(sample({ mode: "fragment", source: 'text t { content: "scene { }" } // scene {' }))).toEqual([]);
  });

  it("checks solutions and showcases like any scene", () => {
    expect(checkSample(sample({ mode: "solution", source: GOOD }))).toEqual([]);
    expect(checkSample(sample({ mode: "showcase", source: "scene {" })).length).toBeGreaterThan(0);
  });
});

describe("renderSample", () => {
  it("emits the figure contract for a live sample", () => {
    const html = renderSample(sample({ source: GOOD }), []);
    expect(html).toContain('<figure class="sample" data-mode="live"');
    expect(html).toContain('<div class="sample-stage"></div>');
    expect(html).toContain('<pre class="code" data-lang="marey"><code>');
    expect(html).toContain('data-playground="https://marey.pages.dev/#code=');
    expect(html).not.toContain("sample-errors");
  });

  it("has no stage for error and fragment samples, and lists an error's messages", () => {
    const err = renderSample(sample({ mode: "error", source: LOOP_STEP }), ["[TYPE_SEQ_LOOP] <bad> & worse"]);
    expect(err).not.toContain("sample-stage");
    expect(err).toContain('<ol class="sample-errors"><li>[TYPE_SEQ_LOOP] &lt;bad&gt; &amp; worse</li></ol>');
    expect(renderSample(sample({ mode: "fragment", source: "circle dot { }" }), [])).not.toContain("sample-stage");
  });

  it("round-trips a </script> inside a string through data-source", () => {
    const source = 'scene {\n  text t { content: "</script><b onload=\\"x\\">&amp; \'q\'" }\n}';
    const html = renderSample(sample({ source }), []);
    const match = /data-source="([^"]*)"/.exec(html);
    expect(match).not.toBeNull();
    expect(match![1]).not.toContain("<");
    expect(match![1]).toBe(escapeHtml(source));
    const decoded = match![1]!
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
    expect(decoded).toBe(source);
    expect(html).not.toContain("</script>");
  });

  it("omits the playground link when the source is too long to share", () => {
    let source = "scene {\n";
    for (let i = 0; i < 4000; i++) {
      source += `  circle c${i} { position: (${(i * 7919) % 1000}, ${(i * 104729) % 1000}), radius: ${i % 50} }\n`;
    }
    source += "}";
    expect(renderSample(sample({ source }), [])).not.toContain("data-playground");
  });
});
