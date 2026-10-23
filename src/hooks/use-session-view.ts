import { useEffect, useState } from "react";
import { readSessionView, writeSessionView } from "@/lib/session-view";
function storage() {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
/** Persist navigation only; never store unsaved editor fields here. */
export function useSessionView<T>(
  key: string,
  fallback: T,
  validate: (value: unknown) => boolean = (value) => typeof value === typeof fallback,
) {
  const [value, setValue] = useState<T>(() => readSessionView(storage(), key, fallback, validate));
  useEffect(() => {
    writeSessionView(storage(), key, value);
  }, [key, value]);
  return [value, setValue] as const;
}
