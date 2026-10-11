import duskHills from "./dusk-hills.marey?raw";
import physicsPile from "./physics-pile.marey?raw";
import barChartReveal from "./bar-chart-reveal.marey?raw";
import logoReveal from "./logo-reveal.marey?raw";
import ledges from "./ledges.marey?raw";

export type ExampleId =
  | "dusk-hills" | "physics-pile" | "bar-chart-reveal" | "logo-reveal" | "ledges";

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
    id: "ledges",
    title: "Ledges",
    description: "Tiles fall in from above, glance off ledges and a sweeping paddle.",
    source: ledges,
  },
];

export const DEFAULT_EXAMPLE: Example = EXAMPLES[0]!;
