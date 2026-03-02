import { useEffect, useState } from "preact/hooks";

// ─────────────────────────────────────────────────────────────────────────────
// Monaco CDN Loader Hook
// Loads Monaco Editor from cdnjs and resolves once the editor API is ready.
// Returns null until ready.
// ─────────────────────────────────────────────────────────────────────────────

// Extend window with Monaco's AMD require
declare global {
  interface Window {
    monaco: typeof import("monaco-editor");
    require: {
      config: (opts: { paths: Record<string, string> }) => void;
    } & ((deps: string[], cb: () => void) => void);
  }
}

const MONACO_CDN =
  "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs";

let loadPromise: Promise<typeof import("monaco-editor")> | null = null;

function loadMonaco(): Promise<typeof import("monaco-editor")> {
  if (window.monaco) return Promise.resolve(window.monaco);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = `${MONACO_CDN}/loader.min.js`;
    script.onload = () => {
      window.require.config({ paths: { vs: MONACO_CDN } });
      window.require(["vs/editor/editor.main"], () => resolve(window.monaco));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

export function useMonaco(): typeof import("monaco-editor") | null {
  const [monaco, setMonaco] = useState<typeof import("monaco-editor") | null>(
    () => window.monaco ?? null
  );

  useEffect(() => {
    if (monaco) return;
    loadMonaco().then(setMonaco);
  }, []);

  return monaco;
}
