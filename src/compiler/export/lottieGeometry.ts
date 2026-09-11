import type { IRObjectId, IRObjectNode, IRSceneNode } from "../sceneIR";

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

  function walk(node: IRObjectNode): void {
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
      default:
        break;
    }

    for (const child of node.children) {
      walk(child);
    }
  }

  for (const child of ir.children) {
    walk(child);
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics: Object.freeze(diagnostics) };
  }

  return { ok: true, layers: Object.freeze([]) };
}
