import { useEffect, useState } from "preact/hooks";

/**
 * The phone layout's breakpoint (spec 6B §4: narrower than 760 px). The SCSS
 * that depends on the same breakpoint uses this exact media query, so the
 * markup and the styles switch together.
 */
export const NARROW_QUERY = "(max-width: 759px)";

/** True while the viewport is narrower than 760 px; updates when it crosses. */
export function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches);

  useEffect(() => {
    const query = window.matchMedia(NARROW_QUERY);
    const onChange = (): void => setNarrow(query.matches);
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return narrow;
}
