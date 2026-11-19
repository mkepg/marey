import "./site.css";
import { trackPlaying } from "./controls";
import { initNav } from "./nav";
import { initFinishButtons, markFinished } from "./progress";
import { initSearch } from "./search";
import { safeStorage } from "./storage";
import { initThemeToggle } from "./theme";

const themeButton = document.querySelector<HTMLButtonElement>(".theme-toggle");
if (themeButton) initThemeToggle(themeButton, safeStorage, document.documentElement);

const searchButton = document.querySelector<HTMLButtonElement>(".search-button");
if (searchButton) initSearch(searchButton);

initNav();
markFinished(document, safeStorage);
initFinishButtons(document, safeStorage);

// Samples need the compiler, the player and the editor: a page without one skips them.
if (document.querySelector("figure.sample")) {
  void import("./samples").then((m) => m.initSamples());
}

// A player written into the page itself, as a lesson's embedded scene is, needs only the element.
const embeds = document.querySelectorAll<HTMLElementTagNameMap["marey-player"]>(".lesson-embed > marey-player");
if (embeds.length > 0) {
  // Once the module has run, the elements are upgraded and have `paused`.
  void import("../../src/player").then(() => embeds.forEach((player) => trackPlaying(player)));
}

// The gallery's cards and scene pages, and the course's cards and hero, need the player; other pages do not load it.
if (document.querySelector(".gallery-grid, .gallery-stage, .lesson-cards, .hero-stage")) {
  void import("./gallery").then((m) => m.initGallery());
}
