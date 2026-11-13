import { describe, expect, it } from "vitest";
import { PROGRESS_KEY, finishedLessons, isFinished, setFinished } from "./progress";
import { createSafeStorage, type SafeStorage } from "./storage";

function memory(initial: Record<string, string> = {}): SafeStorage & { readonly data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, get: (key) => data.get(key) ?? null, set: (key, value) => void data.set(key, value) };
}

describe("lesson progress", () => {
  it("persists a finished lesson through the storage it is given", () => {
    const storage = memory();
    setFinished(storage, "animate", true);
    expect(JSON.parse(storage.data.get(PROGRESS_KEY)!)).toEqual(["animate"]);
    expect(isFinished(storage, "animate")).toBe(true);
    expect(isFinished(storage, "timing")).toBe(false);
  });

  it("keeps earlier lessons when another is finished, and lists each lesson once", () => {
    const storage = memory();
    setFinished(storage, "first-scene", true);
    setFinished(storage, "shapes", true);
    setFinished(storage, "shapes", true);
    expect([...finishedLessons(storage)]).toEqual(["first-scene", "shapes"]);
  });

  it("unmarks a lesson", () => {
    const storage = memory();
    setFinished(storage, "first-scene", true);
    setFinished(storage, "shapes", true);
    setFinished(storage, "first-scene", false);
    expect([...finishedLessons(storage)]).toEqual(["shapes"]);
  });

  it.each([
    ["text that is not JSON", "{not json"],
    ["a JSON object", '{"animate":true}'],
    ["a JSON string", '"animate"'],
    ["null", "null"],
  ])("treats %s as no progress", (_what, stored) => {
    const storage = memory({ [PROGRESS_KEY]: stored });
    expect(finishedLessons(storage).size).toBe(0);
    expect(isFinished(storage, "animate")).toBe(false);
    setFinished(storage, "shapes", true);
    expect(JSON.parse(storage.data.get(PROGRESS_KEY)!)).toEqual(["shapes"]);
  });

  it("keeps the slugs from a stored list and drops anything that is not one", () => {
    const storage = memory({ [PROGRESS_KEY]: '["animate", 3, null, "timing"]' });
    expect([...finishedLessons(storage)]).toEqual(["animate", "timing"]);
  });

  it("works with nothing remembered when localStorage is blocked", () => {
    const blocked = createSafeStorage(() => {
      throw new Error("SecurityError");
    });
    expect(() => setFinished(blocked, "animate", true)).not.toThrow();
    expect(isFinished(blocked, "animate")).toBe(false);
  });
});
