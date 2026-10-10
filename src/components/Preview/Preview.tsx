import type { FunctionComponent, RefObject } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { useAppStore } from "../../store";
import { ENTRANCE_TIMING, entranceKeyframes } from "../../lib/entrance";
import { captionFor, plateRect, type Size } from "./plateGeometry";
import { Transport } from "./Transport";
import styles from "./Preview.module.scss";

interface PreviewProps {
  hostRef: RefObject<HTMLDivElement>;
}

export const Preview: FunctionComponent<PreviewProps> = ({ hostRef }) => {
  const status      = useAppStore((s) => s.compileStatus);
  const isCompiling = useAppStore((s) => s.isCompiling);
  const sceneInfo   = useAppStore((s) => s.sceneInfo);
  const entrance    = useAppStore((s) => s.entrance);
  const hasOutput   = status === "ok";

  // The renderer maps the scene into the host's client box, so the frame is
  // computed from that same box.
  const [box, setBox] = useState<Size>({ width: 0, height: 0 });
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = (): void => {
      setBox((prev) =>
        prev.width === host.clientWidth && prev.height === host.clientHeight
          ? prev
          : { width: host.clientWidth, height: host.clientHeight },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [hostRef]);

  const rect = hasOutput && sceneInfo ? plateRect(sceneInfo.fit, box, sceneInfo) : null;
  const caption = rect && sceneInfo ? captionFor(sceneInfo) : null;

  // The scene, its frame and its caption grow in together, from the plate's
  // centre. A layout effect starts the animation before the browser paints,
  // so the scene is never seen at full size first. Nothing is remounted: the
  // renderer's canvas keeps running underneath.
  const stageRef = useRef<HTMLDivElement>(null);
  const playedRef = useRef(entrance);
  const animationRef = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const host = hostRef.current;
    if (entrance === playedRef.current || !stage || !host) return;
    playedRef.current = entrance;
    const x = host.offsetLeft + (rect ? rect.x + rect.width / 2 : host.clientWidth / 2);
    const y = host.offsetTop + (rect ? rect.y + rect.height / 2 : host.clientHeight / 2);
    stage.style.transformOrigin = `${x}px ${y}px`;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    animationRef.current?.cancel();
    animationRef.current = stage.animate(entranceKeyframes(reduced), ENTRANCE_TIMING);
  }, [entrance, rect, hostRef]);

  return (
    <div className={styles.wrap}>
      {isCompiling && (
        <div className={styles.loadingOverlay}>Compiling…</div>
      )}
      <div ref={stageRef} className={styles.stage}>
        <div
          ref={hostRef}
          className={styles.host}
          style={{
            opacity: hasOutput ? 1 : 0,
            pointerEvents: hasOutput ? "auto" : "none"
          }}
        />
        {rect && caption && (
          <div className={styles.plateLayer}>
            <div
              className={styles.frame}
              data-plate-frame
              style={{ left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` }}
            />
            <div
              className={styles.caption}
              data-plate-caption
              style={{ left: `${rect.x}px`, top: `${rect.y + rect.height}px`, width: `${rect.width}px` }}
            >
              <span data-caption-size>{caption.size}</span>
              <span data-caption-length>{caption.length}</span>
            </div>
          </div>
        )}
      </div>
      {!hasOutput && !isCompiling && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>◻</div>
          <div className={styles.emptyText}>No preview</div>
        </div>
      )}
      <Transport />
    </div>
  );
};
