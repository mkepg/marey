import type { IRColor, IRObjectId, IRObjectNode, IRObjectProps, IRPointList, IRSceneNode } from "../sceneIR";

/**
 * Diagnostics for a scene the Lottie exporter refuses to bake.
 *
 * Prefixed `LOTTIE_` rather than `EXPORT_`: these fire against the bounded
 * shape subset Phase 5A's Lottie exporter supports, which is a different
 * concern from `exportContract.ts`'s `EXPORT_*` codes (those gate export
 * *timing* — fps, duration, frame budget — not scene *content*). Modelled
 * on that module: every applicable diagnostic is returned, not just the
 * first, and every message begins `[CODE] `.
 */
export type LottieDiagnosticCode = "LOTTIE_UNSUPPORTED_TEXT" | "LOTTIE_UNSUPPORTED_LINE";

export interface LottieDiagnostic {
  readonly code: LottieDiagnosticCode;
  readonly message: string;
}

/**
 * The shape a supported IR node bakes down to for the Lottie encoder
 * (Task 3). `group` carries no shape data of its own — in Lottie a group
 * becomes a layer that other layers parent to, not a drawn primitive.
 */
export type LottieShapeSpec =
  | { readonly kind: "circle"; readonly radius: number }
  | { readonly kind: "rectangle"; readonly width: number; readonly height: number }
  | { readonly kind: "polygon"; readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }> }
  | { readonly kind: "group" };

/**
 * One exportable IR object, ready for Task 2's geometry conversion and
 * Task 3's Lottie encoding. Defined here, in Task 1, rather than in Task 2,
 * because `planLottie`'s signature must be stable across both tasks and
 * `LottiePlanResult` names it below.
 *
 * The scene background is deliberately **not** a `LayerSpec`: it has no IR
 * object id, no parent and no animation, and a synthetic id would collide
 * with the frame-snapshot lookup a later task does by id.
 */
export interface LayerSpec {
  readonly id: IRObjectId;
  readonly name: string;
  readonly shape: LottieShapeSpec;
  readonly anchor: { readonly x: number; readonly y: number };
  readonly color: readonly [number, number, number] | null;
  readonly parentId: IRObjectId | null;
}

export type LottiePlanResult =
  | { readonly ok: true; readonly layers: ReadonlyArray<LayerSpec> }
  | { readonly ok: false; readonly diagnostics: ReadonlyArray<LottieDiagnostic> };

/**
 * A shape's local bounding box, before any origin is applied — the same
 * `min`/`size` shape `builder.ts`'s `LocalBBox` uses, reproduced here in
 * plain numbers because this module must not import from `builder.ts` (that
 * file is full of `pixi.js`, and Global Constraint 4 forbids importing it
 * even for a type).
 */
interface LocalBBox {
  readonly min: { readonly x: number; readonly y: number };
  readonly size: { readonly x: number; readonly y: number };
}

/**
 * `localPivot = bbox.min + origin × bbox.size` — `builder.ts`'s
 * `applyAnchorAndPivot` (`builder.ts:86-89`). `ObjectSnapshot.x`/`y` *is*
 * that pivot's parent-local position, because PixiJS places a container by
 * its pivot, so this value is exactly the `anchor` a `LayerSpec` carries.
 */
function localPivot(origin: { readonly x: number; readonly y: number }, bbox: LocalBBox): { x: number; y: number } {
  return {
    x: bbox.min.x + origin.x * bbox.size.x,
    y: bbox.min.y + origin.y * bbox.size.y,
  };
}

/**
 * A polygon's bounding box, computed the same way `builder.ts`'s `polygon`
 * case does (`builder.ts:239-250`): a min/max scan over the raw points, with
 * an empty list defaulting to a zero-size box at the origin.
 */
function polygonBBox(points: IRPointList): LocalBBox {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (minX === Infinity) { minX = 0; maxX = 0; minY = 0; maxY = 0; }
  return { min: { x: minX, y: minY }, size: { x: maxX - minX, y: maxY - minY } };
}

/**
 * `IRColor` is always a normalised six-digit `#rrggbb` string by the time it
 * reaches the IR (`resolvers.ts`'s `normaliseColor`), so no validation is
 * needed here — just the hex-to-0..1-float conversion Lottie's `sc`/`c`
 * colour values want.
 */
function hexToRgb01(hex: IRColor): readonly [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r / 255, g / 255, b / 255];
}

/** The last dot-separated segment of a scope-qualified id, for Lottie `nm`. */
function lastSegment(id: IRObjectId): string {
  const i = id.lastIndexOf(".");
  return i === -1 ? id : id.slice(i + 1);
}

/**
 * Map one supported IR node's props to its Lottie shape, anchor and colour.
 * Every row is measured against `builder.ts`'s `buildNode` switch — see
 * `docs/architecture/renderer.md` and the module docstring above for the
 * per-kind bbox this derives from. `text` and `line` never reach here: the
 * caller only invokes this for the four kinds `planLottie` accepts.
 */
