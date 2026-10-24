export type ReleaseSection = { title: string; description: string; image: string; imageAlt: string; items: string[] };
// changes/image continuam obrigatórios: versões antigas do sistema leem só esses campos.
export type ReleaseNotes = { version?: string; title: string; summary: string; changes: string[]; image: string; imageAlt: string; sections?: ReleaseSection[] };
export type AppVersion = { id: string; builtAt: string; releaseNotes?: ReleaseNotes };
const isUpdateImage = (value: unknown) => typeof value === "string" && /^updates\/[a-zA-Z0-9._-]+$/.test(value);
const isStringList = (value: unknown) => Array.isArray(value) && value.every(item => typeof item === "string");
const isSection = (value: unknown): value is ReleaseSection => {
  if (!value || typeof value !== "object") return false;
  const section = value as Record<string, unknown>;
  return typeof section.title === "string" && typeof section.description === "string" &&
    isUpdateImage(section.image) && typeof section.imageAlt === "string" && isStringList(section.items);
};
export function parseAppVersion(value: unknown): AppVersion | null {
  if (!value || typeof value !== "object") return null;
  const { id, builtAt } = value as Record<string, unknown>;
  const raw = (value as Record<string, unknown>).releaseNotes as Partial<ReleaseNotes> | undefined;
  const valid = raw && typeof raw.title === "string" && typeof raw.summary === "string" &&
    isStringList(raw.changes) && isUpdateImage(raw.image) && typeof raw.imageAlt === "string";
  let releaseNotes: ReleaseNotes | undefined;
  if (valid) {
    // Seções inválidas são descartadas; o resumo principal continua disponível.
    const { sections, ...notes } = raw as ReleaseNotes;
    releaseNotes = Array.isArray(sections) && sections.every(isSection) ? { ...notes, sections } : notes;
  }
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
