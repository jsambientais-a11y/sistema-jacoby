export type ImportedCardRow = {
  id: string;
  date: string;
  description: string;
  amountCents: number;
  sourceId?: string;
  installmentLabel?: string;
  issue?: string;
};
export type CsvColumns = { date: number; description: number; amount: number; installment: number };
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
export function readCsv(text: string) {
  const first =
    text
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .find((l) => l.trim()) || "";
  const delimiter = [";", ",", "\t"].sort(
    (a, b) => first.split(b).length - first.split(a).length,
  )[0];
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === delimiter && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(value.trim());
      if (row.some((v) => v)) rows.push(row);
      row = [];
      value = "";
    } else value += c;
  }
  if (quoted) throw new Error("CSV com aspas não fechadas. Exporte o arquivo novamente.");
  row.push(value.trim());
  if (row.some((v) => v)) rows.push(row);
  if (!rows.length) throw new Error("O CSV está vazio.");
  return rows;
}
export function guessCsvColumns(headers: string[]): CsvColumns {
  const h = headers.map(norm);
  return {
    date: h.findIndex((s) =>
      /^(data|date|data da compra|data compra|dt compra|data de compra|data do lancamento)$/.test(
        s,
      ),
    ),
    description: h.findIndex((s) =>
      /^(descricao|description|title|estabelecimento|historico|lancamento|nome)$/.test(s),
    ),
    amount: h.findIndex((s) =>
      /^(valor|amount|valor r\$|valor \(r\$\)|valor da compra|valor compra)$/.test(s),
    ),
    installment: h.findIndex((s) => /parcela/.test(s)),
  };
}
export function parseImportDate(value: string, month: string) {
  const v = value.trim();
  let y: number, m: number, d: number;
  let match = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    [, y, m, d] = match.map(Number);
  } else {
    match = v.match(/^(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2}|\d{4}))?$/);
    if (!match) return "";
    d = Number(match[1]);
    m = Number(match[2]);
    y = match[3] ? Number(match[3]) : Number(month.slice(0, 4));
    if (y < 100) y += 2000;
    if (!match[3] && m > Number(month.slice(5, 7))) y--;
  }
  const check = new Date(y, m - 1, d, 12);
  if (check.getFullYear() !== y || check.getMonth() !== m - 1 || check.getDate() !== d) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
export function parseImportAmount(value: string) {
  let v = value.replace(/R\$|\s/g, "").trim();
  const negative = /^-|^\(|-$/.test(v);
  v = v.replace(/[()+-]/g, "");
  if (v.includes(",")) {
    if (!/^\d+(?:\.\d{3})*,\d{1,2}$/.test(v)) return null;
    v = v.replaceAll(".", "").replace(",", ".");
  } else if (!/^\d+(?:\.\d{1,2})?$/.test(v)) return null;
  const n = Math.round(Number(v) * 100) * (negative ? -1 : 1);
  return Number.isSafeInteger(n) && Math.abs(n) <= 1e12 ? n : null;
}
export function importCsvRows(
  rows: string[][],
  columns: CsvColumns,
  month: string,
  negativeExpenses = false,
): ImportedCardRow[] {
  if (columns.date < 0 || columns.description < 0 || columns.amount < 0)
    throw new Error("Selecione as colunas de data, descrição e valor.");
  return rows.map((r, i) => {
    const date = parseImportDate(r[columns.date] || "", month),
      desc = r[columns.description]?.trim() || "",
      raw = parseImportAmount(r[columns.amount] || ""),
      amount = raw == null ? 0 : raw * (negativeExpenses ? -1 : 1);
    return {
      id: `csv-${i}`,
      date,
      description: desc,
      amountCents: amount,
      installmentLabel: columns.installment >= 0 ? r[columns.installment] : undefined,
      issue: !date
        ? "Data não reconhecida"
        : !desc
          ? "Sem descrição"
          : raw == null
            ? "Valor não reconhecido"
            : amount <= 0
              ? "Pagamento, crédito ou estorno: não importar como despesa"
              : undefined,
    };
  });
}
const tag = (s: string, name: string) =>
  s.match(new RegExp(`<${name}>([^<\\r\\n]+)`, "i"))?.[1]?.trim() || "";
export function importOfxRows(text: string, month: string): ImportedCardRow[] {
  const blocks =
    text.match(/<STMTTRN>[\s\S]*?(?:<\/STMTTRN>|(?=<STMTTRN>|<\/BANKTRANLIST>))/gi) || [];
  if (!blocks.length) throw new Error("Não foram encontrados lançamentos no OFX.");
  return blocks.map((block, i) => {
    const rawDate = tag(block, "DTPOSTED").slice(0, 8);
    const date =
      rawDate.length === 8
        ? parseImportDate(
            `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`,
            month,
          )
        : "";
    const raw = parseImportAmount(tag(block, "TRNAMT"));
    const description = tag(block, "MEMO") || tag(block, "NAME");
    const expense = raw == null ? 0 : -raw;
    return {
      id: `ofx-${i}`,
      date,
      description,
      amountCents: expense,
      sourceId: tag(block, "FITID"),
      issue: !date
        ? "Data não reconhecida"
        : !description
          ? "Sem descrição"
          : raw == null
            ? "Valor não reconhecido"
            : expense <= 0
              ? "Pagamento, crédito ou estorno: não importar como despesa"
              : undefined,
    };
  });
}
export function importPdfLines(lines: string[], month: string): ImportedCardRow[] {
  const result: ImportedCardRow[] = [];
  for (const line of lines) {
    const m = line
      .trim()
      .match(
        /^(\d{1,2}[\/.]\d{1,2}(?:[\/.](?:\d{4}|\d{2}))?)\s+(.+?)\s+(-?\s*(?:R\$\s*)?\d[\d.,]*[,.]\d{2}-?)\s*$/,
      );
    if (!m) continue;
    const date = parseImportDate(m[1], month),
      description = m[2].trim(),
      amount = parseImportAmount(m[3]);
    const payment = /pagamento|saldo anterior|total da fatura|limite disponivel/i.test(
      norm(description),
    );
    result.push({
      id: `pdf-${result.length}`,
      date,
      description,
      amountCents: amount || 0,
      installmentLabel: description.match(/\b(\d{1,2}\s*\/\s*\d{1,2})\b/)?.[1],
      issue: !date
        ? "Data não reconhecida"
        : amount == null
          ? "Valor não reconhecido"
          : amount <= 0 || payment
            ? "Pagamento, crédito ou estorno: não importar como despesa"
            : undefined,
    });
  }
  return result;
}
export const importRowMatch = (description: string, date: string, cents: number) =>
  `${norm(description).replace(/\s+/g, " ")}|${date}|${cents}`;
