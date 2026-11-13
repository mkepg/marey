import "./site.css";
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

// The gallery's cards and scene pages need the player; other pages do not load it.
if (document.querySelector(".gallery-grid, .gallery-stage")) {
  void import("./gallery").then((m) => m.initGallery());
}
