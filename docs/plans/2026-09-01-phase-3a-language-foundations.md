# Phase 3A Language Foundations Implementation Plan

**Goal:** Replace Declare's drifting language metadata and pre-Phase-3A vocabulary with one authoritative contract, deterministic compilation, bounded physics cost, correct handoff/yoyo lifecycle, and fully migrated first-party sources.

**Architecture:** A pure `src/compiler/languageContract.ts` module owns property and value metadata without importing parser, validator, Monaco, PixiJS, or renderer code. Compiler and editor consumers derive their views from that module; cross-node validation remains in focused type-checker helpers, and renderer lifecycle changes remain in the fixed-tick `SceneRuntime`/timeline boundary.

**Tech Stack:** TypeScript 5.9 strict mode, Vitest 4, Vite 8, PixiJS 8, Matter.js 0.20.0, Monaco Editor 0.53, Playwright/Chromium visual-check scripts.

**Spec:** `docs/specs/2026-09-01-phase-3a-language-foundations-design.md`

**Verified baseline evidence:** Parser reservations are local to
`src/compiler/parser/parseObject.ts:9-15`; validator property tables are at
`src/compiler/typeChecker/validator.ts:3-45`; builder defaults are duplicated
at `src/compiler/typeChecker/builder.ts:131-249`; Monaco duplicates property
and value knowledge at `src/components/Editor/MonacoEditor/language.ts:11-45`
and property prose at
`src/components/Editor/MonacoEditor/constants.ts:19-46`. Random AST names are
created at `src/compiler/parser/parseObject.ts:159-165`; the yoyo completion
branch is at `src/compiler/renderer/timeline.ts:21-44`; its lifecycle side
effects are consumed at `src/compiler/renderer/sceneRuntime.ts:160-208`; and
the colliding evaluation output path is at `eval/compile.test.ts:15-17` and
`eval/compile.test.ts:44-50`. The approved design's section 1 records the full
consumer audit with line citations; task references below are relative to this
clean `c3863ca` baseline and will naturally move during implementation.

## Global Constraints

- Work only on `phase-3a-language-foundations`; do not merge or push.
- Preserve Decisions D1–D18 and all three renderer invariants in `AGENTS.md`.
- The final language accepts only `let`, `handoff`, `fit`, and `layer`; do not add compatibility aliases, even between plan tasks.
- Preserve Matter.js at exactly `0.20.0`; do not add `poly-decomp`.
- `MAX_PHYSICS_BODIES` is exactly `500`; `MAX_PHYSICS_PARTS` is exactly `2_000`.
- Phase 3A adds no lists, indexing, modulo, comparisons, conditionals, trig, `world`, `lockPosition`, `lockRotation`, or `spin`.
- Use TDD for every behavior change: observe a relevant failure before implementation, then run the focused test green.
- Every validator rejection must have a nearby permission test.
- Pure renderer modules must not gain runtime `pixi.js` imports.
- Browser checks use `tools/visual-check/`, Vite `--strictPort`, and captures at or after renderer initialization rather than around 300ms.
- Do not rewrite historical approved plans/specifications or erase historical `.eval` conclusions.

---

## File map

### New files

- `src/compiler/languageContract.ts` — authoritative property/value vocabulary, defaults, constraints, docs, placeholders, and derived views.
- `src/compiler/languageContract.test.ts` — contract integrity, reservations, defaults, enum, and documentation tests.
- `src/compiler/parser/parseProperty.ts` — common property-key parsing plus positioned legacy-property diagnostics.
- `src/compiler/languageSurface.test.ts` — permission/rejection coverage for new and removed spellings.
- `src/compiler/determinism.test.ts` — repeated AST/IR equality and golden Scene IR snapshots.
- `src/compiler/__snapshots__/determinism.test.ts.snap` — committed external IR goldens.
- `src/compiler/typeChecker/physicsCost.ts` — expanded-AST body/primitive qualification and counting.
- `src/compiler/typeChecker/physicsCost.test.ts` — body/part limit matrix.
- `src/compiler/typeChecker/handoff.ts` — resolves the currently supported handoff target and timing relation.
- `src/compiler/languageCuts.test.ts` — roadmap cut and deferral regression matrix.
- `src/components/Editor/MonacoEditor/constants.test.ts` — derived property hover and editor guidance coverage.

### Principal modified files

- `src/compiler/lexer/constants.ts`, `handlers.ts` — derive vocabulary and land `let`/fit tokens.
- `src/compiler/types.ts` — fit AST/token types.
- `src/compiler/parser/*.ts` — binding rename, common property parser, positional node names, migration diagnostics.
- `src/compiler/typeChecker/validator.ts`, `builder.ts`, `resolvers.ts` — derived contract, final IR names, cross-node rules.
- `src/compiler/sceneIR.ts` — `handoff`, `layer`, and `fit` wire fields.
- `src/compiler/renderer/{adapter,builder,sceneRuntime,timeline}.ts` and tests — final IR fields and yoyo lifecycle.
- `src/components/Editor/MonacoEditor/{constants,language,scanner,themes}.ts` — contract-derived editor behavior and final vocabulary.
- `src/store/defaultScene.ts`, `src/store/defaultScene.test.ts` — final syntax and IR assertions.
- `src/compiler/languageDocs.test.ts`, `docs/LANGUAGE.md` — final syntax and corrected behavior.
- `eval/compile.test.ts`, `eval/scenes*/**`, `eval/RESULTS*.md`, `eval/report*.json` — separate reports and migrated corpora.
- `tools/visual-check/scenes/*.declare` — final syntax.
- `AGENTS.md`, `AGENTS.md` — current project guidance.

---

### Task 1: Define the authoritative language contract

**Files:**
- Create: `src/compiler/languageContract.ts`
- Create: `src/compiler/languageContract.test.ts`

**Interfaces:**
- Produces: `ValueKind`, `ContractDefault`, `PropertySpec`, `BlockContract`, `LANGUAGE_CONTRACT`, `NAMED_COLORS`, `FIT_VALUES`, `BOOLEAN_VALUES`, `EASING_VALUES`, `DURATION_VALUES`, `ANIMATABLE_PROPERTIES`, `KIND_LABEL`, `REQUIRED_PROPS`, `PROP_TYPES`, `RESERVED_PROPERTY_NAMES`, `propertyDefault`, and `LEGACY_SOURCE_FORMS`.
- Initial data uses the current source keys so the module can land green before Task 4 performs the atomic breaking rename.

- [ ] **Step 1: Write contract integrity tests**

