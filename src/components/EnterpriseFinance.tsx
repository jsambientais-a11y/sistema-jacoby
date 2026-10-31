import { Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import {
  Plus,
  Tags,
  Pencil,
  Trash2,
  Undo2,
  CheckCircle2,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";
import { compatibleCenter, useCostCenters, useBanks } from "@/hooks/use-cost-centers";
import { useReceiptDetails } from "@/hooks/use-receipt-details";
import { InlineRecurrenceFields } from "@/components/InlineRecurrenceFields";
import { useFinanceRecurrences } from "@/hooks/use-finance-recurrences";
import { inlineRecurrence, type InlineRecurrence } from "@/lib/finance-recurrence";
import { FinanceComparison } from "@/components/FinanceComparison";
import { aggregateCardInvoices } from "@/lib/credit-cards";
import { useCreditCards } from "@/hooks/use-credit-cards";
import { useFinanceAccounts } from "@/hooks/use-finance-accounts";
import { useBillingFlowData } from "@/hooks/use-billing-flow";
import { billingAgreement } from "@/lib/billing-agreement";
import { toReceivable, inPeriod, type Period, settlementInput } from "@/lib/receivables";
import {
  financeStatus,
  localFinanceToday,
  manualFinanceRow,
  parseFinanceMoney,
  summarizeFinance,
  type FinanceRow,
  type FinanceAccount,
  type FinanceKind,
} from "@/lib/enterprise-finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PeriodFilter } from "@/components/PeriodFilter";
const money = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string | null) =>
  value ? value.split("-").reverse().join("/") : "Sem previsão";
const tabNames = {
  billed: "Faturado",
  payable: "Contas a pagar",
  receivable: "Contas a receber",
} as const;
type Draft = {
  repeat?: InlineRecurrence;
  description: string;
  counterparty: string;
  category: string;
  cost_center_id: string;
  bank_account_id: string;
  value: string;
  due_on: string;
  notes: string;
  kind: FinanceKind;
  old?: FinanceAccount;
};
export function EnterpriseFinance({ billed }: { billed: ReactNode }) {
  const initial = useSearch({ strict: false }) as { view?: string; status?: string };
  const accounts = useFinanceAccounts();
  const recurring = useFinanceRecurrences();
  const credit = useCreditCards();
  const centers = useCostCenters();
  const banks = useBanks();
  const receiptDetails = useReceiptDetails();
  const [classification, setClassification] = useState<{
    row: FinanceRow;
    center: string;
    bank: string;
  } | null>(null);
  const [bankFilter, setBankFilter] = useState("");
  const [centerFilter, setCenterFilter] = useState("");
  const flow = useBillingFlowData();
  const today = localFinanceToday();
  const [tab, setTab] = useState<keyof typeof tabNames>(
      initial.view === "payable" ? "payable" : "billed",
    ),
    [period, setPeriod] = useState<Period>(
      initial.status === "overdue" ? { kind: "all" } : { kind: "month", month: today.slice(0, 7) },
    ),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(initial.status === "overdue" ? "overdue" : "all"),
    [showDeleted, setShowDeleted] = useState(false);
  useEffect(() => {
    if (initial.view === "payable" && initial.status === "overdue") {
      setTab("payable");
      setPeriod({ kind: "all" });
      setStatus("overdue");
      setShowDeleted(false);
    }
  }, [initial.view, initial.status]);
  const [draft, setDraft] = useState<Draft | null>(null),
    [confirm, setConfirm] = useState<{
      row: FinanceRow;
      action: "settle" | "reopen" | "delete" | "restore";
    } | null>(null),
    [settleDate, setSettleDate] = useState(today);
  const active = (accounts.data || []).filter((a) => !a.deleted_at).map(manualFinanceRow);
  const billing = flow.billingFlowEntries.map((entry) => {
    const r = toReceivable(entry, today, billingAgreement(entry).requiresAgreement);
    return {
      id: `billing:${r.id}`,
      kind: "receivable" as const,
      description: `BM ${entry.bulletin} · ${entry.description}`,
      counterparty: entry.client,
      category: "Faturamento",
      costCenterId: receiptDetails.data?.find((d) => d.entry_id === r.id)?.cost_center_id,
      bankAccountId: receiptDetails.data?.find((d) => d.entry_id === r.id)?.bank_account_id,
      amountCents: Math.round(r.amount * 100),
      dueOn: r.expectedOn || r.invoiceDueOn,
      settledOn: r.receivedOn,
      source: "billing" as const,
      canSettle: r.canSettle,
      provisional: !r.confirmed,
      entry,
    };
  });
  // Reutiliza a mesma regra e a mesma baixa do Faturamento. Nunca cria cópia manual dos BMs.
  const allDetails: FinanceRow[] = [...active, ...billing];
  const all: FinanceRow[] = [
    ...active.filter((r) => !r.manual?.credit_card_id),
    ...aggregateCardInvoices(accounts.data || [], credit.cards.data || []),
    ...billing,
  ];
  const detailInScope = (r: FinanceRow) =>
    inPeriod(r.settledOn || r.dueOn, period) &&
    (!centerFilter ||
      (centerFilter === "none" ? !r.costCenterId : r.costCenterId === centerFilter)) &&
    (!bankFilter || (bankFilter === "none" ? !r.bankAccountId : r.bankAccountId === bankFilter));
  const inScope = (r: FinanceRow) =>
    r.source === "card"
      ? allDetails.some(
          (d) =>
            d.manual?.credit_card_id === r.cardId &&
            d.manual?.invoice_month === `${r.invoiceMonth}-01` &&
            detailInScope(d),
        )
      : detailInScope(r);
  const summary = summarizeFinance(allDetails.filter(detailInScope));
  const missingDate = all.filter((r) => !r.dueOn && !r.settledOn).length;
  const rows = (
    showDeleted
      ? (accounts.data || [])
          .filter((a) => a.deleted_at && !a.credit_card_id && !a.recurrence_suppressed)
          .map(manualFinanceRow)
      : all
  )
    .filter(
      (r) =>
        r.kind === tab &&
        inScope(r) &&
        (!search ||
          `${r.description} ${r.counterparty} ${r.category}`
            .toLocaleLowerCase("pt-BR")
            .includes(search.toLocaleLowerCase("pt-BR"))) &&
        (status === "all" ||
          (status === "open" && !r.settledOn) ||
          (status === "settled" && !!r.settledOn) ||
          (status === "overdue" && !r.settledOn && !!r.dueOn && r.dueOn < today)),
    )
    .sort((a, b) => (a.dueOn || "9999").localeCompare(b.dueOn || "9999"));
  const flowError = [
    credit.cards,
    centers,
    banks,
    receiptDetails,
    flow.servicesQuery,
    flow.movementCommissionsQuery,
    flow.cyclesQuery,
    flow.directBillingDataQuery,
    flow.billingTrackingQuery,
    flow.companiesQuery,
    flow.branchesQuery,
  ]
    .map((q) => q.error)
    .find(Boolean) as Error | undefined;
  const flowLoading = [
    credit.cards,
    flow.servicesQuery,
    flow.movementCommissionsQuery,
    flow.cyclesQuery,
    flow.directBillingDataQuery,
    flow.billingTrackingQuery,
  ].some((q) => q.isLoading);
  const busy =
    accounts.save.isPending ||
    recurring.saveInline.isPending ||
    flow.settleReceivable.isPending ||
    receiptDetails.save.isPending;
  const fail = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
  const newAccount = () =>
    setDraft({
      description: "",
      counterparty: "",
      category: "",
      cost_center_id: "",
      bank_account_id: "",
      value: "",
      due_on: today,
      notes: "",
      kind: tab === "payable" ? "payable" : "receivable",
    });
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    try {
      const values = {
        description: draft.description.trim(),
        counterparty: draft.counterparty.trim(),
        category: draft.category.trim(),
        cost_center_id: draft.cost_center_id || null,
        bank_account_id: draft.bank_account_id || null,
        amount_cents: parseFinanceMoney(draft.value),
        due_on: draft.due_on,
        notes: draft.notes,
        kind: draft.kind,
      };
      if (draft.kind === "payable")
        await recurring.saveInline.mutateAsync({
          old: draft.old,
          values,
          repeat: draft.repeat || inlineRecurrence(),
        });
      else
        await accounts.save.mutateAsync({
          old: draft.old,
          values: {
            description: draft.description.trim(),
            counterparty: draft.counterparty.trim(),
            category: draft.category.trim(),
            cost_center_id: draft.cost_center_id || null,
            bank_account_id: draft.bank_account_id || null,
            amount_cents: parseFinanceMoney(draft.value),
            due_on: draft.due_on,
            notes: draft.notes,
            kind: draft.kind,
          },
        });
      setDraft(null);
      toast.success("Lançamento salvo no Financeiro.");
    } catch (e) {
      fail(e);
    }
  };
  const execute = async () => {
    if (!confirm) return;
    try {
      const { row, action } = confirm;
      if (row.source === "billing") {
        const b = billing.find((b) => b.id === row.id);
        if (!b) throw new Error("Atualize para conferir este recebível.");
        const values = settlementInput(
          b.entry,
          action === "settle" ? settleDate : null,
          billingAgreement(b.entry).requiresAgreement,
        );
        if (!values) throw new Error("Confira o valor no Faturamento antes de registrar a baixa.");
        await flow.settleReceivable.mutateAsync({ entry: b.entry, ...values });
      } else {
        if (!row.manual) throw new Error("Lançamento não encontrado.");
        await accounts.save.mutateAsync({
          old: row.manual,
          values:
            action === "delete"
              ? { deleted_at: new Date().toISOString() }
              : action === "restore"
                ? { deleted_at: null }
                : { settled_on: action === "settle" ? settleDate : null },
        });
      }
      setConfirm(null);
      toast.success(
        action === "delete"
          ? "Lançamento excluído. Você pode restaurá-lo."
          : action === "restore"
            ? "Lançamento restaurado."
            : "Baixa atualizada.",
      );
    } catch (e) {
      fail(e);
    }
  };
  return (
    <div className="mx-auto min-w-0 max-w-[1500px] space-y-5 p-4 sm:p-6">
      <header>
        <p className="text-sm font-semibold text-primary">Controle empresarial</p>
        <h1 className="text-3xl font-bold">Financeiro</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Acompanhe obrigações, recebimentos e o comparativo do período. As baixas registram o
          controle; não executam pagamentos bancários.
        </p>
      </header>
      <nav aria-label="Áreas do Financeiro" className="flex flex-wrap gap-2 border-b pb-3">
        {Object.entries(tabNames).map(([id, label]) => (
          <Button
            key={id}
            variant={tab === id ? "default" : "outline"}
            onClick={() => {
              setTab(id as keyof typeof tabNames);
              setShowDeleted(false);
            }}
          >
            {label}
          </Button>
        ))}
      </nav>
      {tab === "billed" ? (
        billed
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <PeriodFilter value={period} onChange={setPeriod} />
            <select
              aria-label="Filtrar por centro de custo"
              className="h-10 max-w-xs rounded-md border bg-background px-3 text-sm"
              value={centerFilter}
              onChange={(e) => setCenterFilter(e.target.value)}
            >
              <option value="">Todos os centros de custo</option>
              <option value="none">Sem centro de custo</option>
              {(centers.data || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.active ? "" : " (desativado)"}
                </option>
              ))}
            </select>
            <select
              aria-label="Filtrar por banco"
              className="h-10 max-w-xs rounded-md border bg-background px-3 text-sm"
              value={bankFilter}
              onChange={(e) => setBankFilter(e.target.value)}
            >
              <option value="">Todos os bancos/contas</option>
              <option value="none">Banco não informado</option>
              {(banks.data || []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.active ? "" : " (desativado)"}
                </option>
              ))}
            </select>
            <Button onClick={newAccount}>
              <Plus className="mr-2 h-4 w-4" />
              Nova conta {tab === "payable" ? "a pagar" : "a receber"}
            </Button>
          </div>
          {(accounts.error || flowError) && (
            <div
              role="alert"
              className="rounded border border-destructive bg-destructive/5 p-3 text-sm"
            >
              Não foi possível carregar todos os valores. O comparativo pode estar incompleto.{" "}
              {accounts.error?.message || flowError?.message}
            </div>
          )}
          <section aria-label="Comparativo financeiro" className="rounded-xl border bg-card p-4">
            <div className="mb-3">
              <h2 className="font-semibold">Entradas × saídas</h2>
              <p className="text-xs text-muted-foreground">
                Período por vencimento/previsão para contas abertas e por data de baixa para
                concluídas. Valores do Faturamento seguem a comissão ou receita da Jacoby.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["A receber em aberto", summary.openIn, "Receitas ainda não recebidas"],
                ["A pagar em aberto", summary.openOut, "Despesas ainda não pagas"],
                [
                  "Saldo previsto do período",
                  summary.expectedNet,
                  "Receitas previstas e recebidas − despesas previstas e pagas",
                ],
                [
                  "Resultado realizado",
                  summary.realizedNet,
                  "Recebido − pago no período; não é o saldo bancário",
                ],
              ].map(([label, value, hint]) => (
                <div key={String(label)} className="rounded-lg border p-3">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <b
                    className={`mt-1 block text-xl ${Number(value) < 0 ? "text-destructive" : "text-primary"}`}
                  >
                    {accounts.error || flowError
                      ? "Indisponível"
                      : flowLoading || accounts.isLoading
                        ? "Carregando…"
                        : money(Number(value))}
                  </b>
                  <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-5 text-sm">
              <span className="inline-flex items-center gap-1">
                <ArrowDownLeft className="h-4 w-4 text-primary" />
                Recebido: {money(summary.received)}
              </span>
              <span className="inline-flex items-center gap-1">
                <ArrowUpRight className="h-4 w-4 text-destructive" />
                Pago: {money(summary.paid)}
              </span>
            </div>
            {billing.some((r) => r.provisional && inScope(r)) && (
              <p className="mt-2 text-xs text-amber-700">
                O comparativo inclui valores provisórios do Faturamento, sujeitos à conferência.
              </p>
            )}
            {missingDate > 0 && (
              <Button
                variant="link"
                className="mt-1 h-auto px-0 text-xs"
                onClick={() => {
                  setPeriod({ kind: "all" });
                  setTab("receivable");
                  setStatus("open");
                }}
              >
                {missingDate} recebível(is) sem previsão: ver em todos os períodos
              </Button>
            )}
          </section>
          <FinanceComparison
            income={summary.openIn}
            expenses={summary.openOut}
            loading={flowLoading || accounts.isLoading}
            error={!!accounts.error || !!flowError}
          />
          <section className="space-y-3 rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">
                {tabNames[tab]} ({rows.length})
              </h2>
              <div className="flex flex-wrap gap-2">
                <Input
                  aria-label="Buscar conta"
                  placeholder="Descrição, cliente ou fornecedor"
                  className="w-64"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select
                  aria-label="Situação da conta"
                  className="rounded-md border bg-background p-2 text-sm"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="all">Todas as situações</option>
                  <option value="open">Em aberto</option>
                  <option value="overdue">Vencidas</option>
                  <option value="settled">{tab === "payable" ? "Pagas" : "Recebidas"}</option>
                </select>
                <Button variant="outline" onClick={() => setShowDeleted(!showDeleted)}>
                  {showDeleted ? "Ver ativas" : "Excluídas"}
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    {[
                      "Descrição / origem",
                      "Cliente / fornecedor",
                      "Vencimento",
                      "Valor",
                      "Situação / baixa",
                      "Ações",
                    ].map((h) => (
                      <th key={h} className="p-3 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="p-3">
                        <b className="block">{row.description}</b>
                        {row.manual?.recurrence_id && (
                          <span className="mt-1 inline-flex rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800">
                            Recorrente
                            {row.manual.recurrence_overridden ? " · ocorrência ajustada" : ""}
                          </span>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {row.source === "card"
                            ? "Fatura do cartão"
                            : row.source === "billing"
                              ? "Vinculado ao Faturamento"
                              : "Cadastro manual"}
                          {row.category ? ` · ${row.category}` : ""}
                        </p>
                        <div className="mt-1.5">
                          {row.source === "card" ? (
                            <span className="text-xs text-muted-foreground">
                              Compras e centros de custo na fatura
                            </span>
                          ) : row.costCenterId ? (
                            <span
                              className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-blue-900 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-100"
                              aria-label={`Centro de custo vinculado: ${centers.data?.find((c) => c.id === row.costCenterId)?.name || "Carregando"}`}
                            >
                              <Tags
                                className="h-3 w-3 shrink-0 text-blue-600 dark:text-blue-300"
                                aria-hidden="true"
                              />
                              <span className="min-w-0 break-words text-xs leading-4">
                                <span className="text-blue-700 dark:text-blue-300">Centro: </span>
                                <span className="font-semibold">
                                  {centers.data?.find((c) => c.id === row.costCenterId)?.name ||
                                    "Carregando…"}
                                </span>
                              </span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-0.5 text-xs text-muted-foreground">
                              <Tags className="h-3 w-3" aria-hidden="true" />
                              Sem centro de custo
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Banco/conta:{" "}
                          {row.bankAccountId
                            ? banks.data?.find((b) => b.id === row.bankAccountId)?.name ||
                              "Carregando…"
                            : "Não informado"}
                        </p>
                      </td>
                      <td className="p-3">{row.counterparty || "—"}</td>
                      <td className="whitespace-nowrap p-3">{date(row.dueOn)}</td>
                      <td className="whitespace-nowrap p-3 font-semibold">
                        {money(row.amountCents)}
                        {row.source === "card" && !!row.paidCents && !row.settledOn && (
                          <span className="block text-xs font-normal text-muted-foreground">
                            Pago: {money(row.paidCents)} · Em aberto:{" "}
                            {money(row.amountCents - row.paidCents)}
                          </span>
                        )}
                        {row.provisional && (
                          <span className="block text-xs font-normal text-amber-700">
                            Provisório · conferir no Faturamento
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <span
                          className={
                            row.settledOn
                              ? "text-primary"
                              : row.dueOn && row.dueOn < today
                                ? "text-destructive"
                                : ""
                          }
                        >
                          {row.source === "card" && !!row.paidCents && !row.settledOn
                            ? "Parcialmente paga"
                            : financeStatus(row, today)}
                        </span>
                        {row.settledOn && (
                          <span className="block text-xs">{date(row.settledOn)}</span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          {showDeleted ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => setConfirm({ row, action: "restore" })}
                            >
                              Restaurar
                            </Button>
                          ) : row.source === "card" ? (
                            <Button size="sm" variant="outline" asChild>
                              <Link
                                to="/cartoes"
                                search={{ card: row.cardId, month: row.invoiceMonth }}
                              >
                                Ver fatura
                              </Link>
                            </Button>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={
                                  busy || receiptDetails.isLoading || !!receiptDetails.error
                                }
                                onClick={() =>
                                  setClassification({
                                    row,
                                    center: row.costCenterId || "",
                                    bank: row.bankAccountId || "",
                                  })
                                }
                              >
                                Centro / banco
                              </Button>
                              {row.canSettle ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() => {
                                    setSettleDate(today);
                                    setConfirm({
                                      row,
                                      action: row.settledOn ? "reopen" : "settle",
                                    });
                                  }}
                                >
                                  {row.settledOn ? (
                                    <>
                                      <Undo2 className="mr-1 h-3 w-3" />
                                      Desfazer baixa
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="mr-1 h-3 w-3" />
                                      {row.kind === "payable"
                                        ? "Registrar pagamento"
                                        : "Registrar recebimento"}
                                    </>
                                  )}
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setTab("billed")}
                                >
                                  Conferir faturado
                                </Button>
                              )}
                              {row.manual && !row.manual.credit_card_id && (
                                <>
                                  <Button
                                    disabled={recurring.isLoading || !!recurring.error}
                                    aria-label={`Editar ${row.description}`}
                                    size="icon"
                                    variant="ghost"
                                    onClick={() =>
                                      setDraft({
                                        repeat: inlineRecurrence(
                                          recurring.data?.find(
                                            (r) => r.id === row.manual?.recurrence_id,
                                          ),
                                        ),
                                        old: row.manual,
                                        kind: row.kind,
                                        description: row.description,
                                        counterparty: row.counterparty,
                                        category: row.category,
                                        cost_center_id: row.costCenterId || "",
                                        bank_account_id: row.bankAccountId || "",
                                        value: (row.amountCents / 100).toFixed(2).replace(".", ","),
                                        due_on: row.dueOn || today,
                                        notes: row.manual!.notes,
                                      })
                                    }
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    aria-label={`Excluir ${row.description}`}
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => setConfirm({ row, action: "delete" })}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows.length && (
              <p className="p-5 text-center text-sm text-muted-foreground">
                {accounts.isLoading || flowLoading
                  ? "Carregando contas…"
                  : "Nenhuma conta nesta seleção."}
              </p>
            )}
            {tab === "receivable" && (
              <p className="text-xs text-muted-foreground">
                Os recebíveis do Faturamento aparecem automaticamente. Cadastre manualmente somente
                receitas adicionais, para não duplicar o mesmo recebimento.
              </p>
            )}
          </section>
        </>
      )}
      <Dialog
        open={!!classification}
        onOpenChange={(open) => {
          if (!open && !busy) setClassification(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Centro de custo e banco</DialogTitle>
          <DialogDescription>
            {classification?.row.description}. Classificação opcional deste lançamento, inclusive
            após a baixa. Não altera o valor, a data ou a nota do Faturamento.
          </DialogDescription>
          {classification && (
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const { row, center, bank } = classification;
                  if (row.manual) {
                    await accounts.save.mutateAsync({
                      old: row.manual,
                      values: { cost_center_id: center || null, bank_account_id: bank || null },
                    });
                  } else {
                    const b = billing.find((b) => b.id === row.id);
                    if (!b) throw new Error("Atualize para conferir este recebimento.");
                    await receiptDetails.save.mutateAsync({
                      old: receiptDetails.data?.find((d) => d.entry_id === b.entry.id),
                      values: {
                        entry_id: b.entry.id,
                        cycle_id: b.entry.cycleId,
                        cost_center_id: center || null,
                        bank_account_id: bank || null,
                      },
                    });
                  }
                  setClassification(null);
                  toast.success("Centro e banco salvos neste lançamento.");
                } catch (e) {
                  fail(e);
                }
              }}
            >
              <div>
                <Label htmlFor="receipt-center">Centro de custo</Label>
                <select
                  id="receipt-center"
                  className="h-10 w-full rounded-md border bg-background px-3"
                  value={classification.center}
                  onChange={(e) => setClassification({ ...classification, center: e.target.value })}
                >
                  <option value="">Sem centro de custo</option>
                  {(centers.data || [])
                    .filter(
                      (c) =>
                        (c.active && compatibleCenter(c, classification.row.kind)) ||
                        c.id === classification.center,
                    )
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.active ? "" : " (desativado)"}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <Label htmlFor="receipt-bank">
                  {classification.row.kind === "receivable"
                    ? "Banco / conta em que entrou"
                    : "Banco / conta de saída"}
                </Label>
                <select
                  id="receipt-bank"
                  className="h-10 w-full rounded-md border bg-background px-3"
                  value={classification.bank}
                  onChange={(e) => setClassification({ ...classification, bank: e.target.value })}
                >
                  <option value="">Não informado</option>
                  {(banks.data || [])
                    .filter((b) => b.active || b.id === classification.bank)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                        {b.active ? "" : " (desativado)"}
                      </option>
                    ))}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                Cadastre as opções em Financeiro → Centros de custo ou Bancos e contas. O banco é
                apenas identificado; nenhuma movimentação bancária é executada.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setClassification(null)}
                >
                  Cancelar
                </Button>
                <Button
                  disabled={
                    busy || centers.isLoading || banks.isLoading || !!centers.error || !!banks.error
                  }
                >
                  Salvar classificação
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!draft}
        onOpenChange={(v) => {
          if (!v && !busy) setDraft(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogTitle>
            {draft?.old ? "Editar conta" : "Nova conta"}{" "}
            {draft?.kind === "payable" ? "a pagar" : "a receber"}
          </DialogTitle>
          <DialogDescription>
            {draft?.old?.recurrence_id
              ? "Você está editando somente esta ocorrência. Use Repetir esta despesa para escolher entre alterar somente esta conta ou as próximas."
              : "Cadastro operacional do Financeiro. Ative Repetir esta despesa para torná-la recorrente."}
          </DialogDescription>
          {draft && (
            <form onSubmit={save} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="finance-description">Descrição</Label>
                <Input
                  id="finance-description"
                  required
                  maxLength={500}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="finance-party">
                  {draft.kind === "payable" ? "Fornecedor / favorecido" : "Cliente / origem"}
                </Label>
                <Input
                  id="finance-party"
                  maxLength={500}
                  value={draft.counterparty}
                  onChange={(e) => setDraft({ ...draft, counterparty: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="finance-value">Valor (R$)</Label>
                  <Input
                    id="finance-value"
                    inputMode="decimal"
                    required
                    placeholder="1.500,00"
                    value={draft.value}
                    onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="finance-due">Vencimento</Label>
                  <Input
                    id="finance-due"
                    disabled={!!draft.old?.recurrence_id && draft.repeat?.scope === "future"}
                    type="date"
                    required
                    value={draft.due_on}
                    onChange={(e) => setDraft({ ...draft, due_on: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="finance-center">Centro de custo</Label>
                <select
                  id="finance-center"
                  className="h-10 w-full rounded-md border bg-background px-3"
                  value={draft.cost_center_id}
                  onChange={(e) => setDraft({ ...draft, cost_center_id: e.target.value })}
                >
                  <option value="">Sem centro de custo</option>
                  {(centers.data || [])
                    .filter(
                      (c) =>
                        (c.active && compatibleCenter(c, draft.kind)) ||
                        c.id === draft.cost_center_id,
                    )
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.active ? "" : " (desativado)"}
                      </option>
                    ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="finance-bank">
                  Banco / conta {draft.kind === "receivable" ? "de entrada" : "de saída"}
                </Label>
                <select
                  id="finance-bank"
                  className="h-10 w-full rounded-md border bg-background px-3"
                  value={draft.bank_account_id}
                  onChange={(e) => setDraft({ ...draft, bank_account_id: e.target.value })}
                >
                  <option value="">Não informado</option>
                  {(banks.data || [])
                    .filter((b) => b.active || b.id === draft.bank_account_id)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                        {b.active ? "" : " (desativado)"}
                      </option>
                    ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="finance-category">Categoria</Label>
                <Input
                  id="finance-category"
                  maxLength={200}
                  placeholder="Ex.: aluguel, pessoal, serviços"
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                />
              </div>
              {draft.kind === "payable" && (
                <InlineRecurrenceFields
                  value={draft.repeat || inlineRecurrence()}
                  onChange={(repeat) => setDraft({ ...draft, repeat })}
                  existing={!!draft.old?.recurrence_id}
                  start={draft.due_on}
                  disabled={busy}
                />
              )}
              <div className="space-y-1">
                <Label htmlFor="finance-notes">Observações</Label>
                <textarea
                  id="finance-notes"
                  className="w-full rounded border bg-background p-2 text-sm"
                  maxLength={10000}
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setDraft(null)}
                >
                  Cancelar
                </Button>
                <Button disabled={busy || recurring.isLoading || !!recurring.error}>
                  {busy ? "Salvando…" : "Salvar conta"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!confirm}
        onOpenChange={(v) => {
          if (!v && !busy) setConfirm(null);
        }}
      >
        <DialogContent>
          <DialogTitle>
            {confirm?.action === "settle"
              ? "Registrar baixa"
              : confirm?.action === "reopen"
                ? "Desfazer baixa?"
                : confirm?.action === "delete"
                  ? "Excluir conta?"
                  : "Restaurar conta?"}
          </DialogTitle>
          <DialogDescription>
            {confirm?.row.description} · {confirm && money(confirm.row.amountCents)}.{" "}
            {confirm?.action === "delete"
              ? "A conta sairá do comparativo e ficará recuperável em Excluídas."
              : "Confira antes de salvar. A baixa de um recebível do Faturamento é compartilhada com aquela tela."}
          </DialogDescription>
          {confirm?.action === "settle" && (
            <div className="space-y-1">
              <Label htmlFor="finance-settlement">
                Data {confirm.row.kind === "payable" ? "do pagamento" : "do recebimento"}
              </Label>
              <Input
                id="finance-settlement"
                type="date"
                max={today}
                value={settleDate}
                onChange={(e) => setSettleDate(e.target.value)}
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button
              disabled={
                busy || (confirm?.action === "settle" && (!settleDate || settleDate > today))
              }
              onClick={() => void execute()}
            >
              {busy ? "Salvando…" : "Confirmar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
