export type ReleaseNotes = { version?: string; title: string; summary: string; changes: string[]; image: string; imageAlt: string };
export type AppVersion = { id: string; builtAt: string; releaseNotes?: ReleaseNotes };
export function parseAppVersion(value: unknown): AppVersion | null {
  if (!value || typeof value !== "object") return null;
  const { id, builtAt } = value as Record<string, unknown>;
  const raw = (value as Record<string, unknown>).releaseNotes as Partial<ReleaseNotes> | undefined;
  const releaseNotes = raw && typeof raw.title === "string" && typeof raw.summary === "string" &&
    Array.isArray(raw.changes) && raw.changes.every(item => typeof item === "string") &&
    typeof raw.image === "string" && /^updates\/[a-zA-Z0-9._-]+$/.test(raw.image) &&
    typeof raw.imageAlt === "string" ? raw as ReleaseNotes : undefined;
  return typeof id === "string" && id.length > 0 && id.length < 150 &&
    typeof builtAt === "string" && Number.isFinite(Date.parse(builtAt)) ? { id, builtAt, ...(releaseNotes ? {releaseNotes} : {}) } : null;
}
export function updateReloadUrl(address: string, version: string) {
  const url = new URL(address);
  url.searchParams.set("_jacobyUpdate", version);
  return url.toString();
}

export function updateStatus(hasNewVersion: boolean, localPreview: boolean, localUpdated: boolean, checked: boolean) {
  if (hasNewVersion || (localPreview && !localUpdated)) return "available";
  return localPreview || checked ? "current" : "checking";
}
