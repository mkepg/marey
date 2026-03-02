import { render } from "preact";
import { App } from "./components/App";
import "./styles/global.scss";

render(<App />, document.getElementById("app")!);
