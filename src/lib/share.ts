/**
 * src/lib/share.ts
 *
 * All URL-encoding, localStorage, and clipboard logic lives here.
 *
 * Architectural rule
 * ──────────────────
 * The URL hash (#code=…) is a ONE-TIME delivery mechanism.
 *   • On boot:  read it, load the code, then immediately strip it from the
 *               address bar so it can never conflict with future sessions.
 *   • On share: build a full URL for the clipboard; strip the hash from the
 *               address bar after copying so it never sits there stale.
 *
 * This means localStorage is the ONLY persistent source of truth after the
 * initial page load, and the three sources never fight each other.
 *
 * Priority hierarchy (resolveInitialCode)
 * ────────────────────────────────────────
 *   1. URL hash  — someone opened a shared link
 *   2. localStorage — returning user with a previous session
 *   3. fallback (DEFAULT_CODE) — brand-new visitor
 */

import LZString from "lz-string";

// ─── Constants ────────────────────────────────────────────────────────────────

const HASH_PREFIX = "code=";
const STORAGE_KEY = "declare_last_session";

/**
 * Maximum compressed+encoded length we'll put in a URL.
 * Most browsers support ~64 KB but we stay conservative at 2 000 chars
 * to keep links pasteable everywhere (Slack, email, etc.).
 */
export const MAX_SHARE_LENGTH = 2_000;

// ─── Encoding / decoding ──────────────────────────────────────────────────────

/**
 * Compress and URI-encode source code.
 * Returns `null` when the result would exceed MAX_SHARE_LENGTH.
 */
export function encodeCode(code: string): string | null {
  const compressed = LZString.compressToEncodedURIComponent(code);
  return compressed.length <= MAX_SHARE_LENGTH ? compressed : null;
}

/**
 * Decode a compressed URI component back to source code.
 * Returns `null` on any failure (corruption, wrong format, empty output).
 */
export function decodeCode(encoded: string): string | null {
  if (!encoded) return null;
  try {
    const result = LZString.decompressFromEncodedURIComponent(encoded);
    return result && result.length > 0 ? result : null;
  } catch {
    return null;
  }
}

// ─── URL hash (read-once) ─────────────────────────────────────────────────────

/**
 * Read and decode code from the current URL hash.
 * Returns `null` when no valid #code= fragment is present.
 * Internal only — consumers use resolveInitialCode().
 */
function readCodeFromHash(): string | null {
  const hash = window.location.hash;
  if (!hash.startsWith(`#${HASH_PREFIX}`)) return null;
  const encoded = hash.slice(1 + HASH_PREFIX.length);
  return decodeCode(encoded);
}

/**
 * Remove the #code= fragment from the address bar without a page reload.
 * Called immediately after consuming the hash on boot, and after the
 * share clipboard write completes.
 */
export function stripHash(): void {
  if (!window.location.hash) return;
  window.history.replaceState(
    null,
    "",
    window.location.pathname + window.location.search,
  );
}

// ─── localStorage ─────────────────────────────────────────────────────────────

/**
 * Persist code to localStorage.
 * Silently swallows QuotaExceededError and SecurityError.
 */
export function saveToStorage(code: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // storage unavailable — ignore
  }
}

/**
 * Read the last-saved code from localStorage.
 * Returns `null` when nothing is stored or storage is unavailable.
 */
export function loadFromStorage(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Remove the persisted session from localStorage.
 */
export function clearStorage(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ─── Boot-time resolver ───────────────────────────────────────────────────────

export type InitialCodeSource = "hash" | "storage" | "default";

/**
 * Determine which code to load on startup, following the priority hierarchy.
 *
 * When the code comes from the hash:
 *   - The hash is stripped immediately so future page reloads fall through
 *     to localStorage instead of re-loading the stale shared code.
 *   - The code is seeded into localStorage right away so the user's work
 *     is preserved if they close and reopen the tab.
 *
 * When the code comes from localStorage:
 *   - An empty string (written by newFile()) is treated the same as absent,
 *     so newFile() correctly falls through to the DEFAULT_CODE fallback.
 */
export function resolveInitialCode(fallback: string): {
  code: string;
  source: InitialCodeSource;
} {
  // 1. URL hash — shared link
  const fromHash = readCodeFromHash();
  if (fromHash !== null) {
    stripHash();                  // never let a stale hash win on next boot
    saveToStorage(fromHash);      // seed localStorage for future sessions
    return { code: fromHash, source: "hash" };
  }

  // 2. localStorage — returning user
  const fromStorage = loadFromStorage();
  // Empty string means the user clicked "New File" — treat as absent
  if (fromStorage !== null && fromStorage.trim().length > 0) {
    return { code: fromStorage, source: "storage" };
  }

  // 3. Fallback — brand-new visitor or post-newFile() reload
  return { code: fallback, source: "default" };
}

// ─── Share URL builder ────────────────────────────────────────────────────────

/**
 * Build a full shareable URL containing the encoded code.
 * Returns `null` when the code is too large to embed in a URL.
 *
 * Important: this URL is only ever written to the clipboard.
 * The hash must be stripped from the address bar after copying (useShare
 * calls stripHash() for this).
 */
export function buildShareURL(code: string): string | null {
  const encoded = encodeCode(code);
  if (encoded === null) return null;
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#${HASH_PREFIX}${encoded}`;
}

// ─── Clipboard ────────────────────────────────────────────────────────────────

/**
 * Write text to the system clipboard.
 * Falls back to the legacy execCommand path for non-HTTPS contexts.
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Legacy fallback
  const el = document.createElement("textarea");
  el.value = text;
  el.style.cssText = "position:fixed;opacity:0;pointer-events:none";
  document.body.appendChild(el);
  el.focus();
  el.select();
  document.execCommand("copy");
  document.body.removeChild(el);
}