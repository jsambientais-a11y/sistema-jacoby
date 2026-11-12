import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Check,
  CreditCard,
  Paperclip,
  Pencil,
  ReceiptText,
  Repeat,
  Tags,
  Trash2,
} from "lucide-react";
import {
  financeStatus,
  financeUrgency,
  overdueDays,
  type FinanceKind,
  type FinanceRow,
} from "@/lib/enterprise-finance";
import { Button } from "@/components/ui/button";

const money = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string | null) =>
  value ? value.split("-").reverse().join("/") : "Sem previsão";

// A cor segue a posição do centro na lista: o mesmo centro mantém a mesma etiqueta.
const centerTones = [
  "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-100",
  "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-100",
  "bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-100",
  "bg-pink-100 text-pink-900 dark:bg-pink-950 dark:text-pink-100",
  "bg-yellow-100 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-100",
  "bg-cyan-100 text-cyan-900 dark:bg-cyan-950 dark:text-cyan-100",
  "bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-950 dark:text-fuchsia-100",
  "bg-lime-100 text-lime-900 dark:bg-lime-950 dark:text-lime-100",
];
const rowTones = {
  settled: "bg-emerald-200/80 dark:bg-emerald-900/60",
  overdue: "bg-red-50 hover:bg-red-100/70 dark:bg-red-950/30",
  today: "bg-amber-50 hover:bg-amber-100/70 dark:bg-amber-950/30",
  upcoming: "hover:bg-muted/60",
};
const secondary =
  "text-muted-foreground group-data-[paid=true]/row:text-emerald-950 dark:group-data-[paid=true]/row:text-emerald-100";
const cell = "border-b border-r border-border p-2.5 align-middle last:border-r-0";
const head =
  "sticky top-0 z-10 whitespace-nowrap border-b border-r border-border bg-secondary p-2.5 text-left text-xs font-semibold text-secondary-foreground last:border-r-0";

