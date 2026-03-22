/**
 * src/hooks/useShare.ts
 *
 * Share-button logic:
 *   1. Build a full URL with the compressed code in the hash.
 *   2. Copy it to the clipboard.
 *   3. Immediately strip the hash from the address bar so it never sits
 *      there stale — the URL is for the clipboard only.
 *   4. Show a toast with the outcome.
 *
 * The address bar is left clean after sharing. On the recipient's side,
 * resolveInitialCode reads the hash once on boot then strips it too.
 */

import { useCallback } from "preact/hooks";
import { useAppStore } from "../store";
import { buildShareURL, copyToClipboard, stripHash } from "../lib/share";

export function useShare(): () => Promise<void> {
  const code      = useAppStore((s) => s.code);
  const showToast = useAppStore((s) => s.showToast);

  return useCallback(async (): Promise<void> => {
    const url = buildShareURL(code);

    if (url === null) {
      // Guard — button should already be disabled in this case
      showToast("Code is too large to share via URL.", "error");
      return;
    }

    try {
      await copyToClipboard(url);
      showToast("Link copied to clipboard!", "success");
    } catch {
      // Clipboard API unavailable (non-HTTPS, denied permission, etc.)
      showToast("Could not copy — paste the URL from the address bar.", "info");
    } finally {
      // Always strip the hash so the address bar stays clean.
      // We do this even on clipboard failure so the user can at least
      // manually copy the URL that was briefly in the bar.
      stripHash();
    }
  }, [code, showToast]);
}