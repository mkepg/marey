import type { FunctionComponent } from "preact";
import type { ComponentChildren } from "preact";
import styles from "./PaneLabel.module.scss";

interface PaneLabelProps {
  children: ComponentChildren;
}

export const PaneLabel: FunctionComponent<PaneLabelProps> = ({ children }) => (
  <div className={styles.label}>
    <span className={styles.dot} />
    {children}
  </div>
);
