export type BillingBulletin = {
  id: string;
  number: number;
  emittedAt: string | null;
  client: string;
  branch: string;
  company: string;
  residues?: { id: string; name: string }[];
};

// A emissão é a finalização do BM, e não a emissão da NF ou o número do BM.
export function sortBillingBulletins<T extends Pick<BillingBulletin, "id" | "number" | "emittedAt">>(bulletins: T[]): T[] {
  const emission = (value: string | null) => {
    const time = value ? Date.parse(value) : NaN;
    return Number.isFinite(time) ? time : -Infinity;
  };
  return [...bulletins].sort((a, b) => {
    const first = emission(a.emittedAt);
    const second = emission(b.emittedAt);
    if (first !== second) return first > second ? -1 : 1;
    return b.number - a.number || a.id.localeCompare(b.id);
  });
}

// Aceita tanto 15 quanto #015 e mantém os sufixos de recortes (015.2).
export function matchesBulletinNumber(number: string | number, search: string) {
  const normalize = (value: string) => value.trim().replace(/^(?:bm\s*)?#?\s*/i, "")
    .split(".").map((part) => part.replace(/^0+(?=\d)/, "")).join(".");
  if (!search.trim()) return true;
  const query = normalize(search);
  return Boolean(query) && normalize(String(number)).includes(query);
}
