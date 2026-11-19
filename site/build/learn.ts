import { escapeHtml as esc } from "./escape";
import { renderSample } from "./samples";
import type { Heading } from "./types";

/** The front matter keys a lesson takes; `showcase` and `embed` are optional. */
export const LESSON_KEYS = ["title", "summary", "description", "minutes", "learn", "showcase", "embed"] as const;
const REQUIRED = ["title", "summary", "description", "minutes", "learn"] as const;

export interface LessonMeta {
  readonly title: string;
  readonly summary: string;
  readonly description: string;
  /** The estimated time to read the lesson and try its samples. */
  readonly minutes: number;
  /** "You'll learn": three to five bullets. */
  readonly learn: ReadonlyArray<string>;
  /** The gallery id of the lesson's showcase scene. */
  readonly showcase: string | null;
  /**
   * The gallery id of a scene the lesson shows embedded, the way a reader's
   * own page would embed it, in place of a showcase.
   */
  readonly embed: string | null;
}

/**
 * Checks a lesson's front matter. Every problem is reported as `file:1:`
 * (front matter keys carry no line of their own); the meta that comes back
 * fills a missing value with an empty one, so the page still builds and the
 * build reports every problem at once.
 */
export function parseLessonMeta(
  data: Readonly<Record<string, string | string[]>>,
  file: string,
): { meta: LessonMeta; errors: string[] } {
  const errors: string[] = [];
  const at = `${file}:1`;
  for (const key of Object.keys(data)) {
    if (!(LESSON_KEYS as ReadonlyArray<string>).includes(key)) {
      errors.push(`${at}: unknown front matter key "${key}"; a lesson takes ${LESSON_KEYS.join(", ")}`);
    }
  }
  for (const key of REQUIRED) {
    const value = data[key];
    if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
      errors.push(`${at}: a lesson's front matter needs "${key}"`);
    }
  }
  const text = (key: "title" | "summary" | "description"): string => {
    const value = data[key];
    if (Array.isArray(value)) {
      errors.push(`${at}: "${key}" must be one line of text`);
      return "";
    }
    return value ?? "";
  };
  const title = text("title");
  const summary = text("summary");
  const description = text("description");

  let minutes = 0;
  const rawMinutes = data.minutes;
  if (rawMinutes !== undefined && rawMinutes !== "" && !(Array.isArray(rawMinutes) && rawMinutes.length === 0)) {
    if (typeof rawMinutes === "string" && /^[1-9]\d*$/.test(rawMinutes)) minutes = Number(rawMinutes);
    else errors.push(`${at}: minutes must be a whole number above 0, found "${String(rawMinutes)}"`);
  }

  let learn: string[] = [];
  const rawLearn = data.learn;
  if (typeof rawLearn === "string" && rawLearn !== "") {
    errors.push(`${at}: "learn" must be a list of "- item" lines`);
  } else if (Array.isArray(rawLearn) && rawLearn.length > 0) {
    learn = rawLearn;
    if (learn.length < 3 || learn.length > 5) {
      errors.push(`${at}: "learn" has ${learn.length} bullets; a lesson lists three to five`);
    }
  }

  const galleryId = (key: "showcase" | "embed"): string | null => {
    const raw = data[key];
    if (Array.isArray(raw)) errors.push(`${at}: "${key}" must be one gallery id`);
    else if (raw !== undefined && raw !== "") return raw;
    return null;
  };
  const showcase = galleryId("showcase");
  const embed = galleryId("embed");
  if (showcase !== null && embed !== null) errors.push(`${at}: a lesson has a showcase or an embedded scene, not both`);

  return { meta: { title, summary, description, minutes, learn, showcase, embed }, errors };
}

/** The heading the generator writes above "You'll learn". */
export const YOULL_LEARN: Heading = { depth: 2, text: "You'll learn", id: "youll-learn" };

const SHOWCASE_CAPTION = "By the end of this lesson you can read every line of this.";

