import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { compatibleCenter, useCostCenters, useBanks } from "@/hooks/use-cost-centers";
import { useReceiptDetails } from "@/hooks/use-receipt-details";
import { InlineRecurrenceFields } from "@/components/InlineRecurrenceFields";
import { useFinanceRecurrences } from "@/hooks/use-finance-recurrences";
import { inlineRecurrence, type InlineRecurrence } from "@/lib/finance-recurrence";
import { aggregateCardInvoices } from "@/lib/credit-cards";
import { useCreditCards } from "@/hooks/use-credit-cards";
import { useFinanceAccounts } from "@/hooks/use-finance-accounts";
import { useBillingFlowData } from "@/hooks/use-billing-flow";
import { billingAgreement } from "@/lib/billing-agreement";
import { toReceivable, inPeriod, type Period, settlementInput } from "@/lib/receivables";
import {
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
import { FinanceTable } from "@/components/FinanceTable";
const money = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string | null) =>
  value ? value.split("-").reverse().join("/") : "Sem previsão";
const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm";
const accountTitles = {
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
export function EnterpriseFinance({
  kind,
  focus,
}: {
  kind: FinanceKind;
  focus?: "overdue" | "urgent";
}) {
  const payable = kind === "payable";
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
  const [period, setPeriod] = useState<Period>(
      focus ? { kind: "all" } : { kind: "month", month: today.slice(0, 7) },
    ),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState<string>(focus || "all"),
    [showDeleted, setShowDeleted] = useState(false);
  // O padrão é o mês vigente. Só a chegada por um aviso abre todos os períodos, e sair
  // dela (ou trocar entre pagar e receber) volta ao padrão.
  useEffect(() => {
    setPeriod(focus ? { kind: "all" } : { kind: "month", month: localFinanceToday().slice(0, 7) });
    setStatus(focus || "all");
    setShowDeleted(false);
  }, [focus, kind]);
  const [draft, setDraft] = useState<Draft | null>(null),
    [confirm, setConfirm] = useState<{
      row: FinanceRow;
      action: "settle" | "reopen" | "delete" | "restore";
    } | null>(null),
    [settleDate, setSettleDate] = useState(today),
    [settleBank, setSettleBank] = useState(""),
    [optimistic, setOptimistic] = useState<Record<string, string | null>>({});
  // A trava de concorrência usa updated_at: o "Desfazer" do aviso precisa da versão mais recente.
  const latestAccounts = useRef(accounts.data);
  latestAccounts.current = accounts.data;
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
  const summary = summarizeFinance(
    allDetails.filter((row) => row.kind === kind && detailInScope(row)),
  );
  const missingDate = all.filter((r) => r.kind === kind && !r.dueOn && !r.settledOn).length;
  const rows = (
    showDeleted
      ? (accounts.data || [])
          .filter((a) => a.deleted_at && !a.credit_card_id && !a.recurrence_suppressed)
          .map(manualFinanceRow)
      : all
  )
    .filter(
      (r) =>
        r.kind === kind &&
        inScope(r) &&
        (!search ||
          `${r.description} ${r.counterparty} ${r.category}`
            .toLocaleLowerCase("pt-BR")
            .includes(search.toLocaleLowerCase("pt-BR"))) &&
        (status === "all" ||
          (status === "open" && !r.settledOn) ||
          (status === "settled" && !!r.settledOn) ||
          (status === "overdue" && !r.settledOn && !!r.dueOn && r.dueOn < today) ||
          (status === "urgent" && !r.settledOn && !!r.dueOn && r.dueOn <= today)),
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
    credit.settle.isPending ||
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
      kind,
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
  const paint = async (id: string, settledOn: string | null, write: () => Promise<void>) => {
    setOptimistic((current) => ({ ...current, [id]: settledOn }));
    try {
      await write();
    } finally {
      setOptimistic(({ [id]: _done, ...rest }) => rest);
    }
  };
  const setManualSettled = (row: FinanceRow, settledOn: string | null) =>
    paint(row.id, settledOn, async () => {
      const old = latestAccounts.current?.find((a) => a.id === row.manual?.id);
      if (!old) throw new Error("Lançamento não encontrado.");
      await accounts.save.mutateAsync({ old, values: { settled_on: settledOn } });
    });
  const setCardSettled = (row: FinanceRow, settledOn: string | null, bank: string | null) =>
    paint(row.id, settledOn, () =>
      credit.settle.mutateAsync({
        cardId: row.cardId!,
        month: row.invoiceMonth!,
        date: settledOn,
        bank,
        total: row.amountCents,
      }),
    );
  // Um clique registra a baixa com a data de hoje; o aviso oferece desfazer na hora.
  const quickToggle = async (row: FinanceRow) => {
    const openDialog = (action: "settle" | "reopen", bank = "") => {
      setSettleDate(today);
      setSettleBank(bank);
      setConfirm({ row, action });
    };
    try {
      if (row.source === "billing") return openDialog(row.settledOn ? "reopen" : "settle");
      if (row.source === "card") {
        // Desfazer limpa todas as baixas da fatura, então pede confirmação.
        if (row.settledOn) return openDialog("reopen");
        const defaultBank = credit.cards.data?.find((c) => c.id === row.cardId)?.bank_account_id;
        const bank = banks.data?.find((b) => b.id === defaultBank && b.active);
        if (!bank) return openDialog("settle", "");
        await setCardSettled(row, today, bank.id);
        toast.success(`Fatura paga em ${date(today)} pela conta ${bank.name}.`, {
          // Com pagamento parcial anterior, desfazer apagaria também aquelas baixas.
          action: row.paidCents
            ? undefined
            : {
                label: "Desfazer",
                onClick: () => void setCardSettled(row, null, null).catch(fail),
              },
        });
        return;
      }
      const previous = row.settledOn;
      const next = previous ? null : today;
      await setManualSettled(row, next);
      toast.success(next ? `Baixa registrada em ${date(next)}.` : "Baixa desfeita.", {
        action: {
          label: "Desfazer",
          onClick: () => void setManualSettled(row, previous).catch(fail),
        },
      });
    } catch (e) {
      fail(e);
    }
  };
  const execute = async () => {
    if (!confirm) return;
    try {
      const { row, action } = confirm;
      if (row.source === "card") {
        await setCardSettled(
          row,
          action === "settle" ? settleDate : null,
          action === "settle" ? settleBank : null,
        );
      } else if (row.source === "billing") {
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
        <h1 className="text-3xl font-bold">{accountTitles[kind]}</h1>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodFilter value={period} onChange={setPeriod} />
        <Button onClick={newAccount}>
          <Plus className="mr-2 h-4 w-4" />
          Nova conta {payable ? "a pagar" : "a receber"}
        </Button>
      </div>
      {(accounts.error || flowError) && (
        <div
          role="alert"
          className="rounded border border-destructive bg-destructive/5 p-3 text-sm"
        >
          Não foi possível carregar todos os valores. Os totais podem estar incompletos.{" "}
          {accounts.error?.message || flowError?.message}
        </div>
      )}
      <section aria-label="Resumo do período" className="grid gap-3 sm:grid-cols-2">
        {[
          [
            payable ? "A pagar em aberto" : "A receber em aberto",
            payable ? summary.openOut : summary.openIn,
          ],
          [
            payable ? "Pago no período" : "Recebido no período",
            payable ? summary.paid : summary.received,
          ],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-bold text-primary">
              {accounts.error || flowError
                ? "Indisponível"
                : flowLoading || accounts.isLoading
                  ? "Carregando…"
                  : money(Number(value))}
            </p>
          </div>
        ))}
      </section>
      {missingDate > 0 && (
        <Button
          variant="link"
          className="h-auto px-0 text-xs"
          onClick={() => {
            setPeriod({ kind: "all" });
            setStatus("open");
            setShowDeleted(false);
          }}
        >
          {missingDate} conta(s) sem previsão. Ver todos os períodos
        </Button>
      )}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto font-semibold">
            {accountTitles[kind]} ({rows.length})
          </h2>
          <Input
            aria-label="Buscar conta"
            placeholder="Descrição, cliente ou fornecedor"
            className="h-9 w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            aria-label="Filtrar por centro de custo"
            className={`${selectClass} h-9 w-auto max-w-52`}
            value={centerFilter}
            onChange={(e) => setCenterFilter(e.target.value)}
          >
            <option value="">Todos os centros</option>
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
            className={`${selectClass} h-9 w-auto max-w-52`}
            value={bankFilter}
            onChange={(e) => setBankFilter(e.target.value)}
          >
            <option value="">Todos os bancos</option>
            <option value="none">Banco não informado</option>
            {(banks.data || []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.active ? "" : " (desativado)"}
              </option>
            ))}
          </select>
          <select
            aria-label="Situação da conta"
            className={`${selectClass} h-9 w-auto`}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">Todas as situações</option>
            <option value="open">Em aberto</option>
            <option value="urgent">Vencidas e de hoje</option>
            <option value="overdue">Vencidas</option>
            <option value="settled">{payable ? "Pagas" : "Recebidas"}</option>
          </select>
          <Button variant="outline" size="sm" onClick={() => setShowDeleted(!showDeleted)}>
            {showDeleted ? "Ver ativas" : "Excluídas"}
          </Button>
        </div>
        <FinanceTable
          rows={rows}
          kind={kind}
          today={today}
          showDeleted={showDeleted}
          centers={centers.data}
          banks={banks.data}
          pending={optimistic}
          busy={busy}
          classifyDisabled={receiptDetails.isLoading || !!receiptDetails.error}
          editDisabled={recurring.isLoading || !!recurring.error}
          onToggle={(row) => void quickToggle(row)}
          onChangeDate={(row) => {
            setSettleDate(row.settledOn || today);
            setConfirm({ row, action: "settle" });
          }}
          onClassify={(row) =>
            setClassification({
              row,
              center: row.costCenterId || "",
              bank: row.bankAccountId || "",
            })
          }
          onEdit={(row) =>
            setDraft({
              repeat: inlineRecurrence(
                recurring.data?.find((r) => r.id === row.manual?.recurrence_id),
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
          onDelete={(row) => setConfirm({ row, action: "delete" })}
          onRestore={(row) => setConfirm({ row, action: "restore" })}
        />
        {!rows.length && (
          <p className="p-5 text-center text-sm text-muted-foreground">
            {accounts.isLoading || flowLoading
              ? "Carregando contas…"
              : "Nenhuma conta nesta seleção."}
          </p>
        )}
        {!payable && (
          <p className="text-xs text-muted-foreground">
            Os recebíveis do Faturamento aparecem automaticamente. Cadastre manualmente somente
            receitas adicionais, para não duplicar o mesmo recebimento.
          </p>
        )}
      </section>
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
                  className={selectClass}
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
                  className={selectClass}
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
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
            <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="finance-description">Descrição</Label>
                <Input
                  id="finance-description"
                  required
                  maxLength={500}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
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
              <div className="space-y-1.5">
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
              <div className="space-y-1.5">
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
              <div className="space-y-1.5">
                <Label htmlFor="finance-category">Categoria</Label>
                <Input
                  id="finance-category"
                  maxLength={200}
                  placeholder="Ex.: aluguel, pessoal, serviços"
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="finance-center">Centro de custo</Label>
                <select
                  id="finance-center"
                  className={selectClass}
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
              <div className="space-y-1.5">
                <Label htmlFor="finance-bank">
                  Banco / conta {draft.kind === "receivable" ? "de entrada" : "de saída"}
                </Label>
                <select
                  id="finance-bank"
                  className={selectClass}
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
              {draft.kind === "payable" && (
                <div className="sm:col-span-2">
                  <InlineRecurrenceFields
                    value={draft.repeat || inlineRecurrence()}
                    onChange={(repeat) => setDraft({ ...draft, repeat })}
                    existing={!!draft.old?.recurrence_id}
                    start={draft.due_on}
                    disabled={busy}
                  />
                </div>
              )}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="finance-notes">Observações</Label>
                <textarea
                  id="finance-notes"
                  rows={2}
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  maxLength={10000}
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 sm:col-span-2">
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
              ? confirm.row.settledOn
                ? "Alterar data da baixa"
                : "Registrar baixa"
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
              : confirm?.row.source === "card"
                ? confirm.action === "reopen"
                  ? "As baixas desta fatura serão desfeitas e os valores voltarão ao contas a pagar. Nenhum dinheiro será movimentado."
                  : "Este cartão não tem conta padrão ativa. Informe de qual conta a fatura saiu. Nenhum dinheiro será movimentado."
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
          {confirm?.action === "settle" && confirm.row.source === "card" && (
            <div className="space-y-1">
              <Label htmlFor="finance-settlement-bank">Conta bancária de saída</Label>
              <select
                id="finance-settlement-bank"
                className={selectClass}
                value={settleBank}
                onChange={(e) => setSettleBank(e.target.value)}
              >
                <option value="">Selecione a conta</option>
                {(banks.data || [])
                  .filter((b) => b.active)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </select>
              <Link to="/bancos" className="text-xs text-primary underline underline-offset-2">
                Cadastrar conta em Bancos e contas
              </Link>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button
              disabled={
                busy ||
                (confirm?.action === "settle" &&
                  (!settleDate ||
                    settleDate > today ||
                    (confirm.row.source === "card" && !settleBank)))
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
