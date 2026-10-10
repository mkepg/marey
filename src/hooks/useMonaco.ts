import { useEffect, useState } from "preact/hooks";

type Monaco = typeof import("monaco-editor");

/** What the editor pane shows: the source as text while Monaco loads, then Monaco, or a plain textarea if it never arrives. */
export type MonacoState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly monaco: Monaco }
  | { readonly status: "failed" };

let monacoLoad: Promise<Monaco> | null = null;

/**
 * Monaco is most of the playground's JavaScript. Importing it statically put
 * it on the critical path of everything, so the preview could not draw until
 * the editor had downloaded. Loaded here instead, it downloads alongside the
 * preview's own code, and the preview no longer waits for it.
 */
export function loadMonaco(): Promise<Monaco> {
  monacoLoad ??= import("./monacoSetup").then(
    (m) => m.monaco,
    (error: unknown) => {
      // Let a later mount try again instead of failing forever.
      monacoLoad = null;
      throw error;
    },
  );
  return monacoLoad;
}

export function useMonaco(): MonacoState {
  const [state, setState] = useState<MonacoState>({ status: "loading" });

  useEffect(() => {
    let live = true;
    loadMonaco().then(
      (monaco) => { if (live) setState({ status: "ready", monaco }); },
      (error: unknown) => {
        console.error("[editor] Monaco failed to load:", error);
        if (live) setState({ status: "failed" });
      },
    );
    return () => { live = false; };
  }, []);

  return state;
}