```ts
import { describe, expect, it } from "vitest";
import {
  LANGUAGE_CONTRACT,
  RESERVED_PROPERTY_NAMES,
  REQUIRED_PROPS,
  PROP_TYPES,
  propertyDefault,
} from "./languageContract";

describe("language contract", () => {
  it("derives required and accepted properties from one data object", () => {
    expect(REQUIRED_PROPS.circle).toEqual(["position", "radius"]);
    expect(PROP_TYPES.animate).toEqual({
      property: "animProperty", to: ["number", "point"], duration: "number",
      easing: "easing", loop: "boolean", yoyo: "boolean", handOff: "boolean",
    });
    expect(Object.keys(LANGUAGE_CONTRACT.scene.properties)).toEqual([
      "background", "size", "sceneFit",
    ]);
  });

  it("derives reservations without the three ghost properties", () => {
    expect(RESERVED_PROPERTY_NAMES.has("position")).toBe(true);
    expect(RESERVED_PROPERTY_NAMES.has("anchor")).toBe(false);
    expect(RESERVED_PROPERTY_NAMES.has("width")).toBe(false);
    expect(RESERVED_PROPERTY_NAMES.has("height")).toBe(false);
  });

  it("stores semantic defaults separately from completion placeholders", () => {
    expect(propertyDefault("physics", "airDrag")).toBe(0);
    expect(propertyDefault("physics", "collideBounds")).toBe(true);
    expect(LANGUAGE_CONTRACT.scene.properties.size.default).toBeUndefined();
    expect(LANGUAGE_CONTRACT.scene.properties.size.placeholder).toBe("(600, 400)");
  });
});
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run: `npx vitest run src/compiler/languageContract.test.ts`

Expected: FAIL because `./languageContract` does not exist.

- [ ] **Step 3: Add the contract types and complete vocabulary**

Implement these shapes, then populate every property currently present in
`validator.ts:6-32` and every property description currently present in
`MonacoEditor/constants.ts:19-46`:

```ts
export type ValueKind =
  | "number" | "color" | "string" | "point" | "pointList"
  | "sceneFit" | "boolean" | "easing" | "animProperty" | "indefinitely";

export type ContractDefault = number | string | boolean | Readonly<{ x: number; y: number }>;

export type LocalConstraint =
  | Readonly<{ kind: "range"; min: number; max: number }>
  | Readonly<{ kind: "positive" }>
  | Readonly<{ kind: "positivePoint" }>
  | Readonly<{ kind: "maxLength"; max: number }>
  | Readonly<{ kind: "pointCount"; min: number; max: number }>;

export interface PropertySpec {
  readonly kinds: ValueKind | readonly ValueKind[];
  readonly required?: true;
  readonly default?: ContractDefault;
  readonly constraint?: LocalConstraint;
  readonly description: string;
  readonly example: string;
  readonly placeholder: string;
}

export interface BlockContract {
  readonly properties: Readonly<Record<string, PropertySpec>>;
}

export const FIT_VALUES = ["contain", "cover", "fill", "none"] as const;
export const BOOLEAN_VALUES = ["true", "false"] as const;
export const EASING_VALUES = ["linear", "easeIn", "easeOut", "easeInOut"] as const;
export const DURATION_VALUES = ["indefinitely"] as const;
export const ANIMATABLE_PROPERTIES = ["position", "rotation", "scale", "alpha"] as const;
export const NAMED_COLORS = {
  red: "#ff0000", green: "#008000", blue: "#0000ff", white: "#ffffff",
  black: "#000000", yellow: "#ffff00", cyan: "#00ffff",
  magenta: "#ff00ff", orange: "#ffa500",
} as const;
```

Use shared fragments for visual properties, but export exactly one
`LANGUAGE_CONTRACT` containing `scene`, `circle`, `rectangle`, `polygon`,
`line`, `text`, `animate`, `physics`, `group`, `sequence`, and `parallel`.
Record the current defaults exactly: background `#000000`, sceneFit `contain`,
color `#ffffff`, alpha `1`, rotation `0`, scale `{x:1,y:1}`, z `0`, fontSize
`16`, easing `easeInOut`, loop/yoyo/handOff `false`, velocity `{x:0,y:0}`,
gravity `{x:0,y:980}`, airDrag `0`, bounce `0.65`, and collideBounds `true`.

- [ ] **Step 4: Add derived views and legacy mappings**

```ts
export const REQUIRED_PROPS = Object.fromEntries(
  Object.entries(LANGUAGE_CONTRACT).map(([block, contract]) => [
    block,
    Object.entries(contract.properties).filter(([, p]) => p.required).map(([name]) => name),
  ])
) as Readonly<Record<string, readonly string[]>>;

export const PROP_TYPES = Object.fromEntries(
  Object.entries(LANGUAGE_CONTRACT).map(([block, contract]) => [
    block,
    Object.fromEntries(Object.entries(contract.properties).map(([name, p]) => [name, p.kinds])),
  ])
) as Readonly<Record<string, Readonly<Record<string, ValueKind | readonly ValueKind[]>>>>;

export const RESERVED_PROPERTY_NAMES = new Set(
  Object.values(LANGUAGE_CONTRACT).flatMap((c) => Object.keys(c.properties))
);

export const LEGACY_SOURCE_FORMS = Object.freeze({
  keyword: { def: "let" },
  property: { handOff: "handoff", sceneFit: "fit", z: "layer" },
});
```

Add `propertyDefault(block, property)` which returns the frozen configured
default or `undefined`; clone point defaults before a builder exposes them.

- [ ] **Step 5: Run contract tests and typecheck**

Run: `npx vitest run src/compiler/languageContract.test.ts`

Expected: PASS.

Run: `npx tsc -b --noEmit`

Expected: PASS with no unused exports or type-only import violations.

- [ ] **Step 6: Commit**

```powershell
git add src/compiler/languageContract.ts src/compiler/languageContract.test.ts
git commit -m "refactor(language): define authoritative contract"
```

---

### Task 2: Derive compiler property behavior and remove ghost reservations

**Files:**
- Modify: `src/compiler/lexer/constants.ts`
- Modify: `src/compiler/parser/parseObject.ts`
- Modify: `src/compiler/typeChecker/validator.ts`
- Modify: `src/compiler/typeChecker/builder.ts`
- Modify: `src/compiler/typeChecker/resolvers.ts`
- Modify: `src/compiler/languageContract.test.ts`
- Modify: `src/compiler/typeChecker/validator.test.ts`

**Interfaces:**
- Consumes: all Task 1 contract exports.
- Produces: compiler behavior derived from the contract while still accepting the pre-rename vocabulary until Task 4 atomically changes it.

- [ ] **Step 1: Add permission tests for released names and derived defaults**

Add table-driven cases to `validator.test.ts` compiling objects and bindings
named `anchor`, `width`, and `height`, plus assertions that optional IR values
match contract defaults:

