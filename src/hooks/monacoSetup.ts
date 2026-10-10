import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

// Strictly type the global window object to avoid arbitrary 'any' casting vulnerabilities
declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment;
  }
}

window.MonacoEnvironment = {
  getWorker() {
    return new EditorWorker();
  },
};

export { monaco };
