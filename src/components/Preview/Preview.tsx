import type { FunctionComponent, RefObject } from "preact";
import { useAppStore } from "../../store";
import styles from "./Preview.module.scss";

interface PreviewProps {
  hostRef: RefObject<HTMLDivElement>;
}

export const Preview: FunctionComponent<PreviewProps> = ({ hostRef }) => {
  const status = useAppStore((s) => s.compileStatus);
  const hasOutput = status === "ok";

  return (
    <div className={styles.wrap}>
      {/* Always render the host element and maintain its layout space.
        Using opacity ensures PixiJS's resizeTo measures the correct 
        dimensions on the initial mount without being squished.
      */}
      <div
        ref={hostRef}
        className={styles.host}
        style={{
          opacity: hasOutput ? 1 : 0,
          pointerEvents: hasOutput ? "auto" : "none"
        }}
      />
      
      {!hasOutput && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>◻</div>
          <div className={styles.emptyText}>no preview</div>
        </div>
      )}
    </div>
  );
};