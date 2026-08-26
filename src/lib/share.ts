import LZString from "lz-string";

const HASH_PREFIX = "code=";
const STORAGE_KEY = "declare_last_session";

/**
 * Ceiling on the compressed payload we will put in a share link.
 *
 * The code travels in the URL's hash fragment, which is never sent to a
 * server — so this is bounded only by what browsers handle in a URL, not by
 * request-header limits. Chrome, Firefox and Safari all cope with far more
 * than this; the previous 2,000 was sized against IE11's 2,083-char ceiling.
 *
 * Kept well below what browsers allow because very long URLs get truncated or
 * mangled by some chat clients, and a truncated link looks valid but fails.
 */
export const MAX_SHARE_LENGTH = 8_000;

export function encodeCode(code: string): string | null {
  const compressed = LZString.compressToEncodedURIComponent(code);
  return compressed.length <= MAX_SHARE_LENGTH ? compressed : null;
}

export function decodeCode(encoded: string): string | null {
  if (!encoded) return null;
  try {
    const result = LZString.decompressFromEncodedURIComponent(encoded);
    return result && result.length > 0 ? result : null;
  } catch {
    return null;
  }
}

function readCodeFromHash(): string | null {
  const hash = window.location.hash;
  if (!hash.startsWith(`#${HASH_PREFIX}`)) return null;
  const encoded = hash.slice(1 + HASH_PREFIX.length);
  return decodeCode(encoded);
}

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
 * Returns true if successful, false if QuotaExceededError or SecurityError occurs.
 */
export function saveToStorage(code: string): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, code);
    return true;
  } catch {
    return false;
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

export function resolveInitialCode(fallback: string): {
  code: string;
  source: InitialCodeSource;
} {
  const fromHash = readCodeFromHash();
  if (fromHash !== null) {
    stripHash();
    saveToStorage(fromHash);
    return { code: fromHash, source: "hash" };
  }

  const fromStorage = loadFromStorage();
  if (fromStorage !== null && fromStorage.trim().length > 0) {
    return { code: fromStorage, source: "storage" };
  }

  return { code: fallback, source: "default" };
}

export function buildShareURL(code: string): string | null {
  const encoded = encodeCode(code);
  if (encoded === null) return null;
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#${HASH_PREFIX}${encoded}`;
}

export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const el = document.createElement("textarea");
  el.value = text;
  el.style.cssText = "position:fixed;opacity:0;pointer-events:none";
  document.body.appendChild(el);
  el.focus();
  el.select();
  document.execCommand("copy");
  document.body.removeChild(el);
}