```ts
it.each(["anchor", "width", "height"])("allows %s as an object and binding name", (name) => {
  expect(errorsFor(`def ${name} = 12\nscene { size: (100, 100) circle ${name} { position: (50, 50), radius: ${name} } }`)).toEqual([]);
});

it("keeps removed reservations invalid as properties", () => {
  const out = errorsFor(`scene { size: (100,100) circle c { position:(50,50), radius:10, anchor: 0 } }`);
  expect(out.join("\n")).toContain("unknown property 'anchor'");
});
```

- [ ] **Step 2: Run the focused tests and verify the old reservation fails**

Run: `npx vitest run src/compiler/typeChecker/validator.test.ts -t "object and binding name|invalid as properties"`

Expected: FAIL because `parseObject.ts:182-184` still rejects the three names.

- [ ] **Step 3: Replace compiler literal tables with contract imports**

- Import `NAMED_COLORS`, enum arrays, and block keywords into lexer constants;
  expose `Set` views only as derived lexer lookup structures.
- Delete `RESERVED_PROPS` from `parseObject.ts` and use
  `RESERVED_PROPERTY_NAMES`.
- Delete literal `REQUIRED_PROPS`, `PROP_TYPES`, and `KIND_LABEL` declarations
  from `validator.ts`; import and re-export the derived contract views so any
  temporary existing import remains source-compatible.

Use no literal property-name list in these consumers.

- [ ] **Step 4: Drive local validation constraints from property specs**

Add `validateLocalConstraint(label, typeName, key, val, spec)` in
`validator.ts`. Implement an exhaustive switch over `spec.constraint.kind`:

- `range` compares numeric values inclusively against `min` and `max`;
- `positive` requires a numeric value greater than zero;
- `positivePoint` requires both point components greater than zero;
- `maxLength` rejects strings longer than `max`;
- `pointCount` compares a point-list length inclusively against `min` and
  `max`.

Return the existing positioned `CompilerError` code/message for each rule, and
use a `never` exhaustiveness assignment in the default branch. Keep scale's
number-or-point positivity as the one local special case because its constraint
depends on the selected value kind. Keep animation `to`, sequence physics
duration, and every ancestor/sibling rule outside this helper.

- [ ] **Step 5: Read builder defaults through the contract**

Add typed resolver helpers rather than casts at call sites:

```ts
export function contractNumberDefault(block: string, key: string): number;
export function contractBooleanDefault(block: string, key: string): boolean;
export function contractPointDefault(block: string, key: string): IRPoint;
export function contractStringDefault(block: string, key: string): string;
```

Replace literals in `buildAnimationFromNode`, `buildPhysicsFromNode`, scene
construction, visual construction, and group construction with these helpers.
Required properties continue to use `getReq*` and must never receive a fallback.

- [ ] **Step 6: Run validator, default-scene, language-doc, and contract tests**

Run:
`npx vitest run src/compiler/languageContract.test.ts src/compiler/typeChecker/validator.test.ts src/store/defaultScene.test.ts src/compiler/languageDocs.test.ts`

Expected: PASS.

Run: `npx tsc -b --noEmit`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/compiler/lexer/constants.ts src/compiler/parser/parseObject.ts src/compiler/typeChecker/validator.ts src/compiler/typeChecker/builder.ts src/compiler/typeChecker/resolvers.ts src/compiler/languageContract.test.ts src/compiler/typeChecker/validator.test.ts
git commit -m "refactor(language): derive compiler property behavior"
```

---

### Task 3: Derive Monaco property guidance from the contract

**Files:**
- Modify: `src/components/Editor/MonacoEditor/constants.ts`
- Modify: `src/components/Editor/MonacoEditor/language.ts`
- Modify: `src/components/Editor/MonacoEditor/scanner.ts`
- Create: `src/components/Editor/MonacoEditor/constants.test.ts`

**Interfaces:**
- Consumes: Task 1 contract data and Task 2 derived views.
- Produces: `propertyHoverMarkdown(property: string): string | undefined` and contract-driven property/enum completion data.

- [ ] **Step 1: Add editor contract tests**

```ts
import { describe, expect, it } from "vitest";
import { propertyHoverMarkdown, physicsSnippet } from "./constants";

