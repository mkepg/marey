import { useCallback, useRef, useState } from "preact/hooks";
import type { RefObject } from "preact";

// ─────────────────────────────────────────────────────────────────────────────
// useSplitPane — returns a ratio [0..1] and a mousedown handler for a drag handle.
// axis: "horizontal" measures clientX against container width
//       "vertical"   measures clientY against container height
// ─────────────────────────────────────────────────────────────────────────────

interface SplitPaneOptions {
  axis: "horizontal" | "vertical";
  initial: number;
  min: number;
  max: number;
  containerRef: RefObject<HTMLElement>;
}

interface SplitPaneResult {
  ratio: number;
  onHandleMouseDown: (e: MouseEvent) => void;
}

export function useSplitPane({
  axis,
  initial,
  min,
  max,
  containerRef,
}: SplitPaneOptions): SplitPaneResult {
  const [ratio, setRatio] = useState(initial);
  const dragging = useRef(false);

  const onHandleMouseDown = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      dragging.current = true;

      const onMove = (ev: MouseEvent): void => {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const raw =
          axis === "horizontal"
            ? (ev.clientX - rect.left) / rect.width
            : (ev.clientY - rect.top) / rect.height;
        setRatio(Math.max(min, Math.min(max, raw)));
      };

      const onUp = (): void => {
        dragging.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [axis, min, max, containerRef]
  );

  return { ratio, onHandleMouseDown };
}
