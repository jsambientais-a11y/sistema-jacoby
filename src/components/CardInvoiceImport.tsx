import { useState } from "react";
import { Upload, FileText, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useCreditCards } from "@/hooks/use-credit-cards";
import { useCostCenters, compatibleCenter } from "@/hooks/use-cost-centers";
import { cardMoney, type CreditCard, type CardPurchase } from "@/lib/credit-cards";
import { parseFinanceMoney, localFinanceToday } from "@/lib/enterprise-finance";
import {
  readCsv,
  guessCsvColumns,
  importCsvRows,
  importOfxRows,
  importPdfLines,
  importRowMatch,
  type ImportedCardRow,
  type CsvColumns,
} from "@/lib/card-import";
type ReviewRow = ImportedCardRow & {
  selected: boolean;
  duplicate: boolean;
  center: string;
  value: string;
  importKey: string;
};
const selectClass = "h-9 rounded-md border bg-background px-2 text-sm";
export function CardInvoiceImport({
  card,
  month,
  purchases,
  statementTotal,
}: {
  card: CreditCard;
  month: string;
  purchases: CardPurchase[];
  statementTotal: number;
}) {
  const data = useCreditCards();
  const centers = useCostCenters();
  const [open, setOpen] = useState(false),
    [reading, setReading] = useState(false),
    [fileName, setFileName] = useState(""),
    [hash, setHash] = useState(""),
    [error, setError] = useState("");
  const [csv, setCsv] = useState<string[][] | null>(null),
    [hasHeader, setHasHeader] = useState(true),
    [columns, setColumns] = useState<CsvColumns>({
      date: 0,
      description: 1,
      amount: 2,
      installment: -1,
    }),
    [negative, setNegative] = useState(false);
  const [review, setReview] = useState<ReviewRow[]>([]),
    [defaultCenter, setDefaultCenter] = useState(""),
    [expected, setExpected] = useState(""),
    [ack, setAck] = useState(false);
  const today = localFinanceToday();
  const busy = reading || data.importInvoice.isPending;
  const prepare = (rows: ImportedCardRow[], fileHash: string) => {
    if (rows.length > 500) throw new Error("A importação aceita até 500 linhas. Divida o arquivo.");
    if (!rows.length)
      throw new Error(
        "Nenhuma compra reconhecida. Para PDF escaneado ou layout não reconhecido, use CSV/OFX exportado pelo banco.",
      );
    const existing = new Set(
      purchases
        .filter((p) => !p.deleted_at && p.first_invoice_month === `${month}-01`)
        .map((p) => importRowMatch(p.description, p.purchased_on, Number(p.amount_cents))),
    );
    setReview(
      rows.map((r, i) => {
        const description =
          r.installmentLabel && !r.description.includes(r.installmentLabel)
            ? `${r.description} · Parcela ${r.installmentLabel}`
            : r.description;
        const duplicate = existing.has(importRowMatch(description, r.date, r.amountCents));
        const issue = r.issue || (r.date > today ? "Data futura: confira a compra" : undefined);
        return {
          ...r,
          description,
          issue,
          duplicate,
          selected: !issue && !duplicate,
          center: defaultCenter,
          value: r.amountCents > 0 ? (r.amountCents / 100).toFixed(2).replace(".", ",") : "",
          importKey: r.sourceId ? `ofx:${r.sourceId}` : `file:${fileHash}:${month}:${i}`,
        };
      }),
    );
    setAck(false);
  };
  const readFile = async (file: File) => {
    setError("");
    setReview([]);
    setCsv(null);
    setFileName(file.name);
    if (file.size > 20 * 1024 * 1024) {
      setError("Escolha uma fatura de até 20 MB.");
      return;
    }
    setReading(true);
    try {
      const bytes = await file.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const fileHash = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      setHash(fileHash);
      const ext = file.name.split(".").at(-1)?.toLowerCase();
      if (ext === "pdf") {
        const { cardPdfLines } = await import("@/lib/card-import-pdf");
        const lines = await cardPdfLines(bytes);
        prepare(importPdfLines(lines, month), fileHash);
      } else {
        let text = new TextDecoder().decode(bytes);
        if (text.includes("\uFFFD")) text = new TextDecoder("windows-1252").decode(bytes);
        if (ext === "ofx") {
          prepare(importOfxRows(text, month), fileHash);
        } else if (ext === "csv" || ext === "txt") {
          const rows = readCsv(text);
          setCsv(rows);
          const guessed = guessCsvColumns(rows[0]);
          setColumns({
            ...guessed,
            date: guessed.date < 0 ? 0 : guessed.date,
            description: guessed.description < 0 ? 1 : guessed.description,
            amount: guessed.amount < 0 ? 2 : guessed.amount,
          });
          setHasHeader(true);
        } else throw new Error("Use CSV, OFX ou PDF.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
    } finally {
      setReading(false);
    }
  };
  const selection = review.filter((r) => r.selected);
  const total = selection.reduce((s, r) => {
    try {
      return s + parseFinanceMoney(r.value);
    } catch {
      return s;
    }
  }, 0);
  const invalid = selection.some(
    (r) =>
      !r.description.trim() ||
      !r.date ||
      r.date > today ||
      (() => {
        try {
          parseFinanceMoney(r.value);
          return false;
        } catch {
          return true;
        }
      })(),
  );
  let expectedCents: number | null = null;
  try {
    if (expected.trim()) expectedCents = parseFinanceMoney(expected);
  } catch {}
  const difference = expectedCents == null ? null : expectedCents - statementTotal - total;
  const save = async () => {
    try {
      const result = await data.importInvoice.mutateAsync({
        cardId: card.id,
        month,
        items: selection.map((r) => ({
          import_key: r.importKey,
          description: r.description.trim(),
          merchant: "",
          amount_cents: parseFinanceMoney(r.value),
          purchased_on: r.date,
          cost_center_id: r.center || null,
          notes: `Importado da fatura ${fileName}. ${r.installmentLabel ? `Parcela indicada no arquivo: ${r.installmentLabel}. ` : ""}Importação somente deste mês, sem gerar parcelas futuras.`,
        })),
      });
      setOpen(false);
      setReview([]);
      toast.success(
        `${result.added} despesa(s) importada(s).${result.skipped ? ` ${result.skipped} já importada(s), sem duplicar.` : ""}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível importar.");
    }
  };
  const patch = (id: string, values: Partial<ReviewRow>) =>
    setReview((rows) => rows.map((r) => (r.id === id ? { ...r, ...values } : r)));
  return (
    <>
      <Button
        variant="outline"
        disabled={!card.active}
        onClick={() => {
          setOpen(true);
          setError("");
        }}
      >
        <Upload className="mr-2 h-4 w-4" />
        Importar fatura
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
      >
        <DialogContent className="flex max-h-[94vh] flex-col overflow-hidden sm:max-w-6xl">
          <DialogTitle>Importar fatura · {card.name}</DialogTitle>
          <DialogDescription>
            Fatura com vencimento em {month.split("-").reverse().join("/")}. Leia o arquivo, confira
            as compras e confirme o lote. Nada é cadastrado ao escolher o arquivo.
          </DialogDescription>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed bg-muted/20 p-4">
              <FileText className="h-7 w-7 shrink-0 text-primary" />
              <span className="flex-1">
                <b className="block">
                  {reading ? "Lendo fatura…" : fileName || "Selecionar fatura"}
                </b>
                <span className="text-xs text-muted-foreground">
                  CSV, OFX ou PDF com texto · até 20 MB · leitura feita neste navegador
                </span>
              </span>
              <input
                aria-label="Arquivo da fatura"
                type="file"
                accept=".csv,.ofx,.pdf,.txt"
                disabled={busy}
                className="max-w-[220px] text-xs"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void readFile(f);
                  e.target.value = "";
                }}
              />
            </label>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
              <b>Importação de despesas desta fatura.</b> Parcelas como 02/10 entram somente neste
              mês; não geramos as oito seguintes para não duplicar quando importar as próximas
              faturas. Pagamentos, créditos e estornos não entram como novas despesas. PDF pode
              variar por banco: confira valores e linhas reconhecidas.
            </div>
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-destructive p-3 text-sm text-destructive"
              >
                {error}
              </p>
            )}
            {csv && (
              <section className="space-y-3 rounded-xl border p-3">
                <h3 className="font-semibold">Colunas do CSV</h3>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex gap-2">
                    <input
                      type="checkbox"
                      checked={hasHeader}
                      onChange={(e) => {
                        setHasHeader(e.target.checked);
                        setReview([]);
                      }}
                    />
                    Primeira linha é cabeçalho
                  </label>
                  <label className="flex gap-2">
                    <input
                      type="checkbox"
                      checked={negative}
                      onChange={(e) => {
                        setNegative(e.target.checked);
                        setReview([]);
                      }}
                    />
                    As despesas têm valor negativo neste arquivo
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  {(
                    [
                      ["date", "Data"],
                      ["description", "Descrição"],
                      ["amount", "Valor"],
                      ["installment", "Parcela (opcional)"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="space-y-1 text-sm">
                      <span>{label}</span>
                      <select
                        className={selectClass + " w-full"}
                        value={columns[key]}
                        onChange={(e) => {
                          setColumns({ ...columns, [key]: Number(e.target.value) });
                          setReview([]);
                        }}
                      >
                        <option value={-1}>Não selecionar</option>
                        {csv[0].map((h, i) => (
                          <option key={i} value={i}>
                            {hasHeader ? h : `Coluna ${i + 1} · ${h}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    try {
                      setError("");
                      prepare(
                        importCsvRows(hasHeader ? csv.slice(1) : csv, columns, month, negative),
                        hash,
                      );
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "CSV inválido.");
                    }
                  }}
                >
                  Montar prévia
                </Button>
              </section>
            )}
            {review.length > 0 && (
              <>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">
                      {review.length} linha(s) reconhecida(s) · {selection.length} selecionada(s)
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Possíveis duplicidades começam desmarcadas. Ajuste os campos antes de
                      confirmar.
                    </p>
                  </div>
                  <label className="text-sm">
                    Centro de custo para todas
                    <select
                      className={selectClass + " ml-2"}
                      value={defaultCenter}
                      onChange={(e) => {
                        const center = e.target.value;
                        setDefaultCenter(center);
                        setReview(review.map((r) => ({ ...r, center })));
                      }}
                    >
                      <option value="">Sem centro</option>
                      {centers.data
                        ?.filter((c) => c.active && compatibleCenter(c, "payable"))
                        .map((c) => (
                          <option value={c.id} key={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="p-2">Importar</th>
                        <th>Data da compra</th>
                        <th>Descrição</th>
                        <th>Valor (R$)</th>
                        <th>Centro de custo</th>
                        <th>Conferência</th>
                      </tr>
                    </thead>
                    <tbody>
                      {review.map((r) => (
                        <tr
                          key={r.id}
                          className={`border-b last:border-0 ${!r.selected ? "bg-muted/20 text-muted-foreground" : ""}`}
                        >
                          <td className="p-2">
                            <input
                              type="checkbox"
                              aria-label={`Importar ${r.description}`}
                              checked={r.selected}
                              onChange={(e) => {
                                patch(r.id, { selected: e.target.checked });
                                setAck(false);
                              }}
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              aria-label={`Data ${r.id}`}
                              className="h-8 w-36 text-xs"
                              type="date"
                              max={today}
                              value={r.date}
                              onChange={(e) => patch(r.id, { date: e.target.value })}
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              aria-label={`Descrição ${r.id}`}
                              className="h-8 min-w-52 text-xs"
                              maxLength={500}
                              value={r.description}
                              onChange={(e) => patch(r.id, { description: e.target.value })}
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              aria-label={`Valor ${r.id}`}
                              className="h-8 w-28 text-xs"
                              inputMode="decimal"
                              value={r.value}
                              onChange={(e) => patch(r.id, { value: e.target.value })}
                            />
                          </td>
                          <td className="p-2">
                            <select
                              aria-label={`Centro ${r.id}`}
                              className={selectClass + " max-w-44 text-xs"}
                              value={r.center}
                              onChange={(e) => patch(r.id, { center: e.target.value })}
                            >
                              <option value="">Sem centro</option>
                              {centers.data
                                ?.filter((c) => c.active && compatibleCenter(c, "payable"))
                                .map((c) => (
                                  <option value={c.id} key={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                            </select>
                          </td>
                          <td className="max-w-48 p-2">
                            {r.duplicate ? (
                              <span className="text-amber-700">
                                Possível duplicidade: já existe nesta fatura
                              </span>
                            ) : r.issue ? (
                              <span className="text-amber-700">{r.issue}</span>
                            ) : (
                              <span className="text-primary">Pronta para conferir</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="grid gap-3 rounded-lg bg-muted/30 p-3 text-sm sm:grid-cols-3">
                  <p>
                    Já cadastrado nesta fatura <b className="block">{cardMoney(statementTotal)}</b>
                  </p>
                  <p>
                    Selecionado para importar <b className="block">{cardMoney(total)}</b>
                  </p>
                  <p>
                    Total após importação{" "}
                    <b className="block text-primary">{cardMoney(statementTotal + total)}</b>
                  </p>
                </div>
                <label className="block max-w-sm space-y-1 text-sm">
                  <span>Total da fatura do banco (opcional, para comparar)</span>
                  <Input
                    placeholder="Ex.: 2.500,00"
                    inputMode="decimal"
                    value={expected}
                    onChange={(e) => setExpected(e.target.value)}
                  />
                </label>
                {difference !== null && (
                  <p
                    className={difference === 0 ? "text-sm text-primary" : "text-sm text-amber-700"}
                  >
                    {difference === 0
                      ? "O total confere com a fatura informada."
                      : `Diferença de ${cardMoney(difference)}. Confira linhas ausentes, créditos, estornos e despesas já cadastradas.`}
                  </p>
                )}
                <label className="flex gap-2 rounded-lg border p-3 text-sm">
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                  <span>
                    Conferi as despesas selecionadas e o total. Sei que pagamentos, créditos e
                    estornos não são cadastrados por esta importação.
                  </span>
                </label>
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 border-t pt-3">
            <p className="text-xs text-muted-foreground">
              {invalid && (
                <span className="text-destructive">
                  Corrija data, descrição ou valor das linhas selecionadas.
                </span>
              )}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                disabled={
                  busy ||
                  !selection.length ||
                  invalid ||
                  !ack ||
                  centers.isLoading ||
                  !!centers.error
                }
                onClick={() => void save()}
              >
                {data.importInvoice.isPending
                  ? "Importando…"
                  : `Importar ${selection.length} despesa(s)`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
