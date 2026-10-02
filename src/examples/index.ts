import duskHills from "./dusk-hills.marey?raw";
import physicsPile from "./physics-pile.marey?raw";
import barChartReveal from "./bar-chart-reveal.marey?raw";
import logoReveal from "./logo-reveal.marey?raw";
import yellowFlowers from "./yellow-flowers.marey?raw";

export type ExampleId =
  | "dusk-hills" | "physics-pile" | "bar-chart-reveal" | "logo-reveal" | "yellow-flowers";

export interface Example {
  readonly id: ExampleId;
  readonly title: string;
  readonly description: string;
  readonly source: string;
}

export const EXAMPLES: ReadonlyArray<Example> = [
  {
    id: "dusk-hills",
    title: "Dusk over layered hills",
    description: "The sun sets, sleeps and rises again, on a 12-second loop.",
    source: duskHills,
  },
  {
    id: "physics-pile",
    title: "Physics pile",
    description: "Shapes tumble, collide and settle under gravity.",
    source: physicsPile,
  },
  {
    id: "bar-chart-reveal",
    title: "Bar chart reveal",
    description: "A list of numbers grows into bars, one after another.",
    source: barChartReveal,
  },
  {
    id: "logo-reveal",
    title: "Logo reveal",
    description: "A logo assembles from its parts in sequence.",
    source: logoReveal,
  },
  {
    id: "yellow-flowers",
    title: "Yellow flowers",
    description: "A flower bush grows, blooms and fills with drifting hearts.",
    source: yellowFlowers,
  },
];

export const DEFAULT_EXAMPLE: Example = EXAMPLES[0]!;
