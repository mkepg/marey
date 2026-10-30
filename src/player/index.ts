import { MareyPlayerElement } from "./element";

if (!customElements.get("marey-player")) customElements.define("marey-player", MareyPlayerElement);

export { MareyPlayerElement };

declare global {
  interface HTMLElementTagNameMap {
    "marey-player": MareyPlayerElement;
  }
}
