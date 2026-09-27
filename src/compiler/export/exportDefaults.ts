/**
 * The frame rate every export uses, the top bar's buttons and `marey export`
 * alike, so a rate change is one edit rather than two independently-drifting
 * constants (engineering-lessons §5). Matches `video-check.mjs`'s own
 * default.
 *
 * Deliberately not in `exportPage/protocol.ts`: that module is the CLI↔page
 * request/response contract (spec §4.2-4.4), not a home for a button
 * default that the page itself never reads.
 */
export const EXPORT_FPS = 30;
