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