function shapeGeometryFor(
  props: IRObjectProps
): { readonly shape: LottieShapeSpec; readonly anchor: { readonly x: number; readonly y: number }; readonly color: readonly [number, number, number] | null } {
  switch (props.kind) {
    case "circle": {
      const bbox: LocalBBox = { min: { x: 0, y: 0 }, size: { x: props.radius * 2, y: props.radius * 2 } };
      return {
        shape: { kind: "circle", radius: props.radius },
        anchor: localPivot(props.origin, bbox),
        color: hexToRgb01(props.color),
      };
    }
    case "rectangle": {
      const bbox: LocalBBox = { min: { x: 0, y: 0 }, size: { x: props.width, y: props.height } };
      return {
        shape: { kind: "rectangle", width: props.width, height: props.height },
        anchor: localPivot(props.origin, bbox),
        color: hexToRgb01(props.color),
      };
    }
    case "polygon": {
      const bbox = polygonBBox(props.points);
      return {
        shape: { kind: "polygon", points: props.points },
        anchor: localPivot(props.origin, bbox),
        color: hexToRgb01(props.color),
      };
    }
    case "group": {
      // D16: a group's pivot is always its own local origin, never derived
      // from its children — `builder.ts:351-361` passes a fixed `{0,0}`
      // origin and a zero-size bbox into the same `applyAnchorAndPivot` the
      // leaf shapes use, which is why this reuses `localPivot` rather than
      // special-casing the return value: fed those same fixed inputs, the
      // general formula already collapses to `(0, 0)`.
      return {
        shape: { kind: "group" },
        anchor: localPivot({ x: 0, y: 0 }, { min: { x: 0, y: 0 }, size: { x: 0, y: 0 } }),
        color: null,
      };
    }
    default: {
      // Unreachable: `walk` below only calls this for the four kinds
      // `planLottie` accepts. `text`/`line` are handled, and refused, before
      // this function is ever invoked.
      throw new Error(`[LOTTIE] shapeGeometryFor called with unsupported kind '${(props as { kind: string }).kind}'`);
    }
  }
}

/**
 * Walk the Scene IR and decide whether it can be exported to Lottie at all.
 *
 * Depth-first over every node's `children`, so an unsupported node nested
 * inside a `group` (or nested groups) is still found. Collects one
 * diagnostic per unsupported node rather than stopping at the first, so a
 * caller sees everything wrong with the scene in one pass — the same rule
 * `exportContract.ts`'s `planExport` follows.
 *
 * There is no diagnostic for colour. `IRColor` is always a normalised
 * six-digit `#rrggbb` by the time it reaches the IR — three-digit hex is
 * expanded and named colours are resolved upstream in
 * `typeChecker/builder.ts`'s `resolveColor`, and anything else never lexes
 * as a colour at all (a `PARSE` error, long before an IR exists). A colour
 * diagnostic here would be a branch no input can reach.
 *
 * Returns `layers: []` on the success path; Task 2 populates it from this
 * same walk. The signature does not change between the two tasks.
 */
export function planLottie(ir: IRSceneNode): LottiePlanResult {
  const diagnostics: LottieDiagnostic[] = [];
  const layers: LayerSpec[] = [];

  // One depth-first walk produces both the diagnostics and the specs; there
  // is no second traversal. `parentId` threads the enclosing object's id
  // down to each child, `null` at the top level.
  function walk(node: IRObjectNode, parentId: IRObjectId | null): void {
    switch (node.props.kind) {
      case "text":
        diagnostics.push({
          code: "LOTTIE_UNSUPPORTED_TEXT",
          message: `[LOTTIE_UNSUPPORTED_TEXT] Object '${node.id}' is a text node, which the Lottie exporter does not support. Remove it or replace it with a supported shape (circle, rectangle, polygon or group) before exporting.`,
        });
        break;
      case "line":
        diagnostics.push({
          code: "LOTTIE_UNSUPPORTED_LINE",
          message: `[LOTTIE_UNSUPPORTED_LINE] Object '${node.id}' is a line, which the Lottie exporter does not support. Remove it or replace it with a supported shape (circle, rectangle, polygon or group) before exporting.`,
        });
        break;
      default: {
        const { shape, anchor, color } = shapeGeometryFor(node.props);
        layers.push({
          id: node.id,
          name: lastSegment(node.id),
          shape,
          anchor,
          color,
          parentId,
        });
        break;
      }
    }

    // `node.children` is already layer-sorted (typeChecker/builder.ts sorts
    // by `layer` ascending with a stable index tiebreak, and nothing after
    // it re-sorts), so this walk must not re-sort — IR order IS paint order.
    for (const child of node.children) {
      walk(child, node.id);
    }
  }

  for (const child of ir.children) {
    walk(child, null);
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics: Object.freeze(diagnostics) };
  }

  return { ok: true, layers: Object.freeze(layers) };
}