describe("Declare editor guidance", () => {
  it("describes bounce as shared-world collision behavior", () => {
    const hover = propertyHoverMarkdown("bounce")!;
    expect(hover).toContain("other objects");
    expect(hover).toContain("scene boundaries");
    expect(hover).toContain("higher");
  });

  it("uses light drag in physics snippets", () => {
    expect(physicsSnippet(false)).toContain("airDrag: ${4:0.006}");
    expect(physicsSnippet(true)).toContain("airDrag: ${3:0.006}");
    expect(physicsSnippet(false)).not.toContain("0.99");
  });
});
```

- [ ] **Step 2: Run the editor test and verify missing exports/stale prose**

Run: `npx vitest run src/components/Editor/MonacoEditor/constants.test.ts`

Expected: FAIL because the helper exports do not exist and bounce currently
mentions boundary collisions only.

- [ ] **Step 3: Replace `PROPERTY_DOCS` with a formatter**

```ts
export function propertyHoverMarkdown(property: string): string | undefined {
  const appearances = Object.values(LANGUAGE_CONTRACT)
    .map((block) => block.properties[property])
    .filter((spec): spec is PropertySpec => spec !== undefined);
  const spec = appearances[0];
  if (!spec) return undefined;
  const accepted = (Array.isArray(spec.kinds) ? spec.kinds : [spec.kinds])
    .map((kind) => KIND_LABEL[kind]).join(" or ");
  return `### \`${property}\`\n${spec.description}\n\n**Accepts:** ${accepted}\n**Example:** \`${spec.example}\``;
}
```

Keep long `KEYWORD_DOCS` and value-specific prose in the editor module, but
derive their required/optional property lists and enum labels from the contract.

- [ ] **Step 4: Derive Monaco tokenizer and completion data**

- Replace literal named colors, fit values, booleans, easings, duration values,
  property lists, required lists, animatable suggestions, and placeholders with
  contract values.
- Extract `physicsSnippet(inSequence: boolean)` and use it at both existing
  physics completion sites.
- Have hover lookup call `propertyHoverMarkdown` instead of indexing a literal
  property map.
- Keep Monaco-specific completion kinds and Markdown formatting local.

- [ ] **Step 5: Derive scanner enum inference**

Replace `scanner.ts` literal `includes` arrays with contract arrays and named
color keys. Do not import `validator.ts`.

- [ ] **Step 6: Run editor tests, full typecheck, and stale-guidance search**

Run: `npx vitest run src/components/Editor/MonacoEditor/constants.test.ts`

Expected: PASS.

Run: `npx tsc -b --noEmit`

Expected: PASS.

Run:
`rg -n "airDrag:.*0\.99|boundary, mapping|export const PROPERTY_DOCS" src/components/Editor/MonacoEditor`

Expected: no matches.

- [ ] **Step 7: Commit**

```powershell
git add src/components/Editor/MonacoEditor/constants.ts src/components/Editor/MonacoEditor/language.ts src/components/Editor/MonacoEditor/scanner.ts src/components/Editor/MonacoEditor/constants.test.ts
git commit -m "refactor(editor): derive language guidance"
```

---

### Task 4: Land the four breaking renames atomically

**Files:**
- Create: `src/compiler/parser/parseProperty.ts`
- Create: `src/compiler/languageSurface.test.ts`
- Rename: `src/compiler/parser/parseDef.ts` → `src/compiler/parser/parseBinding.ts`
- Modify: `src/compiler/languageContract.ts`
- Modify: `src/compiler/lexer/constants.ts`
- Modify: `src/compiler/lexer/handlers.ts`
- Modify: `src/compiler/types.ts`
- Modify: `src/compiler/parser/index.ts`
- Modify: `src/compiler/parser/parseBinding.ts`
- Modify: `src/compiler/parser/parseGenerate.ts`
- Modify: `src/compiler/parser/parseObject.ts`
- Modify: `src/compiler/parser/parseTemplate.ts`
- Modify: `src/compiler/parser/parseUse.ts`
- Modify: `src/compiler/parser/parseValue.ts`
- Modify: `src/compiler/parser/state.ts`
- Modify: `src/compiler/sceneIR.ts`
- Modify: `src/compiler/typeChecker/validator.ts`
- Modify: `src/compiler/typeChecker/builder.ts`
- Modify: `src/compiler/typeChecker/resolvers.ts`
- Modify: `src/compiler/renderer/adapter.ts`
- Modify: `src/compiler/renderer/builder.ts`
- Modify: `src/compiler/renderer/sceneRuntime.ts`
- Modify: all existing `src/**/*.test.ts` IR fixtures and Declare source strings
- Modify: `src/components/Editor/MonacoEditor/{constants,language,scanner,themes}.ts`
- Modify: `src/store/defaultScene.ts`
- Modify: `docs/LANGUAGE.md`

**Interfaces:**
- Produces: final `let`, `handoff`, `fit`, and `layer` syntax; AST kind `fit`; IR fields `handoff`, `fit`, and `layer`; exact `[PARSE_RENAMED_*]` diagnostics.
- Removes: live `def`, `handOff`, `sceneFit`, and `z` syntax and internal public fields.

- [ ] **Step 1: Add new-spelling permission and old-spelling migration tests**

In `languageSurface.test.ts`, compile through lex → parse → typeCheck and assert:

```ts
it("accepts only final Phase 3A vocabulary", () => {
  const ir = irFor(`
    let depth = 3
    scene { size:(100,100), fit: contain
      circle c { position:(50,50), radius:10, layer: depth
        animate { property:position, to:(60,50), duration:0.1, handoff:true }
        physics { duration: indefinitely }
      }
    }
  `);
  expect(ir.fit).toBe("contain");
  expect(ir.registry["scene.c"].props.layer).toBe(3);
  expect(ir.registry["scene.c"].props.animations[0].handoff).toBe(true);
});

it.each([
  ["def x = 1\nscene { size:(10,10) }", "def", "PARSE_RENAMED_KEYWORD", "let"],
  ["scene { size:(10,10), sceneFit: contain }", "sceneFit", "PARSE_RENAMED_PROPERTY", "fit"],
  ["scene { size:(10,10) circle c { position:(5,5), radius:1, z:2 } }", "z", "PARSE_RENAMED_PROPERTY", "layer"],
  ["scene { size:(10,10) circle c { position:(5,5), radius:1 animate { property:position, to:(6,5), duration:1, handOff:true } physics { duration:indefinitely } } }", "handOff", "PARSE_RENAMED_PROPERTY", "handoff"],
])("rejects obsolete spelling at its token", (source, old, code, replacement) => {
  const [error] = compileErrors(source);
  expect(error.message).toContain(code);
  expect(error.message).toContain(replacement);
  const before = source.slice(0, source.indexOf(old));
  const lines = before.split("\n");
  expect(error.line).toBe(lines.length);
  expect(error.col).toBe(lines.at(-1)!.length + 1);
});
```

Use multiline fixtures if exact columns are clearer; compute the expected
column from the literal once and assert it, rather than weakening the test to
“has a position”. Add old-`def` cases inside scene, object, generate, template,
and use expansion contexts, and old-property cases in scene/object/use wrappers.

- [ ] **Step 2: Run the new surface test and verify final vocabulary fails**

Run: `npx vitest run src/compiler/languageSurface.test.ts`

Expected: FAIL because `let` is not a keyword and final properties are unknown.

- [ ] **Step 3: Rename contract, token, AST, and IR types**

- Contract keys: `handOff → handoff`, `sceneFit → fit`, `z → layer`.
- Value kind: `sceneFit → fit`.
- Token: `SCENE_FIT → FIT`.
- Types: `SceneFit → FitMode`, `SceneFitValue → FitValue`,
  `IRSceneFit → IRFit`.
- IR fields: `.handOff → .handoff`, `.z → .layer`, `.sceneFit → .fit`.
- Resolver: `resolveSceneFit → resolveFit`.

Preserve error codes `TYPE_HANDOFF_*`; update their message spelling.

- [ ] **Step 4: Add common property-key parsing and migration errors**

```ts
export function consumePropertyName(state: ParserState): Token {
  const token = state.consume();
  const old = token.value as string;
  const replacement = LEGACY_SOURCE_FORMS.property[old as keyof typeof LEGACY_SOURCE_FORMS.property];
  if (replacement) {
    state.throwError(
      `[PARSE_RENAMED_PROPERTY] '${old}' was renamed to '${replacement}'. Replace '${old}: ...' with '${replacement}: ...'.`,
      token,
    );
  }
  return token;
}

