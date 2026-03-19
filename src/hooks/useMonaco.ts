import { useEffect, useState } from "preact/hooks";
import * as monaco from "monaco-editor";
// Vite-specific import to load the Monaco Web Worker
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

// Configure Monaco to use the bundled local worker instead of searching the web
if (typeof window !== "undefined") {
  (self as any).MonacoEnvironment = {
    getWorker() {
      return new EditorWorker();
    },
  };
}

export function useMonaco(): typeof import("monaco-editor") | null {
  const [monacoInstance, setMonacoInstance] = useState<typeof import("monaco-editor") | null>(null);

  useEffect(() => {
    // Because it's bundled locally by Vite, it's instantly available!
    setMonacoInstance(monaco);
  }, []);

  return monacoInstance;
}