function headingHtml(h: Heading, className?: string): string {
  const cls = className ? ` class="${className}"` : "";
  return (
    `<h${h.depth}${cls} id="${esc(h.id)}">${esc(h.text)} ` +
    `<a class="anchor" href="#${esc(h.id)}" aria-label="${esc(`Link to "${h.text}"`)}">#</a></h${h.depth}>`
  );
}

/** A gallery scene as a lesson or the front page shows it. */
export interface SceneRef {
  readonly id: string;
  readonly title: string;
  readonly source: string;
}

export interface LessonBodyInput {
  readonly slug: string;
  readonly meta: LessonMeta;
  /** The lesson's Markdown body, rendered. */
  readonly bodyHtml: string;
  readonly showcase: SceneRef | null;
  /** The scene the lesson embeds; the build has checked it can be written inline. */
  readonly embed: SceneRef | null;
}

/**
 * Whether a scene's text can sit inside `<script type="text/marey">`. A
 * script's text is used as it is, never decoded, so it cannot be escaped:
 * `</script` would close the element early, and `<!--` changes how the parser
 * looks for that close.
 */
export function canWriteInline(source: string): boolean {
  return !/<\/script|<!--/i.test(source);
}

/**
 * A lesson page's content, in the order the course's pages share: the
 * summary and the reading time, "You'll learn", the showcase (a `showcase`
 * sample: it plays on its own, with its source and a playground link behind
 * the client's toolbar), the lesson's own body, and the "Mark this lesson
 * finished" toggle. The breadcrumb, the title and the pager are the layout's.
 */
export function lessonBody(input: LessonBodyInput): string {
  const { meta } = input;
  const parts = [
    `<p class="lead">${esc(meta.summary)}</p>`,
    `<p class="lesson-time">About ${meta.minutes} minutes</p>`,
    `<section class="lesson-learn" aria-labelledby="${YOULL_LEARN.id}">${headingHtml(YOULL_LEARN)}` +
      `<ul>${meta.learn.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></section>`,
  ];
  if (input.showcase) {
    const scene = input.showcase;
    const figure = renderSample({ mode: "showcase", source: scene.source, file: "", line: 0, code: null }, []);
    const caption =
      `<figcaption class="showcase-caption">${esc(SHOWCASE_CAPTION)} ` +
      `<a href="/gallery/${esc(scene.id)}/">${esc(scene.title)}</a>, from the gallery.</figcaption>\n`;
    // The caption leads the figure, above the player, so it reads before the scene plays.
    parts.push(figure.replace(/^(<figure [^>]*>\n)/, (open) => open + caption));
  }
  if (input.embed) {
    // The markup a reader's own page would hold: the element, its three
    // attributes and the scene written inline. The site defines the element
    // from its own build of the player.
    const scene = input.embed;
    parts.push(
      `<figure class="lesson-embed">\n` +
        `<figcaption class="showcase-caption"><a href="/gallery/${esc(scene.id)}/">${esc(scene.title)}</a>, from the gallery, ` +
        `embedded with a <code>&lt;marey-player&gt;</code> element and its scene written inline.</figcaption>\n` +
        `<marey-player autoplay loop controls><script type="text/marey">\n${scene.source}\n</script></marey-player>\n` +
        `</figure>`,
    );
  }
  parts.push(input.bodyHtml);
  parts.push(
    `<button class="finish-button" type="button" data-finish-lesson="${esc(input.slug)}" aria-pressed="false" hidden>` +
      `Mark this lesson finished</button>`,
  );
  return parts.join("\n") + "\n";
}

export interface LessonCard {
  readonly slug: string;
  readonly number: number;
  readonly title: string;
  readonly summary: string;
  /** The showcase scene and the time its card stills on; null for a lesson without one. */
  readonly poster: { readonly source: string; readonly time: number | null } | null;
}

export interface FrontPageInput {
  /** The hero's h1, the page's only one. */
  readonly heading: string;
  readonly lead: string;
  /** `site/content/learn/index.md`'s body, rendered: the course's introduction. */
  readonly bodyHtml: string;
  readonly lessons: ReadonlyArray<LessonCard>;
  /** The scene the hero plays. */
  readonly hero: SceneRef | null;
}

