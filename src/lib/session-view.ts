type ViewStorage = Pick<Storage, "getItem" | "setItem">;
export function readSessionView<T>(
  storage: ViewStorage | null,
  key: string,
  fallback: T,
  validate: (value: unknown) => boolean,
): T {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return fallback;
    const value: unknown = JSON.parse(raw);
    return validate(value) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}
export function writeSessionView<T>(storage: ViewStorage | null, key: string, value: T) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    /* Navigation still works when storage is unavailable. */
  }
}
