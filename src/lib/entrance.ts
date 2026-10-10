/**
 * The preview's entrance: the scene grows into place instead of appearing in
 * one frame. It plays when a scene arrives on an empty preview (first load,
 * an example, a new file, the first good compile after an error) and on every
 * deliberate Run. Auto-run recompiles while typing swap the scene in place,
 * so the picture does not re-enter each time typing pauses.
 */
export function playsEntrance(run: {
  readonly success: boolean;
  readonly manual: boolean;
  readonly wasShowing: boolean;
}): boolean {
  return run.success && (run.manual || !run.wasShowing);
}

/**
 * 85% to full size, short enough to stay comfortable on repeated Runs and to
 * hide little of the scene's own opening, which plays underneath it.
 */
export const ENTRANCE_TIMING: KeyframeAnimationOptions = {
  duration: 400,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
};

/** Under reduced motion the scene only fades in. */
export function entranceKeyframes(reducedMotion: boolean): Keyframe[] {
  if (reducedMotion) return [{ opacity: 0 }, { opacity: 1 }];
  return [
    { transform: "scale(0.85)", opacity: 0 },
    { opacity: 1, offset: 0.5 },
    { transform: "scale(1)", opacity: 1 },
  ];
}