export function rejectLegacyBinding(state: ParserState): void {
  const token = state.peek();
  if (token.type === "IDENT" && token.value === "def") {
    state.throwError(
      `[PARSE_RENAMED_KEYWORD] 'def' was renamed to 'let'. Replace 'def name = ...' with 'let name = ...'.`,
      token,
    );
  }
}
```

Call the property helper in scene, object, and use-wrapper property parsing.
Call `rejectLegacyBinding` before statement dispatch in every binding-bearing
loop. Rename `parseDef` to `parseBinding`; its diagnostics say `let`.

- [ ] **Step 5: Migrate compiler, renderer, and editor consumers**

Update sorting to `.layer`, adapter layout to `scene.fit`, runtime to
`.handoff`, builder/test IR literals, Monaco tokenizer theme token from
`keyword.def` to `keyword.let`, scanner state names from `Def` to `Binding`, and
all snippets/hovers/completions to final vocabulary. Do not change CSS
`z-index` or historical text.

- [ ] **Step 6: Atomically migrate headless-compiled first-party sources**

Update:

- `src/store/defaultScene.ts` and default-scene assertions;
- every Declare source literal under `src/**/*.test.ts`;
- every compiled fence and current prose in `docs/LANGUAGE.md`;
- `src/compiler/languageDocs.test.ts` comments and new IR fields.

Do not yet edit `.eval`, visual-check scenes, AGENTS/CLAUDE, or historical
plans/specs; later tasks own those scopes.

- [ ] **Step 7: Run rename, language-doc, default-scene, renderer, and type tests**

Run:
`npx vitest run src/compiler/languageSurface.test.ts src/compiler/languageDocs.test.ts src/store/defaultScene.test.ts src/compiler/renderer/builder.test.ts src/compiler/renderer/sceneRuntime.test.ts src/compiler/renderer/physicsSync.test.ts`

Expected: PASS.

Run: `npx tsc -b --noEmit`

Expected: PASS and no old IR field type remains.

- [ ] **Step 8: Search live code for obsolete vocabulary**

Run:

```powershell
rg -n "\bdef\b|handOff|sceneFit|(^|[\s{,])z\s*:|\.z\b" src docs/LANGUAGE.md
```

Expected: matches only the intentional migration map/tests and prose explaining
the rejected spelling. No accepted source, editor suggestion, AST/IR field, or
runtime consumer uses an old name.

- [ ] **Step 9: Commit**

```powershell
git add src docs/LANGUAGE.md
git commit -m "feat(language): land final Phase 3A vocabulary"
```

---

### Task 5: Make AST and Scene IR determinism observable

**Files:**
- Modify: `src/compiler/parser/parseObject.ts`
- Create: `src/compiler/determinism.test.ts`
- Create: `src/compiler/__snapshots__/determinism.test.ts.snap`

**Interfaces:**
- Produces: positional names `animate_<line>_<col>` and `physics_<line>_<col>`; full IR golden snapshots.

- [ ] **Step 1: Add repeated-compilation and whitespace tests**

Create one fixture containing `let`, template/use, nested generate, a sequence,
parallel animation/physics steps, and top-level animation/physics. Parse it 20
times and compare each AST to the first; compile it 20 times and compare
`JSON.stringify(ir)` byte-for-byte.

```ts
it("produces identical AST and IR on repeated compilation", () => {
  const parses = Array.from({ length: 20 }, () => parse(lex(COMPLEX_SOURCE)));
  for (const result of parses.slice(1)) expect(result).toEqual(parses[0]);
  const payloads = parses.map(({ ast }) => JSON.stringify(typeCheck(ast!).ir));
  expect(new Set(payloads).size).toBe(1);
});

it("keeps IR independent of formatting-only changes", () => {
  expect(irFor(COMPACT_SOURCE)).toEqual(irFor(EXPANDED_SOURCE));
});
```

- [ ] **Step 2: Run the repeated-AST test and verify randomness is observed**

Run: `npx vitest run src/compiler/determinism.test.ts -t "repeated compilation"`

Expected: FAIL because animate/physics names differ.

- [ ] **Step 3: Replace random block names with token positions**

```ts
if (objType === "animate" || objType === "physics") {
  objName = `${objType}_${typeTok.line}_${typeTok.col}`;
}
```

Do not add expansion counters or suffix nonvisual block names.

- [ ] **Step 4: Add and generate two full IR goldens**

Add `toMatchSnapshot()` for a primitive/default/layer-order fixture and a
macro/sequence/physics fixture. Generate once:

Run: `npx vitest run src/compiler/determinism.test.ts -u`

Expected: PASS and creation of
`src/compiler/__snapshots__/determinism.test.ts.snap`.

Open the snapshot and confirm it contains `fit`, `layer`, and `handoff`, contains
no line/column fields, and records stable registry/children order.

- [ ] **Step 5: Run determinism tests without update mode**

Run: `npx vitest run src/compiler/determinism.test.ts`

Expected: PASS without modifying the snapshot.

- [ ] **Step 6: Commit**

```powershell
git add src/compiler/parser/parseObject.ts src/compiler/determinism.test.ts src/compiler/__snapshots__/determinism.test.ts.snap
git commit -m "test(compiler): lock deterministic AST and IR"
```

---

### Task 6: Reject physical lines and enforce physics cost ceilings

**Files:**
- Create: `src/compiler/typeChecker/physicsCost.ts`
- Create: `src/compiler/typeChecker/physicsCost.test.ts`
- Modify: `src/compiler/typeChecker/validator.ts`
- Modify: `src/compiler/typeChecker/validator.test.ts`

**Interfaces:**
- Produces: `MAX_PHYSICS_BODIES`, `MAX_PHYSICS_PARTS`, `ownsPhysics(node)`, `countPhysicsCost(ast)`.

- [ ] **Step 1: Add the physical-line permission/rejection matrix**

Test direct physics, sequence physics, a line directly in a physical group, a
line inside a nested visual group below a physical group, a nonphysical line,
and legal physical circle/rectangle/polygon/text/group scenes. Rejections must
contain `TYPE_LINE_PHYSICS` and the line's position.

- [ ] **Step 2: Add cost tests at both boundaries**

Build source strings with helpers rather than committing thousands of literal
lines:

```ts
const physicalCircle = (i: number) =>
  `circle c${i} { position:(${i},10), radius:1, physics { duration: 1 } }`;

it("allows exactly 500 ordinary bodies", () => {
  expect(errorsFor(scene(Array.from({length:500}, (_, i) => physicalCircle(i)).join("\n")))).toEqual([]);
});

it("rejects body 501", () => {
  expect(errorsFor(scene(Array.from({length:501}, (_, i) => physicalCircle(i)).join("\n"))).join("\n"))
    .toContain("TYPE_PHYSICS_BODY_LIMIT");
});
```

Add corresponding 2,000/2,001 physical-group part tests, sequence-created body
tests, nested visual-group part tests, and a scene with more than 500
nonphysical objects that remains under the parser budget and passes.

- [ ] **Step 3: Run the tests and verify missing rules**

Run: `npx vitest run src/compiler/typeChecker/physicsCost.test.ts src/compiler/typeChecker/validator.test.ts -t "physics|line"`

Expected: FAIL because the limits and line rule do not exist.

- [ ] **Step 4: Implement expanded-AST qualification and counting**

```ts
export const MAX_PHYSICS_BODIES = 500;
export const MAX_PHYSICS_PARTS = 2_000;

