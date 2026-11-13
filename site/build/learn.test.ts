import { describe, expect, it } from "vitest";
import { learnFrontBody, lessonBody, parseLessonMeta, type LessonMeta } from "./learn";

const FILE = "site/content/learn/one.md";
const complete = {
  title: "One",
  summary: "The first lesson.",
  description: "About one.",
  minutes: "12",
  learn: ["A scene", "A circle", "A move"],
};

describe("parseLessonMeta", () => {
  it("reads a complete front matter with no errors", () => {
    const { meta, errors } = parseLessonMeta({ ...complete, showcase: "sunrise" }, FILE);
    expect(errors).toEqual([]);
    expect(meta).toEqual({ ...complete, minutes: 12, showcase: "sunrise" });
  });

  it("has no showcase when the key is absent", () => {
    expect(parseLessonMeta(complete, FILE).meta.showcase).toBeNull();
  });

  for (const key of ["title", "summary", "description", "minutes", "learn"] as const) {
    it(`reports a missing "${key}"`, () => {
      const data: Record<string, string | string[]> = { ...complete };
      delete data[key];
      expect(parseLessonMeta(data, FILE).errors).toEqual([`${FILE}:1: a lesson's front matter needs "${key}"`]);
    });
  }

  it("reports minutes that are not a whole number of minutes", () => {
    for (const minutes of ["ten", "0", "7.5", "-3"]) {
      expect(parseLessonMeta({ ...complete, minutes }, FILE).errors, minutes).toEqual([
        `${FILE}:1: minutes must be a whole number above 0, found "${minutes}"`,
      ]);
    }
  });

  it("reports learn written as one line, or with fewer than three or more than five bullets", () => {
    expect(parseLessonMeta({ ...complete, learn: "everything" }, FILE).errors).toEqual([
      `${FILE}:1: "learn" must be a list of "- item" lines`,
    ]);
    expect(parseLessonMeta({ ...complete, learn: ["a", "b"] }, FILE).errors).toEqual([
      `${FILE}:1: "learn" has 2 bullets; a lesson lists three to five`,
    ]);
    expect(parseLessonMeta({ ...complete, learn: ["a", "b", "c", "d", "e", "f"] }, FILE).errors).toEqual([
      `${FILE}:1: "learn" has 6 bullets; a lesson lists three to five`,
    ]);
  });

  it("reports an unknown key and a showcase written as a list", () => {
    expect(parseLessonMeta({ ...complete, colour: "red", showcase: ["a"] }, FILE).errors).toEqual([
      `${FILE}:1: unknown front matter key "colour"; a lesson takes title, summary, description, minutes, learn, showcase`,
      `${FILE}:1: "showcase" must be one gallery id`,
    ]);
  });
});

