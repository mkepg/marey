import type { FunctionComponent } from "preact";
import styles from "./Handle.module.scss";

interface HandleProps {
  axis: "horizontal" | "vertical";
  // FIX: Updated to expect onPointerDown
  onPointerDown: (e: PointerEvent) => void;
}

export const Handle: FunctionComponent<HandleProps> = ({ axis, onPointerDown }) => (
  <div
    className={axis === "horizontal" ? styles.horizontal : styles.vertical}
    onPointerDown={onPointerDown}
    role="separator"
    aria-orientation={axis}
  />
);