export function ownsPhysics(node: ObjectNode): boolean {
  if (node.children.some((c) => c.type === "physics")) return true;
  return node.children
    .filter((c) => c.type === "sequence")
    .some((seq) => seq.children.some((step) =>
      step.type === "physics" ||
      (step.type === "parallel" && step.children.some((p) => p.type === "physics"))
    ));
}
```

`countPhysicsCost` traverses expanded visual nodes in source order. For a body
owner, increment bodies once. If it is a group, count all descendant visual
leaves as parts; otherwise count one part. Return the first node crossing each
limit so the validator can position one error per limit.

- [ ] **Step 5: Integrate line and cost errors into validation**

For a line, reject when `ownsPhysics(line)` or when any visual group ancestor
owns physics. Run `countPhysicsCost(ast)` once from `collectErrors`, append at
most one error for each exceeded limit, and retain the validator's 50-error
ceiling.

- [ ] **Step 6: Run focused and full validator tests**

Run:
`npx vitest run src/compiler/typeChecker/physicsCost.test.ts src/compiler/typeChecker/validator.test.ts`

Expected: PASS.

Run: `npx tsc -b --noEmit`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/compiler/typeChecker/physicsCost.ts src/compiler/typeChecker/physicsCost.test.ts src/compiler/typeChecker/validator.ts src/compiler/typeChecker/validator.test.ts
git commit -m "feat(language): bound physics collision cost"
```

---

### Task 7: Validate handoff targets and duration ordering

**Files:**
- Create: `src/compiler/typeChecker/handoff.ts`
- Modify: `src/compiler/typeChecker/validator.ts`
- Modify: `src/compiler/typeChecker/validator.test.ts`

**Interfaces:**
- Produces: `resolveHandoffTarget(animation, parent, ancestors): HandoffTarget | null`, where `HandoffTarget` contains `{ physics: ObjectNode; scheduling: "concurrent" | "later" }`.

- [ ] **Step 1: Add timing and target tests**

Cover:

- object-level finite physics longer than animation: allowed;
- object-level finite physics shorter or equal: `TYPE_HANDOFF_DURATION`;
- `indefinitely`: allowed;
- parallel physics longer: allowed;
- parallel physics shorter/equal: rejected;
- sequence animation followed by shorter positive physics: allowed;
- sequence physics before animation: `TYPE_HANDOFF_PHYSICS`;
- yoyo concurrent animation uses twice its duration for comparison;
- target physics with velocity still produces `TYPE_HANDOFF_AMBIGUITY`.

- [ ] **Step 2: Run the handoff tests and verify invalid timing passes today**

Run: `npx vitest run src/compiler/typeChecker/validator.test.ts -t "handoff"`

Expected: FAIL because shorter/equal concurrent physics is currently accepted
and earlier sequence physics is treated as a sibling target.

- [ ] **Step 3: Implement scheduling-aware target resolution**

For a renderable parent or `parallel`, return its direct physics child as
`concurrent`. For a direct sequence animation, locate its index and return the
first later direct physics sibling as `later`; do not search nested future
parallel blocks. Preserve the currently accepted grammar rather than widening
it.

- [ ] **Step 4: Implement duration validation**

```ts
const effectiveAnimDuration = animDuration.value * (yoyoIsTrue(animation) ? 2 : 1);
if (
  target.scheduling === "concurrent" &&
  physicsDuration.kind === "number" &&
  physicsDuration.value <= effectiveAnimDuration
) {
  errors.push({
    phase: "TYPE",
    message: `[TYPE_HANDOFF_DURATION] The receiving physics duration (${physicsDuration.value}s) must be greater than the handoff animation runtime (${effectiveAnimDuration}s).`,
    line: physicsDuration.line, col: physicsDuration.col,
    endLine: physicsDuration.endLine, endCol: physicsDuration.endCol,
  });
}
```

Use the resolved target for the existing physics-required and velocity-ambiguity
checks so all handoff rules refer to the same runner.

- [ ] **Step 5: Run focused validator tests and typecheck**

Run: `npx vitest run src/compiler/typeChecker/validator.test.ts -t "handoff"`

Expected: PASS.