type Named = { id: string; name: string };
export function FinanceTable({
  rows,
  kind,
  today,
  showDeleted,
  centers,
  banks,
  pending,
  busy,
  classifyDisabled,
  editDisabled,
  onToggle,
  onChangeDate,
  onClassify,
  onEdit,
  onDelete,
  onRestore,
  onAttachments,
}: {
  rows: FinanceRow[];
  kind: FinanceKind;
  today: string;
  showDeleted: boolean;
  centers: Named[] | undefined;
  banks: Named[] | undefined;
  /** Baixas em andamento, já pintadas antes da resposta do servidor. */
  pending: Record<string, string | null>;
  busy: boolean;
  classifyDisabled: boolean;
  editDisabled: boolean;
  onToggle: (row: FinanceRow) => void;
  onChangeDate: (row: FinanceRow) => void;
  onClassify: (row: FinanceRow) => void;
  onEdit: (row: FinanceRow) => void;
  onDelete: (row: FinanceRow) => void;
  onRestore: (row: FinanceRow) => void;
  onAttachments: (row: FinanceRow) => void;
}) {
  const payable = kind === "payable";
  const headers = [
    "Baixa",
    "Vencimento",
    "Descrição",
    payable ? "Fornecedor" : "Cliente",
    "Centro de custo",
    "Banco / conta",
    "Valor",
    "Situação",
    "Ações",
  ];
  return (
    <div className="max-h-[72vh] overflow-auto rounded-lg border">
      <table className="w-full min-w-[1120px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} className={`${head} ${h === "Valor" ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((source) => {
            const settledOn = source.id in pending ? pending[source.id] : source.settledOn;
            const row = { ...source, settledOn };
            const urgency = showDeleted ? "upcoming" : financeUrgency(row, today);
            const partial = row.source === "card" && !!row.paidCents && !settledOn;
            const card = row.source === "card";
            const centerIndex = (centers || []).findIndex((c) => c.id === row.costCenterId);
            const paidWord = row.kind === "payable" ? "pago" : "recebido";
            return (
              <tr
                key={row.id}
                data-paid={!!settledOn && !showDeleted}
                className={`group/row transition-colors duration-300 ${rowTones[urgency]}`}
              >
                <td className={`${cell} w-12 px-1 text-center`}>
                  {!showDeleted &&
                    (row.canSettle || card ? (
                      <button
                        type="button"
                        aria-pressed={!!settledOn}
                        aria-label={`${settledOn ? "Desfazer baixa de" : `Marcar como ${paidWord}:`} ${row.description}`}
                        title={settledOn ? "Desfazer baixa" : `Marcar como ${paidWord}`}
                        disabled={row.id in pending}
                        onClick={() => onToggle(source)}
                        className="group/check inline-grid h-8 w-8 place-items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span
                          className={`grid h-4 w-4 place-items-center rounded border transition-colors ${settledOn ? "border-emerald-700 text-emerald-800 dark:border-emerald-300 dark:text-emerald-200" : "border-muted-foreground/50 bg-background text-transparent group-hover/check:border-emerald-600"}`}
                        >
                          <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
                        </span>
                      </button>
                    ) : (
                      <Button asChild size="icon" variant="ghost" className="h-8 w-8">
                        <Link
                          to="/financeiro"
                          search={{ aba: "faturado" }}
                          title="Conferir em Faturamento"
                          aria-label={`Conferir ${row.description} em Faturamento`}
                        >
                          <ArrowUpRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    ))}
                </td>
                <td className={`${cell} whitespace-nowrap tabular-nums`}>{date(row.dueOn)}</td>
                <td className={`${cell} min-w-64`}>
                  <span className="flex items-center gap-2">
                    {card && (
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-indigo-600 text-white">
                        <CreditCard className="h-4 w-4" aria-hidden="true" />
                      </span>
                    )}
                    <span className="min-w-0">
                      <b className="block font-semibold">{row.description}</b>
                      <span className={`block text-xs ${secondary}`}>
                        {card
                          ? "Cartão de crédito"
                          : row.source === "billing"
                            ? "Vinculado ao Faturamento"
                            : "Cadastro manual"}
                        {!card && row.category ? ` · ${row.category}` : ""}
                      </span>
                    </span>
                  </span>
                  {row.manual?.recurrence_id && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-900 dark:bg-violet-950 dark:text-violet-100">
                      <Repeat className="h-3 w-3" aria-hidden="true" />
                      Recorrente
                      {row.manual.recurrence_overridden ? " · ocorrência ajustada" : ""}
                    </span>
                  )}
                </td>
                <td className={cell}>{row.counterparty || "—"}</td>
                <td className={cell}>
                  {card ? (
                    <span className={`whitespace-nowrap text-xs ${secondary}`}>
                      Detalhado na fatura
                    </span>
                  ) : row.costCenterId ? (
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${centerTones[Math.max(centerIndex, 0) % centerTones.length]}`}
                    >
                      {centers?.[centerIndex]?.name || "Carregando…"}
                    </span>
                  ) : (
                    <span className={`whitespace-nowrap text-xs ${secondary}`}>Sem centro</span>
                  )}
                </td>
                <td className={cell}>
                  {row.bankAccountId ? (
                    banks?.find((b) => b.id === row.bankAccountId)?.name || "Carregando…"
                  ) : (
                    <span className={`whitespace-nowrap text-xs ${secondary}`}>Não informado</span>
                  )}
                </td>
                <td className={`${cell} whitespace-nowrap text-right font-semibold tabular-nums`}>
                  {money(row.amountCents)}
                  {partial && (
                    <span className={`block text-xs font-normal ${secondary}`}>
                      Pago: {money(row.paidCents!)} · Em aberto:{" "}
                      {money(row.amountCents - row.paidCents!)}
                    </span>
                  )}
                  {row.provisional && (
                    <span className="block text-xs font-normal text-amber-800 dark:text-amber-300">
                      Provisório · conferir no Faturamento
                    </span>
                  )}
                </td>
                <td className={`${cell} whitespace-nowrap`}>
                  <Status
                    row={row}
                    today={today}
                    urgency={urgency}
                    partial={partial}
                    onChangeDate={
                      row.source === "manual" && !showDeleted
                        ? () => onChangeDate(source)
                        : undefined
                    }
                  />
                </td>
                <td className={`${cell} w-32`}>
                  <div className="flex items-center gap-0.5">
                    {payable && row.manual && !row.manual.credit_card_id && (
                      <IconAction
                        label={`Anexos de ${row.description}`}
                        title="Anexos"
                        disabled={busy}
                        onClick={() => onAttachments(source)}
                      >
                        <Paperclip className="h-4 w-4" />
                      </IconAction>
                    )}
                    {showDeleted ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => onRestore(source)}
                      >
                        Restaurar
                      </Button>
                    ) : card ? (
                      <Button size="sm" variant="outline" asChild>
                        <Link to="/cartoes" search={{ card: row.cardId, month: row.invoiceMonth }}>
                          <ReceiptText className="mr-1 h-3.5 w-3.5" />
                          Ver fatura
                        </Link>
                      </Button>
                    ) : (
                      <>
                        <IconAction
                          label={`Centro e banco de ${row.description}`}
                          title="Centro de custo e banco"
                          disabled={busy || classifyDisabled}
                          onClick={() => onClassify(source)}
                        >
                          <Tags className="h-4 w-4" />
                        </IconAction>
                        {row.manual && !row.manual.credit_card_id && (
                          <>
                            <IconAction
                              label={`Editar ${row.description}`}
                              title="Editar"
                              disabled={editDisabled}
                              onClick={() => onEdit(source)}
                            >
                              <Pencil className="h-4 w-4" />
                            </IconAction>
                            <IconAction
                              label={`Excluir ${row.description}`}
                              title="Excluir"
                              onClick={() => onDelete(source)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </IconAction>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function IconAction({
  label,
  title,
  disabled,
  onClick,
  children,
}: {
  label: string;
  title: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      aria-label={label}
      title={title}
      size="icon"
      variant="ghost"
      className="h-8 w-8"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function Status({
  row,
  today,
  urgency,
  partial,
  onChangeDate,
}: {
  row: FinanceRow;
  today: string;
  urgency: ReturnType<typeof financeUrgency>;
  partial: boolean;
  onChangeDate?: () => void;
}) {
  if (row.settledOn)
    return (
      <span className="font-semibold text-emerald-900 dark:text-emerald-100">
        {financeStatus(row, today)}
        {onChangeDate ? (
          <button
            type="button"
            title="Alterar a data da baixa"
            className="block text-xs font-normal tabular-nums underline underline-offset-2"
            onClick={onChangeDate}
          >
            {date(row.settledOn)}
          </button>
        ) : (
          <span className="block text-xs font-normal tabular-nums">{date(row.settledOn)}</span>
        )}
      </span>
    );
  if (partial) return <span className="font-semibold">Parcialmente paga</span>;
  if (urgency === "today")
    return (
      <span className="rounded bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950">
        Vence hoje
      </span>
    );
  if (urgency === "overdue") {
    const days = overdueDays(row.dueOn!, today);
    return (
      <span className="rounded bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground">
        Vencido há {days} {days === 1 ? "dia" : "dias"}
      </span>
    );
  }
  return <span>{financeStatus(row, today)}</span>;
}
