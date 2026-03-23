import { useCallback } from "preact/hooks";
import { useAppStore } from "../store";
import { buildShareURL, copyToClipboard, stripHash } from "../lib/share";

function downloadCode(code: string): void {
  const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "scene.declare";
  a.click();
  URL.revokeObjectURL(url);
}

export function useShare(): () => Promise<void> {
  const code      = useAppStore((s) => s.code);
  const showToast = useAppStore((s) => s.showToast);

  return useCallback(async (): Promise<void> => {
    const url = buildShareURL(code);

    if (url === null) {
      showToast("Code too large for URL. Downloading file instead...", "info");
      downloadCode(code);
      return;
    }

    try {
      await copyToClipboard(url);
      showToast("Link copied to clipboard!", "success");
    } catch {
      showToast("Could not copy — paste the URL from the address bar.", "info");
    } finally {
      stripHash();
    }
  }, [code, showToast]);
}