Run: `npx tsc -b --noEmit`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/compiler/typeChecker/handoff.ts src/compiler/typeChecker/validator.ts src/compiler/typeChecker/validator.test.ts
git commit -m "fix(language): reject ineffective handoffs"
```

---

### Task 8: Complete non-looping yoyo lifecycle

**Files:**
- Modify: `src/compiler/renderer/timeline.ts`
- Modify: `src/compiler/renderer/timeline.test.ts`
- Modify: `src/compiler/renderer/sceneRuntime.ts`
- Modify: `src/compiler/renderer/sceneRuntime.test.ts`
- Modify: `src/compiler/languageDocs.test.ts`
- Modify: `src/compiler/typeChecker/validator.ts`
- Modify: `docs/LANGUAGE.md`

**Interfaces:**
- Produces: one-shot completion at `2 × durationTicks`, exact start value, released physics holds, reverse yoyo handoff velocity.

- [ ] **Step 1: Replace the timeline bug assertion with completion assertions**

```ts
it("completes a non-looping yoyo once on the return tick", () => {
  const t = makeAnim({ durationTicks: 2, yoyo: true });
  expect([1,2,3].map(() => advanceAnimTime(t))).toEqual([false,false,false]);
  expect(advanceAnimTime(t)).toBe(true);
  expect(t).toMatchObject({ elapsedTicks: 0, direction: -1, completed: true });
  expect(advanceAnimTime(t)).toBe(false);
});
```

Update the equivalent `languageDocs.test.ts` assertions to completion at tick
`2 × durationTicks` and exact elapsed zero.

- [ ] **Step 2: Run timeline/doc behavior tests and verify failure**

Run:
`npx vitest run src/compiler/renderer/timeline.test.ts src/compiler/languageDocs.test.ts -t "yoyo"`

Expected: FAIL because the yoyo never completes.

- [ ] **Step 3: Complete the timeline at zero**

In the `elapsedTicks <= 0 && direction === -1` branch, keep loop behavior
unchanged; otherwise set `elapsedTicks = 0`, `completed = true`, and return true.

- [ ] **Step 4: Add runtime lifecycle tests**

Using the existing fake world/container helpers in `sceneRuntime.test.ts`, add:

- completion releases the final `POS_ANIM` hold;
- `paint(0)` removes the runner and `isIdle()` becomes true when the world is idle;
- a real `MatterWorld` body resumes gravity after a position yoyo completes;
- yoyo handoff parks velocity in the target-to-start direction;
- the existing pacing harness produces identical world calls for 1, 7, and 12
  ticks per paint with a completing yoyo.

- [ ] **Step 5: Run runtime tests and verify reverse handoff fails**

Run: `npx vitest run src/compiler/renderer/sceneRuntime.test.ts -t "yoyo"`

Expected: FAIL because handoff currently uses start-to-target displacement.

- [ ] **Step 6: Correct yoyo handoff direction in the tick phase**

When `ra.anim.yoyo && !ra.anim.loop` completes, negate the existing displacement
direction before applying the easing multiplier. Do not move the side effect to
paint and do not pass time/alpha into mutation.

- [ ] **Step 7: Correct sequence-yoyo diagnostics and language reference**

Keep `TYPE_SEQ_YOYO`, but change its message to:

```text
'yoyo: true' is not supported inside a sequence or parallel step. Express the
return leg as a second explicit animation step.
```

Rewrite the LANGUAGE yoyo section to state completion after the return leg,
idle/pin release, and the continuing sequence restriction. Update handoff docs
for doubled yoyo runtime and reverse exit direction.

- [ ] **Step 8: Run all timeline/runtime/language-doc tests**

Run:
`npx vitest run src/compiler/renderer/timeline.test.ts src/compiler/renderer/sceneRuntime.test.ts src/compiler/languageDocs.test.ts src/compiler/typeChecker/validator.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add src/compiler/renderer/timeline.ts src/compiler/renderer/timeline.test.ts src/compiler/renderer/sceneRuntime.ts src/compiler/renderer/sceneRuntime.test.ts src/compiler/languageDocs.test.ts src/compiler/typeChecker/validator.ts docs/LANGUAGE.md
git commit -m "fix(renderer): complete non-looping yoyo lifecycle"
```

---

### Task 9: Lock down roadmap cuts and deferrals

**Files:**
- Create: `src/compiler/languageCuts.test.ts`
- Modify: existing polygon hull test in `src/compiler/renderer/physicsWorld.test.ts` only if its name does not explicitly state the cut.

**Interfaces:**
- Produces: executable regression matrix for roadmap §4, Phase 3B exclusions, and Phase 7 deferrals.

- [ ] **Step 1: Add a helper that captures lex, parse, and type errors**

```ts
function messagesFor(source: string): string[] {
  try {
    const parsed = parse(lex(source));
    if (parsed.errors.length || !parsed.ast) return parsed.errors.map((e) => e.message);
    return typeCheck(parsed.ast).errors.map((e) => e.message);
  } catch (error) {
    return [typeof error === "object" && error && "message" in error
      ? String((error as {message: unknown}).message) : String(error)];
  }
}
```

- [ ] **Step 2: Add table-driven cut cases and permission neighbors**

Reject representative source for:

- physics `mass`, `friction`, `collisionCategory`, `collisionMask`;
- same-scope `let` rebinding and `x = 2` assignment;
- `function`, object literal, `import`, `fetch`, `while`, statement `if`, and
  `plugin` constructs;
- `[1,2,3]`, indexing, `%`, `==`, `<`, conditional values, `sin`, and `cos`;
- `world`, `lockPosition`, `lockRotation`, and `spin`.

For each category assert at least one positioned compiler error and the relevant
unknown/unsupported token or property. Add permission cases for immutable
shadowing, ordinary arithmetic, point lists, `generate`, current physics
properties, and current animation properties.

- [ ] **Step 3: Run the cut suite and inspect accidental acceptances**

Run: `npx vitest run src/compiler/languageCuts.test.ts`

Expected: PASS because these constructs are outside the current grammar and
property contract. If any cut is unexpectedly accepted, stop this task, record
the contradiction against the settled roadmap, and amend this plan before
adding production behavior. Do not improvise a broad keyword ban that prevents
the same word as an ordinary identifier.

- [ ] **Step 4: Name the convex-hull semantic guard explicitly**

Ensure the existing Matter test asserts a concave polygon uses the convex hull
and rename its test title to include “no concave decomposition / roadmap cut”.
Do not alter the implementation if the current test already proves it.

- [ ] **Step 5: Run cut, validator, and physics-world suites**

Run:
`npx vitest run src/compiler/languageCuts.test.ts src/compiler/typeChecker/validator.test.ts src/compiler/renderer/physicsWorld.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/compiler/languageCuts.test.ts src/compiler/renderer/physicsWorld.test.ts
git commit -m "test(language): lock roadmap cuts and deferrals"
```

---

### Task 10: Migrate current guidance, visual fixtures, and evaluation corpora

**Files:**
- Modify: `AGENTS.md`
- Modify: `AGENTS.md`
- Modify: `tools/visual-check/scenes/*.declare`
- Modify: `eval/compile.test.ts`
- Modify: `eval/scenes/*.declare`
- Modify: `eval/scenes-r2/*.declare`
- Modify: `eval/RESULTS.md`
- Modify: `eval/RESULTS-R2.md`
- Modify: `eval/report.json`
- Modify: `eval/report-r2.json`
- Modify: `docs/LANGUAGE.md`

**Interfaces:**
- Produces: `reportPathForEvalDir(dir: string): string`; final vocabulary in all current authored sources.

- [ ] **Step 1: Add pure evaluation-path tests before running either corpus**

In `eval/compile.test.ts`, export and test:

```ts
expect(reportPathForEvalDir("eval/scenes")).toBe(normalize("eval/report.json"));
expect(reportPathForEvalDir("eval/scenes-r2")).toBe(normalize("eval/report-r2.json"));
expect(reportPathForEvalDir("C:/tmp/scenes-alt")).toBe(normalize("C:/tmp/report-alt.json"));
expect(reportPathForEvalDir("C:/tmp/custom")).toBe(normalize("C:/tmp/report-custom.json"));
```

- [ ] **Step 2: Run the eval test and verify the missing function**

Run: `npx vitest run --config eval/vitest.config.ts`

Expected: FAIL until the function exists. Do not use this run as baseline
evidence because the current test can still overwrite R1.

- [ ] **Step 3: Implement deterministic report paths with `node:path`**

```ts
export function reportPathForEvalDir(dir: string): string {
  const normalized = normalize(dir);
  const parent = dirname(normalized);
  const base = basename(normalized);
  if (base === "scenes") return join(parent, "report.json");
  if (base.startsWith("scenes-") && base.length > "scenes-".length) {
    return join(parent, `report-${base.slice("scenes-".length)}.json`);
  }
  return join(parent, `report-${base}.json`);
}
```

Write results to `reportPathForEvalDir(DIR)`.

- [ ] **Step 4: Migrate all corpus and visual source files mechanically**

Within `eval/scenes`, `eval/scenes-r2`, and
`tools/visual-check/scenes`, replace only Declare syntax:

- statement `def` → `let`;
- property `handOff:` → `handoff:`;
- property `sceneFit:` → `fit:`;
- property `z:` → `layer:`.

Update source comments that teach old spelling. Do not change scene structure,
numbers, object counts, or authorability workarounds.

- [ ] **Step 5: Update current guidance and preserve historical evidence**

- Bring `AGENTS.md` and mirrored `AGENTS.md` to final vocabulary and replace
  the old four-list gotcha with the authoritative-contract architecture.
- Update current LANGUAGE limits for 500 bodies/2,000 primitives, physical
  lines, and handoff timing if Task 8 did not already cover the prose.
- Add one note near the top of each `eval/RESULTS*.md`: quoted `def` or other
  old syntax records the pre-3A corpus; source fixtures now use final vocabulary
  and conclusions are unchanged. Do not rewrite quotes or findings.

- [ ] **Step 6: Search current sources with historical exclusions**

Run:

```powershell
rg -n "\bdef\b|handOff|sceneFit|(^|[\s{,])z\s*:" AGENTS.md AGENTS.md docs/LANGUAGE.md src eval/scenes eval/scenes-r2 tools/visual-check/scenes
```

Expected: only intentional migration rejection tests/messages and historical
notes; no accepted fixture or current guidance uses old syntax.

- [ ] **Step 7: Run R1 and verify only `report.json` changes**

```powershell
$env:EVAL_DIR = "eval/scenes"
npx vitest run --config eval/vitest.config.ts
```

Expected: all R1 scenes PASS; `eval/report.json` is written and
`eval/report-r2.json` is untouched.

- [ ] **Step 8: Run R2 and verify only `report-r2.json` changes**

```powershell
$env:EVAL_DIR = "eval/scenes-r2"
npx vitest run --config eval/vitest.config.ts
Remove-Item Env:EVAL_DIR
```

Expected: all R2 scenes PASS; `eval/report-r2.json` is written and R1 remains
the R1 corpus. Compare both reports with their pre-run committed content; only
expected deterministic path/source-vocabulary consequences are allowed.

- [ ] **Step 9: Run language docs and default scene again**

Run: `npx vitest run src/compiler/languageDocs.test.ts src/store/defaultScene.test.ts`

Expected: PASS.

- [ ] **Step 10: Commit**

```powershell
git add AGENTS.md AGENTS.md docs/LANGUAGE.md tools/visual-check/scenes .eval
git commit -m "docs(language): migrate Phase 3A vocabulary"
```

---

### Task 11: Integrated review, Chromium checks, and execution notes

**Files:**
- Modify as required by review: only files already in Phase 3A scope
- Modify: `docs/plans/2026-09-01-phase-3a-language-foundations.md` — append `## Execution notes`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified branch ready for finishing-a-development-branch choices.

- [ ] **Step 1: Run focused contract/surface/determinism/validation/lifecycle suites**

Run:

```powershell
npx vitest run src/compiler/languageContract.test.ts src/compiler/languageSurface.test.ts src/compiler/determinism.test.ts src/compiler/typeChecker/validator.test.ts src/compiler/typeChecker/physicsCost.test.ts src/compiler/languageCuts.test.ts src/compiler/renderer/timeline.test.ts src/compiler/renderer/sceneRuntime.test.ts src/components/Editor/MonacoEditor/constants.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck, all tests, and production build**

```powershell
npx tsc -b --noEmit
npm test
npm run build
```

Expected: typecheck clean; all tests pass; Vite production build succeeds.

- [ ] **Step 3: Re-run both corpora from a clean environment**

```powershell
$env:EVAL_DIR = "eval/scenes"
npx vitest run --config eval/vitest.config.ts
$env:EVAL_DIR = "eval/scenes-r2"
npx vitest run --config eval/vitest.config.ts
Remove-Item Env:EVAL_DIR
```

Expected: both pass and retain distinct deterministic report paths.

- [ ] **Step 4: Read and follow the visual-check skill before browser work**

Read `tools/visual-check/SKILL.md` completely. Start Vite on the
skill's expected port with `--strictPort`; if occupied, stop and resolve the
specific process rather than allowing Vite to choose another port.

- [ ] **Step 5: Check default scene and all four fit modes after initialization**

Run the skill's `check.mjs` flow against the default scene and focused scenes
using `fit: contain`, `cover`, `fill`, and `none`. Use captures at 1200ms or
later plus the settled capture required by the skill. Confirm:

- the app reports successful compilation;
- the canvas exists and is nonblank after initialization;
- each mode's placement/scaling matches its contract;
- repeated settled captures remain deterministic;
- the ticker/idleness result remains correct.

- [ ] **Step 6: Run stale-vocabulary and dependency-boundary searches**

```powershell
rg -n "Math\.random\(\)|airDrag:.*0\.99" src
rg -n "from [\"']pixi\.js[\"']" src/compiler/renderer/sceneRuntime.ts src/compiler/renderer/physicsSync.ts src/compiler/renderer/transform.ts
rg -n "handOff|sceneFit|\.z\b|props\[\"z\"\]" src
```

Expected: no random AST naming, stale drag guidance, runtime Pixi imports, or
old live IR/property consumers. Intentional migration-test strings may match
the last search and must be inspected individually.

- [ ] **Step 7: Review against every spec exit criterion**

Open `docs/specs/2026-09-01-phase-3a-language-foundations-design.md`
§7 and record evidence for each bullet. Inspect `git diff main...HEAD` for
accidental Phase 3B/7 capability, historical-doc rewrites, aliases, generated
artifacts, or unrelated changes.

- [ ] **Step 8: Append execution notes**

Append an `## Execution notes` section with:

- final test/build/eval/browser evidence;
- defects found in source beyond the plan;
- defects found in this plan;
- review findings and fixes;
- deliberate gaps and deferrals;
- final test/file counts.

Do not pre-fill findings that did not happen; describe actual execution evidence.

- [ ] **Step 9: Commit final notes and any reviewed fixes**

```powershell
git add docs/plans/2026-09-01-phase-3a-language-foundations.md
git commit -m "docs: record Phase 3A execution notes"
```

If review required code fixes after the preceding task commits, stage each
named Phase 3A file explicitly and commit those fixes before the documentation
commit above. Never use a directory-wide `git add` for this final review step.

- [ ] **Step 10: Invoke verification and branch-finishing workflows**

Use `superpowers:verification-before-completion` with the fresh outputs from
Steps 1–6. Then use `superpowers:finishing-a-development-branch` to present
integration choices. Do not merge, push, or open a PR without explicit user
authorization.
