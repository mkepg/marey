import { useCallback, useRef, useState, useEffect } from "preact/hooks";
import type { RefObject } from "preact";

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
  
  const listenersRef = useRef<{
    move: ((ev: MouseEvent) => void) | null;
    up: (() => void) | null;
  }>({ move: null, up: null });

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
        listenersRef.current.move = null;
        listenersRef.current.up = null;
      };

      listenersRef.current.move = onMove;
      listenersRef.current.up = onUp;

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [axis, min, max, containerRef]
  );

  useEffect(() => {
    return () => {
      // Prevent memory leaks if unmounted while dragging
      if (listenersRef.current.move) window.removeEventListener("mousemove", listenersRef.current.move);
      if (listenersRef.current.up) window.removeEventListener("mouseup", listenersRef.current.up);
    };
  }, []);

  return { ratio, onHandleMouseDown };
}