const COURSE: Heading = { depth: 2, text: "The course", id: "the-course" };
const BEYOND: Heading = { depth: 2, text: "Beyond the course", id: "beyond-the-course" };

const SECTION_CARDS = [
  { href: "/guides/", title: "Guides", text: "Install and run the command line tool, export every format, embed the player, check scenes in CI, edit an export in a Lottie editor, and read the compiler's errors." },
  { href: "/gallery/", title: "Gallery", text: "Finished scenes to study, each with notes on how it is made and its full source." },
  { href: "/reference/", title: "Reference", text: "The formal language reference, every property of every object, and how determinism works." },
] as const;

function lessonCard(card: LessonCard): string {
  const poster =
    card.poster === null
      ? `<div class="lesson-card-poster"></div>`
      : `<div class="lesson-card-poster sample-stage" data-source="${esc(card.poster.source)}"` +
        (card.poster.time === null ? "" : ` data-poster="${card.poster.time}"`) +
        `></div>`;
  return (
    `<li class="lesson-card" data-lesson="${esc(card.slug)}"><a class="card" href="/learn/${esc(card.slug)}/">` +
    poster +
    `<span class="lesson-card-num" aria-hidden="true">${card.number}</span>` +
    `<span class="lesson-card-title"><span class="visually-hidden">Lesson ${card.number}: </span>${esc(card.title)}</span>` +
    `<span class="lesson-card-summary">${esc(card.summary)}</span>` +
    `<span class="lesson-status visually-hidden"></span>` +
    `</a></li>`
  );
}

/**
 * The course's front page, `/learn/`: a hero with the page's h1, a "Start
 * with lesson 1" button and a scene playing beside it; the course's
 * introduction and a card per lesson; then cards for the other sections.
 * It returns the links it writes so the build checks them.
 */
export function learnFrontBody(input: FrontPageInput): {
  html: string;
  headings: ReadonlyArray<Heading>;
  links: ReadonlyArray<string>;
} {
  const links: string[] = [];
  const first = input.lessons[0];
  const actions: string[] = [];
  if (first) {
    links.push(`/learn/${first.slug}/`);
    actions.push(`<a class="button button-primary" href="/learn/${esc(first.slug)}/">Start with lesson 1</a>`);
  }
  links.push("/gallery/");
  actions.push(`<a class="button" href="/gallery/">Browse the gallery</a>`);

  let stage = "";
  if (input.hero) {
    links.push(`/gallery/${input.hero.id}/`);
    stage =
      `<figure class="hero-stage"><div class="sample-stage" data-source="${esc(input.hero.source)}"></div>` +
      `<figcaption><a href="/gallery/${esc(input.hero.id)}/">${esc(input.hero.title)}</a>, from the gallery, ` +
      `where its notes explain how each part is made.</figcaption></figure>`;
  }

  for (const card of input.lessons) links.push(`/learn/${card.slug}/`);
  for (const card of SECTION_CARDS) links.push(card.href);

  const html = [
    `<section class="hero"><div class="hero-copy">` +
      `<h1 class="hero-title">${esc(input.heading)}</h1>` +
      `<p class="hero-lead">${esc(input.lead)}</p>` +
      `<div class="hero-actions">${actions.join("")}</div></div>${stage}</section>`,
    headingHtml(COURSE, "front-heading"),
    input.bodyHtml,
    `<ol class="lesson-cards">${input.lessons.map(lessonCard).join("")}</ol>`,
    headingHtml(BEYOND, "front-heading"),
    `<ul class="section-cards">` +
      SECTION_CARDS.map(
        (c) =>
          `<li><a class="section-card" href="${c.href}"><span class="section-card-title">${c.title}</span>` +
          `<span class="section-card-text">${esc(c.text)}</span></a></li>`,
      ).join("") +
      `</ul>`,
  ].join("\n");
  return { html: html + "\n", headings: [COURSE, BEYOND], links };
}

/** The search text of a lesson page: its summary and bullets, then its body. */
export function lessonText(meta: LessonMeta, bodyText: string): string {
  return [meta.summary, ...meta.learn, bodyText].filter((t) => t !== "").join("\n");
}

