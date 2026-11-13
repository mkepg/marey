import type { SafeStorage } from "./storage";

/** One key holding a JSON array of the slugs of finished lessons. */
export const PROGRESS_KEY = "marey_progress";

/** The finished lessons, in the order they were finished. An unreadable value is no progress. */
export function finishedLessons(storage: SafeStorage): Set<string> {
  const raw = storage.get(PROGRESS_KEY);
  if (raw === null) return new Set();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Set();
  }
  if (!Array.isArray(parsed)) return new Set();
  return new Set(parsed.filter((slug): slug is string => typeof slug === "string"));
}

export function isFinished(storage: SafeStorage, slug: string): boolean {
  return finishedLessons(storage).has(slug);
}

export function setFinished(storage: SafeStorage, slug: string, finished: boolean): void {
  const lessons = finishedLessons(storage);
  if (finished) lessons.add(slug);
  else lessons.delete(slug);
  storage.set(PROGRESS_KEY, JSON.stringify([...lessons]));
}

/** Ticks every finished lesson in the sidebar and on lesson cards (`[data-lesson]`). */
export function markFinished(root: ParentNode, storage: SafeStorage): void {
  const lessons = finishedLessons(storage);
  for (const el of root.querySelectorAll<HTMLElement>("[data-lesson]")) {
    const done = lessons.has(el.dataset.lesson ?? "");
    el.classList.toggle("is-finished", done);
    const status = el.querySelector<HTMLElement>(".lesson-status");
    if (status) status.textContent = done ? " (finished)" : "";
  }
}

/**
 * Wires a lesson's "Mark this lesson finished" button
 * (`button[data-finish-lesson="slug"]`) as a plain toggle. The label stays the
 * same and `aria-pressed` carries the state, which the stylesheet draws.
 */
export function initFinishButtons(root: ParentNode, storage: SafeStorage): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>("button[data-finish-lesson]")) {
    const slug = button.dataset.finishLesson ?? "";
    const show = (): void => {
      button.setAttribute("aria-pressed", String(isFinished(storage, slug)));
    };
    show();
    button.hidden = false;
    button.addEventListener("click", () => {
      setFinished(storage, slug, !isFinished(storage, slug));
      show();
      markFinished(document, storage);
    });
  }
}
