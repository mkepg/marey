import { useEffect, useState } from "preact/hooks";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

// Strictly type the global window object to avoid arbitrary 'any' casting vulnerabilities
declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment;
  }
}

if (typeof window !== "undefined") {
  window.MonacoEnvironment = {
    getWorker() {
      return new EditorWorker();
    },
  };
}

export function useMonaco(): typeof import("monaco-editor") | null {
  const [monacoInstance, setMonacoInstance] = useState<typeof import("monaco-editor") | null>(null);

  useEffect(() => {
    setMonacoInstance(monaco);
  }, []);

  return monacoInstance;
}