describe("lessonBody", () => {
  const meta: LessonMeta = {
    title: "One",
    summary: "Shapes & <colour>.",
    description: "d",
    minutes: 12,
    learn: ["Draw a <circle>", "Move it"],
    showcase: "sunrise",
  };
  const scene = 'scene {\n  size: (100, 100)\n  text t { position: (5, 5), content: "</script>" }\n}';
  const html = lessonBody({
    slug: "one",
    meta,
    bodyHtml: "<h2 id=\"part\">Part</h2>\n<p>Body.</p>\n",
    showcase: { id: "sunrise", title: "Sunrise & sea", source: scene },
  });

  it("opens with the summary as the lead and the reading time", () => {
    expect(html).toContain('<p class="lead">Shapes &amp; &lt;colour&gt;.</p>');
    expect(html).toContain('<p class="lesson-time">About 12 minutes</p>');
  });

  it("lists what the lesson teaches under \"You'll learn\", escaped", () => {
    expect(html).toContain(
      '<h2 id="youll-learn">You&#39;ll learn <a class="anchor" href="#youll-learn" aria-label="Link to &quot;You&#39;ll learn&quot;">#</a></h2>',
    );
    expect(html).toContain("<li>Draw a &lt;circle&gt;</li><li>Move it</li>");
  });

  it("shows the showcase as a showcase sample with its caption and the playground link", () => {
    const figure = html.slice(html.indexOf("<figure"), html.indexOf("</figure>"));
    expect(figure).toContain('<figure class="sample" data-mode="showcase"');
    expect(figure).toContain('data-playground="https://marey.pages.dev/#code=');
    expect(figure).toContain("&lt;/script&gt;");
    expect(figure).not.toContain("</script>");
    expect(figure).toContain("By the end of this lesson you can read every line of this.");
    expect(figure).toContain('<a href="/gallery/sunrise/">Sunrise &amp; sea</a>');
  });

  it("ends with the finish toggle, hidden until the script that drives it runs", () => {
    expect(html).toContain(
      '<button class="finish-button" type="button" data-finish-lesson="one" aria-pressed="false" hidden>Mark this lesson finished</button>',
    );
  });

  it("puts the parts in the page's order", () => {
    const order = ['class="lead"', 'class="lesson-time"', 'id="youll-learn"', 'data-mode="showcase"', 'id="part"', "finish-button"];
    const at = order.map((s) => html.indexOf(s));
    expect(at.every((n) => n >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("leaves the showcase out when the lesson has none", () => {
    const plain = lessonBody({ slug: "one", meta: { ...meta, showcase: null }, bodyHtml: "", showcase: null });
    expect(plain).not.toContain("<figure");
    expect(plain).toContain("finish-button");
  });
});

describe("learnFrontBody", () => {
  const front = learnFrontBody({
    heading: "Learn <Marey>",
    lead: "A course & more.",
    bodyHtml: "<p>Intro.</p>\n",
    lessons: [
      { slug: "first-scene", number: 1, title: "Your first scene", summary: "A circle & a square.", poster: { source: 'scene { size: (9, 9) } // "<x>"', time: null } },
      { slug: "shapes", number: 2, title: "Shapes", summary: "More.", poster: { source: "scene { size: (9, 9) }", time: 3.5 } },
      { slug: "ship-it", number: 3, title: "Ship it", summary: "Out.", poster: null },
    ],
    hero: { id: "lighthouse", title: "Lighthouse", source: "scene { size: (9, 9) }" },
  });

  it("supplies the page's only h1, in the hero", () => {
    expect(front.html.match(/<h1/g)).toHaveLength(1);
    expect(front.html).toContain('<h1 class="hero-title">Learn &lt;Marey&gt;</h1>');
    expect(front.html).toContain('<p class="hero-lead">A course &amp; more.</p>');
  });

  it("starts the reader on lesson 1 and shows the hero scene with a link to its gallery page", () => {
    expect(front.html).toContain('<a class="button button-primary" href="/learn/first-scene/">Start with lesson 1</a>');
    expect(front.html).toContain('<figure class="hero-stage"><div class="sample-stage" data-source="scene { size: (9, 9) }"></div>');
    expect(front.html).toContain('<a href="/gallery/lighthouse/">Lighthouse</a>');
  });

  it("lists every lesson as a numbered card with its summary and its showcase's poster", () => {
    expect(front.html).toContain('<li class="lesson-card" data-lesson="first-scene"><a class="card" href="/learn/first-scene/">');
    expect(front.html).toContain(
      '<div class="lesson-card-poster sample-stage" data-source="scene { size: (9, 9) } // &quot;&lt;x&gt;&quot;"></div>',
    );
    expect(front.html).toContain('data-source="scene { size: (9, 9) }" data-poster="3.5"></div>');
    expect(front.html).toContain('<span class="lesson-card-num" aria-hidden="true">2</span>');
    expect(front.html).toContain('<span class="lesson-card-title"><span class="visually-hidden">Lesson 1: </span>Your first scene</span>');
    expect(front.html).toContain('<span class="lesson-card-summary">A circle &amp; a square.</span>');
    expect(front.html).toContain('<div class="lesson-card-poster"></div>');
    expect(front.html.indexOf("<p>Intro.</p>")).toBeLessThan(front.html.indexOf("lesson-cards"));
  });

  it("points on to the guides, the gallery and the reference, and records every link it writes", () => {
    for (const href of ["/guides/", "/gallery/", "/reference/"]) {
      expect(front.html).toContain(`<a class="section-card" href="${href}">`);
    }
    const hrefs = front.links;
    for (const href of ["/learn/first-scene/", "/learn/shapes/", "/learn/ship-it/", "/gallery/lighthouse/", "/guides/", "/gallery/", "/reference/"]) {
      expect(hrefs).toContain(href);
    }
    expect(front.headings.map((h) => h.id)).toEqual(["the-course", "beyond-the-course"]);
  });

  it("has no start button or hero stage when there is nothing to show", () => {
    const empty = learnFrontBody({ heading: "Learn", lead: "L", bodyHtml: "", lessons: [], hero: null });
    expect(empty.html).not.toContain("Start with lesson 1");
    expect(empty.html).not.toContain("hero-stage");
    expect(empty.html.match(/<h1/g)).toHaveLength(1);
  });
});
