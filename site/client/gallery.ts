/**
 * The gallery's pages. On `/gallery/` each card's stage gets a player from the
 * shared pool, paused on its poster until the card is hovered or focused, and
 * the tag buttons filter the grid. On `/gallery/<id>/` the stage gets a player
 * with controls that plays on its own and loops.
 *
 * Players come from the pool, never straight from `createElement`, so the
 * page holds at most 12 of them however long the grid grows.
 */
import "../../src/player";
import { CardPlayback, countLabel, matchesTags } from "./gallery-cards";
import { sharedPool } from "./pool";

/** One `blob:` address per scene, kept for the page's lifetime: the pool may remake a player from it. */
function sceneAddress(source: string): string {
  return URL.createObjectURL(new Blob([source], { type: "text/plain" }));
}

function makePlayer(address: string, options: { controls: boolean; autoplay: boolean }): HTMLElementTagNameMap["marey-player"] {
  const player = document.createElement("marey-player");
  player.controls = options.controls;
  player.autoplay = options.autoplay;
  player.loop = true;
  player.addEventListener("ready", () => {
    player.classList.remove("is-failed");
    player.classList.add("is-ready");
  });
  player.addEventListener("error", () => {
    player.classList.remove("is-ready");
    player.classList.add("is-failed");
  });
  player.src = address;
  return player;
}

function initCards(): void {
  // A card plays only for a pointer that can hover, and never for a reader who asked for less motion.
  // Both can change while the page is open (a tablet docked to a keyboard and mouse, or a
  // system setting), so every card follows them.
  const noHover = window.matchMedia("(hover: none)");
  const lessMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const canPlay = (): boolean => !noHover.matches && !lessMotion.matches;
  const cards: CardPlayback[] = [];
  const update = (): void => {
    for (const playback of cards) playback.set("canPlay", canPlay());
  };
  noHover.addEventListener("change", update);
  lessMotion.addEventListener("change", update);
  for (const card of document.querySelectorAll<HTMLElement>("li.gallery-card")) {
    const link = card.querySelector<HTMLAnchorElement>("a.card");
    const stage = card.querySelector<HTMLElement>(".sample-stage");
    if (!link || !stage) continue;
    const posterText = stage.dataset.poster;
    const playback = new CardPlayback(posterText === undefined ? null : Number(posterText), canPlay());
    cards.push(playback);
    const address = sceneAddress(stage.dataset.source ?? "");
    sharedPool().request(stage, () => {
      const player = makePlayer(address, { controls: false, autoplay: false });
      playback.attach(player);
      return player;
    });
    link.addEventListener("mouseenter", () => playback.set("hover", true));
    link.addEventListener("mouseleave", () => playback.set("hover", false));
    link.addEventListener("focus", () => playback.set("focus", true));
    link.addEventListener("blur", () => playback.set("focus", false));
  }
}

function initFilter(): void {
  const group = document.querySelector<HTMLElement>(".chip-filters");
  if (!group) return;
  const buttons = [...group.querySelectorAll<HTMLButtonElement>("button.chip[data-tag]")];
  const cards = [...document.querySelectorAll<HTMLElement>("li.gallery-card")];
  const status = document.querySelector<HTMLElement>(".gallery-count");
  const pressed = new Set<string>();
  const apply = (): void => {
    let shown = 0;
    for (const card of cards) {
      const show = matchesTags((card.dataset.tags ?? "").split(" ").filter((t) => t !== ""), pressed);
      card.hidden = !show;
      if (show) shown++;
    }
    if (status) status.textContent = countLabel(shown, cards.length);
  };
  for (const button of buttons) {
    button.addEventListener("click", () => {
      const tag = button.dataset.tag ?? "";
      const on = !pressed.has(tag);
      if (on) pressed.add(tag);
      else pressed.delete(tag);
      button.setAttribute("aria-pressed", String(on));
      apply();
    });
  }
  // The buttons do nothing without this script, so they appear only once it runs.
  group.hidden = false;
}

function initDetail(): void {
  for (const stage of document.querySelectorAll<HTMLElement>(".gallery-stage > .sample-stage")) {
    const address = sceneAddress(stage.dataset.source ?? "");
    sharedPool().request(stage, () => makePlayer(address, { controls: true, autoplay: true }));
  }
}

export function initGallery(): void {
  initCards();
  initFilter();
  initDetail();
}
