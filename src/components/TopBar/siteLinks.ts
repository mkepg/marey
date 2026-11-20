/**
 * The documentation site's sections, in the order its own header lists them
 * (site/build/layout.ts), so the links sit in the same places on every page.
 * They open in this tab: the editor's text is saved as it changes and again
 * as the page is left (useAutoSave), so leaving loses nothing.
 */
export const SITE_LINKS = [
  { href: `${import.meta.env.BASE_URL}learn/`, label: "Learn" },
  { href: `${import.meta.env.BASE_URL}guides/`, label: "Guides" },
  { href: `${import.meta.env.BASE_URL}gallery/`, label: "Gallery" },
  { href: `${import.meta.env.BASE_URL}reference/`, label: "Reference" },
] as const;
