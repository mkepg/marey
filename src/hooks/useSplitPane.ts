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
  isDragging: boolean;
  onHandlePointerDown: (e: PointerEvent) => void;
}

export function useSplitPane({
  axis,
  initial,
  min,
  max,
  containerRef,
}: SplitPaneOptions): SplitPaneResult {
  const [ratio, setRatio] = useState(initial);
  const [isDragging, setIsDragging] = useState(false);
  
  const draggingRef = useRef(false);
  const listenersRef = useRef<{
    move: ((ev: PointerEvent) => void) | null;
    up: (() => void) | null;
  }>({ move: null, up: null });

  const onHandlePointerDown = useCallback(
    (e: PointerEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      setIsDragging(true);

      const onMove = (ev: PointerEvent): void => {
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
        draggingRef.current = false;
        setIsDragging(false);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        listenersRef.current.move = null;
        listenersRef.current.up = null;
      };

      listenersRef.current.move = onMove;
      listenersRef.current.up = onUp;

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [axis, min, max, containerRef]
  );

  useEffect(() => {
    return () => {
      if (listenersRef.current.move) window.removeEventListener("pointermove", listenersRef.current.move);
      if (listenersRef.current.up) window.removeEventListener("pointerup", listenersRef.current.up);
    };
  }, []);

  return { ratio, isDragging, onHandlePointerDown };
}