import type { FunctionComponent } from "preact";
import styles from "./Handle.module.scss";

interface HandleProps {
  axis: "horizontal" | "vertical";
  onMouseDown: (e: MouseEvent) => void;
}

export const Handle: FunctionComponent<HandleProps> = ({ axis, onMouseDown }) => (
  <div
    className={axis === "horizontal" ? styles.horizontal : styles.vertical}
    onMouseDown={onMouseDown}
    role="separator"
    aria-orientation={axis}
  />
);
