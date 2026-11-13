/**
 * `localStorage` that never throws. Private windows, disabled site data and
 * full quotas each make the real store throw on access or on write; every
 * feature that remembers something goes through this, so a blocked store
 * changes nothing except that nothing is remembered (spec 9C C14).
 */
export interface SafeStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export function createSafeStorage(store: () => Storage | null | undefined): SafeStorage {
  return {
    get(key) {
      try {
        return store()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        store()?.setItem(key, value);
      } catch {
        // Nothing is remembered; the feature carries on without it.
      }
    },
  };
}

export const safeStorage: SafeStorage = createSafeStorage(() => globalThis.localStorage);
