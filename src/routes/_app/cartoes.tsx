import { InlineRecurrenceFields } from "@/components/InlineRecurrenceFields";
import { useFinanceRecurrences } from "@/hooks/use-finance-recurrences";
import { inlineRecurrence, type InlineRecurrence } from "@/lib/finance-recurrence";
import { CardInvoiceImport } from "@/components/CardInvoiceImport";
import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import {
  Repeat2,
  CreditCard as CardIcon,
  Plus,
  Pencil,
  RotateCcw,
  Trash2,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCreditCards } from "@/hooks/use-credit-cards";
import { useFinanceAccounts } from "@/hooks/use-finance-accounts";
import { useBanks, useCostCenters, compatibleCenter } from "@/hooks/use-cost-centers";
import {
  CARD_BANKS,
  cardMoney,
  cardDate,
  firstCardInvoice,
  shiftCardMonth,
  splitCardInstallments,
  type CreditCard,
  type CardPurchase,
} from "@/lib/credit-cards";
import { localFinanceToday, parseFinanceMoney } from "@/lib/enterprise-finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
export const Route = createFileRoute("/_app/cartoes")({
  component: CreditCardsPage,
  validateSearch: (s: Record<string, unknown>): { card?: string; month?: string } => ({
    card: typeof s.card === "string" ? s.card : undefined,
    month:
      typeof s.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s.month) ? s.month : undefined,
  }),
});
type CardDraft = {
  old?: CreditCard;
  name: string;
  bank_label: string;
  theme: string;
  last_four: string;
  closing_day: number;
  due_day: number;
  limit: string;
  bank: string;
};
type PurchaseDraft = {
  repeat?: InlineRecurrence;
  old?: CardPurchase;
  description: string;
  merchant: string;
  category: string;
  value: string;
  date: string;
  installments: number;
  firstMonth: string;
  center: string;
  notes: string;
};
const dateLabel = (d: string) => d.split("-").reverse().join("/");
const inputSelect = "h-10 w-full rounded-md border bg-background px-3 text-sm";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
function CreditCardsPage() {
  const { hasPermission, isClient } = useAuth();
  const data = useCreditCards();
  const accounts = useFinanceAccounts();
  const recurring = useFinanceRecurrences();
  const banks = useBanks();
  const centers = useCostCenters();
  const search = Route.useSearch();
  const today = localFinanceToday();
  const [selectedId, setSelectedId] = useState(search.card || ""),
    [month, setMonth] = useState(search.month || today.slice(0, 7)),
    [showInactive, setShowInactive] = useState(false),
    [deleted, setDeleted] = useState(false),
    [query, setQuery] = useState("");
  const [cardDraft, setCardDraft] = useState<CardDraft | null>(null),
    [purchaseDraft, setPurchaseDraft] = useState<PurchaseDraft | null>(null);
  const [confirm, setConfirm] = useState<{
      action: "pay" | "reopen" | "delete" | "restore";
      purchase?: CardPurchase;
      total?: number;
    } | null>(null),
    [payDate, setPayDate] = useState(today),
    [payBank, setPayBank] = useState("");
  if (isClient || !hasPermission("finance")) return <Navigate to="/dashboard" />;
  const allCards = data.cards.data || [];
  const cards = allCards.filter((c) => showInactive || c.active || c.id === selectedId);
  const selected = allCards.find((c) => c.id === selectedId) || cards[0];
  const purchases = data.purchases.data || [];
  const statement = (accounts.data || []).filter(
    (a) => a.credit_card_id === selected?.id && a.invoice_month === `${month}-01` && !a.deleted_at,
  );
  const total = statement.reduce((s, a) => s + Number(a.amount_cents), 0),
    paid = statement.filter((a) => a.settled_on).reduce((s, a) => s + Number(a.amount_cents), 0),
    pending = total - paid;
  const due =
    statement[0]?.due_on || (selected ? cardDate(month, selected.due_day) : `${month}-01`);
  const closing = selected
    ? cardDate(
        shiftCardMonth(month, selected.due_day <= selected.closing_day ? -1 : 0),
        selected.closing_day,
      )
    : "";
  const committed = (accounts.data || [])
    .filter((a) => a.credit_card_id === selected?.id && !a.deleted_at && !a.settled_on)
    .reduce((s, a) => s + Number(a.amount_cents), 0);
  const visible = statement.filter(
    (a) =>
      !query ||
      `${a.description} ${a.counterparty} ${a.category}`
        .toLocaleLowerCase("pt-BR")
        .includes(query.toLocaleLowerCase("pt-BR")),
  );
  const removed = purchases.filter((p) => p.card_id === selected?.id && p.deleted_at);
  const loading = data.cards.isLoading || data.purchases.isLoading || accounts.isLoading;
  const error =
    data.cards.error || data.purchases.error || accounts.error || banks.error || centers.error;
  const busy =
    data.saveCard.isPending ||
    data.savePurchase.isPending ||
    recurring.saveInline.isPending ||
    data.deletePurchase.isPending ||
    data.settle.isPending;
  const fail = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
  const newCard = () =>
    setCardDraft({
      name: "",
      bank_label: "Itaú",
      theme: "itau",
      last_four: "",
      closing_day: 25,
      due_day: 5,
      limit: "",
      bank: "",
    });
  const editCard = (c: CreditCard) =>
    setCardDraft({
      old: c,
      name: c.name,
      bank_label: c.bank_label,
      theme: c.theme,
      last_four: c.last_four,
      closing_day: c.closing_day,
      due_day: c.due_day,
      limit: c.limit_cents ? String(Number(c.limit_cents) / 100).replace(".", ",") : "",
      bank: c.bank_account_id || "",
    });
  const newPurchase = () => {
    if (!selected) return;
    setPurchaseDraft({
      description: "",
      merchant: "",
      category: "",
      value: "",
      date: today,
      installments: 1,
      firstMonth: firstCardInvoice(today, selected.closing_day, selected.due_day),
      center: "",
      notes: "",
    });
  };
  const editPurchase = (p: CardPurchase, repeatOnly = false) => {
    if (p.recurrence_id && !recurring.data?.some((r) => r.id === p.recurrence_id)) {
      fail("Aguarde o carregamento da repetição e tente novamente.");
      return;
    }
    setPurchaseDraft({
      repeat: {
        ...inlineRecurrence(recurring.data?.find((r) => r.id === p.recurrence_id)),
        ...(repeatOnly ? { enabled: true, scope: "future" as const } : {}),
      },
      old: p,
      description: p.description,
      merchant: p.merchant,
      category: p.category,
      value: (Number(p.amount_cents) / 100).toFixed(2).replace(".", ","),
      date: p.purchased_on,
      installments: p.installments,
      firstMonth: p.first_invoice_month.slice(0, 7),
      center: p.cost_center_id || "",
      notes: p.notes,
    });
  };
  const saveCard = async (e: FormEvent) => {
    e.preventDefault();
    if (!cardDraft) return;
    try {
      await data.saveCard.mutateAsync({
        old: cardDraft.old,
        values: {
          name: cardDraft.name.trim(),
          bank_label: cardDraft.bank_label.trim(),
          theme: cardDraft.theme,
          last_four: cardDraft.last_four,
          closing_day: cardDraft.closing_day,
          due_day: cardDraft.due_day,
          limit_cents: cardDraft.limit.trim() ? parseFinanceMoney(cardDraft.limit) : null,
          bank_account_id: cardDraft.bank || null,
        },
      });
      setCardDraft(null);
      toast.success("Cartão salvo.");
    } catch (e) {
      fail(e);
    }
  };
  const savePurchase = async (e: FormEvent) => {
    e.preventDefault();
    if (!purchaseDraft || !selected) return;
    try {
      splitCardInstallments(parseFinanceMoney(purchaseDraft.value), purchaseDraft.installments);
      await recurring.saveInline.mutateAsync({
        card: true,
        repeat: purchaseDraft.repeat || inlineRecurrence(),
        old: purchaseDraft.old,
        values: {
          card_id: selected.id,
          description: purchaseDraft.description.trim(),
          merchant: purchaseDraft.merchant.trim(),
          category: purchaseDraft.category.trim(),
          amount_cents: parseFinanceMoney(purchaseDraft.value),
          purchased_on: purchaseDraft.date,
          installments: purchaseDraft.installments,
          first_invoice_month: `${purchaseDraft.firstMonth}-01`,
          cost_center_id: purchaseDraft.center || null,
          notes: purchaseDraft.notes,
        },
      });
      setPurchaseDraft(null);
      toast.success("Despesa salva e faturas atualizadas no Financeiro.");
    } catch (e) {
      fail(e);
    }
  };
  const execute = async () => {
    if (!confirm || !selected) return;
    try {
      if (confirm.purchase) {
        await data.deletePurchase.mutateAsync({
          purchase: confirm.purchase,
          deleted: confirm.action === "delete",
        });
      } else {
        await data.settle.mutateAsync({
          cardId: selected.id,
          month,
          date: confirm.action === "pay" ? payDate : null,
          bank: confirm.action === "pay" ? payBank : null,
          total: confirm.total!,
        });
      }
      setConfirm(null);
      toast.success("Fatura e Financeiro atualizados.");
    } catch (e) {
      fail(e);
    }
  };
  const exportCSV = () => {
    const header = [
      "Compra",
      "Estabelecimento",
      "Data da compra",
      "Parcela",
      "Centro de custo",
      "Valor (R$)",
      "Vencimento",
      "Baixa",
    ];
    const rows = statement.map((a) => {
      const p = purchases.find((p) => p.id === a.card_purchase_id);
      return [
        p?.description || a.description,
        a.counterparty,
        p?.purchased_on || "",
        `${a.installment_number}/${p?.installments || 1}`,
        centers.data?.find((c) => c.id === a.cost_center_id)?.name || "Sem centro de custo",
        (Number(a.amount_cents) / 100).toFixed(2).replace(".", ","),
        a.due_on,
        a.settled_on || "Em aberto",
      ];
    });
    const content = [header, ...rows]
      .map((row) => row.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(";"))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `fatura-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">Financeiro</p>
          <h1 className="text-3xl font-bold">Cartões de crédito</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Compras detalhadas aqui. O total de cada fatura aparece uma única vez em Contas a pagar.
          </p>
        </div>
        <Button onClick={newCard}>
          <Plus className="mr-2 h-4 w-4" />
          Cadastrar cartão
        </Button>
      </header>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive p-3 text-sm text-destructive"
        >
          Falha ao carregar os dados. Confira antes de continuar: {error.message}
        </div>
      )}
      <div className="flex justify-end">
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Mostrar cartões desativados
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => {
          const bank = CARD_BANKS.find((b) => b.theme === c.theme) || CARD_BANKS.at(-1)!;
          const currentAmount = (accounts.data || [])
            .filter(
              (a) =>
                a.credit_card_id === c.id && a.invoice_month === `${month}-01` && !a.deleted_at,
            )
            .reduce((s, a) => s + Number(a.amount_cents), 0);
          return (
            <div
              key={c.id}
              className={`overflow-hidden rounded-2xl border-2 bg-card ${selected?.id === c.id ? "border-primary shadow-md" : "border-transparent shadow-sm"}`}
            >
              <button
                type="button"
                className="relative w-full overflow-hidden p-5 text-left text-white"
                style={{ background: `linear-gradient(120deg,${bank.color},#111827)` }}
                onClick={() => {
                  setSelectedId(c.id);
                  setDeleted(false);
                }}
                aria-pressed={selected?.id === c.id}
              >
                <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10" />
                <div className="relative flex justify-between">
                  <span className="text-xl font-bold tracking-tight">
                    {c.theme === "other" ? c.bank_label || "Cartão" : bank.mark}
                  </span>
                  <CardIcon className="h-6 w-6 opacity-80" />
                </div>
                <p className="relative mt-5 text-lg font-semibold">{c.name}</p>
                <p className="mt-1 text-sm tracking-widest opacity-80">
                  •••• {c.last_four || "••••"}
                </p>
                <div className="relative mt-5 flex gap-6 text-xs">
                  <span>
                    FECHAMENTO <b className="block text-sm">Dia {c.closing_day}</b>
                  </span>
                  <span>
                    VENCIMENTO <b className="block text-sm">Dia {c.due_day}</b>
                  </span>
                  {!c.active && <span className="rounded bg-white/20 p-1">Desativado</span>}
                </div>
              </button>
              <div className="flex items-center justify-between gap-2 p-3">
                <span className="text-sm">
                  Fatura do mês{" "}
                  <b className="block">{loading ? "Carregando…" : cardMoney(currentAmount)}</b>
                </span>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => editCard(c)}>
                    <Pencil className="mr-1 h-3 w-3" />
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        await data.saveCard.mutateAsync({ old: c, values: { active: !c.active } });
                      } catch (e) {
                        fail(e);
                      }
                    }}
                  >
                    {c.active ? "Desativar" : "Reativar"}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {!cards.length && (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <CardIcon className="mx-auto mb-3 h-9 w-9 text-primary" />
          <h2 className="font-semibold">
            {loading ? "Carregando cartões…" : "Cadastre o primeiro cartão da empresa"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Escolha o banco e os dias de fechamento e vencimento. Não informe número completo, senha
            ou código de segurança.
          </p>
        </div>
      )}
      {selected && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border bg-card p-4">
            <div>
              <Label htmlFor="invoice-month">Fatura de {selected.name} · mês de vencimento</Label>
              <div className="mt-1 flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Fatura anterior"
                  onClick={() => setMonth(shiftCardMonth(month, -1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Input
                  id="invoice-month"
                  className="w-44"
                  type="month"
                  value={month}
                  onChange={(e) => {
                    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)) setMonth(e.target.value);
                  }}
                />
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Próxima fatura"
                  onClick={() => setMonth(shiftCardMonth(month, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <CardInvoiceImport
                card={selected}
                month={month}
                purchases={purchases}
                statementTotal={total}
              />
              <Button variant="outline" onClick={exportCSV} disabled={!statement.length || loading}>
                <Download className="mr-2 h-4 w-4" />
                Exportar fatura
              </Button>
              <Button onClick={newPurchase} disabled={!selected.active || loading || !!error}>
                <Plus className="mr-2 h-4 w-4" />
                Lançar despesa
              </Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Total da fatura", total],
              ["Pago", paid],
              ["Em aberto", pending],
              ["Comprometido em todas as faturas", committed],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border bg-card p-4">
                <p className="text-sm text-muted-foreground">{label}</p>
                <strong className="mt-1 block text-2xl">
                  {error ? "Indisponível" : loading ? "Carregando…" : cardMoney(Number(value))}
                </strong>
              </div>
            ))}
          </div>
          <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-primary/5 p-4">
            <div>
              <p className="font-semibold">
                {total === 0
                  ? "Sem despesas nesta fatura"
                  : pending === 0
                    ? "Fatura paga"
                    : paid > 0
                      ? "Fatura parcialmente paga"
                      : due < today
                        ? "Fatura vencida"
                        : closing <= today
                          ? "Fatura fechada"
                          : "Fatura aberta"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Fechamento: {dateLabel(closing)} · Vencimento: {dateLabel(due)}
              </p>
              {selected.limit_cents && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Limite informado: {cardMoney(Number(selected.limit_cents))} · Disponível estimado:{" "}
                  {cardMoney(Number(selected.limit_cents) - committed)}. Depende de todas as compras
                  cadastradas.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {paid > 0 && (
                <Button
                  variant="outline"
                  disabled={busy || !!error}
                  onClick={() => setConfirm({ action: "reopen", total })}
                >
                  <RotateCcw className="mr-1 h-4 w-4" />
                  Desfazer baixa da fatura
                </Button>
              )}
              {pending > 0 && (
                <Button
                  disabled={busy || !!error}
                  onClick={() => {
                    setPayBank(selected.bank_account_id || "");
                    setPayDate(today);
                    setConfirm({ action: "pay", total });
                  }}
                >
                  Registrar pagamento da fatura
                </Button>
              )}
            </div>
          </section>
          <section className="space-y-3 rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Detalhamento da fatura</h2>
              <div className="flex gap-2">
                <Input
                  aria-label="Buscar despesa do cartão"
                  placeholder="Compra, estabelecimento ou categoria"
                  className="max-w-xs"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <Button
                  variant={deleted ? "default" : "outline"}
                  onClick={() => setDeleted(!deleted)}
                >
                  {deleted ? "Voltar à fatura" : "Excluídas"}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              As parcelas compõem o total da fatura no Financeiro e o relatório por centro de custo.
              Não cadastre o pagamento da fatura novamente como despesa manual.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b">
                    {[
                      "Compra / estabelecimento",
                      "Data da compra",
                      "Parcela",
                      "Centro de custo",
                      "Valor",
                      "Situação",
                      "Ações",
                    ].map((t) => (
                      <th className="whitespace-nowrap p-3 font-medium" key={t}>
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deleted
                    ? removed.map((p) => (
                        <tr key={p.id} className="border-b">
                          <td className="p-3">
                            <b>{p.description}</b>
                            <p className="text-xs text-muted-foreground">{p.merchant}</p>
                          </td>
                          <td>{dateLabel(p.purchased_on)}</td>
                          <td>{p.installments} parcela(s)</td>
                          <td>
                            {centers.data?.find((c) => c.id === p.cost_center_id)?.name ||
                              "Sem centro"}
                          </td>
                          <td>{cardMoney(Number(p.amount_cents))}</td>
                          <td>Excluída</td>
                          <td>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => setConfirm({ action: "restore", purchase: p })}
                            >
                              Restaurar
                            </Button>
                          </td>
                        </tr>
                      ))
                    : visible.map((a) => {
                        const p = purchases.find((p) => p.id === a.card_purchase_id);
                        const locked = (accounts.data || []).some(
                          (item) => item.card_purchase_id === p?.id && item.settled_on,
                        );
                        return (
                          <tr key={a.id} className="border-b last:border-0">
                            <td className="p-3">
                              <b className="block">{p?.description || a.description}</b>
                              {p?.recurrence_id && (
                                <span className="mt-1 inline-flex rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs text-violet-800">
                                  Recorrente{p.purchased_on > today ? " · prevista" : ""}
                                </span>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {a.counterparty || "Estabelecimento não informado"}
                                {a.category ? ` · ${a.category}` : ""}
                              </p>
                              {p?.notes && (
                                <p className="mt-1 max-w-sm whitespace-pre-wrap text-xs text-muted-foreground">
                                  {p.notes}
                                </p>
                              )}
                            </td>
                            <td className="whitespace-nowrap p-3">
                              {p ? dateLabel(p.purchased_on) : "—"}
                            </td>
                            <td className="p-3">
                              {a.installment_number}/{p?.installments || 1}
                              <p className="whitespace-nowrap text-xs text-muted-foreground">
                                {p ? `Compra total: ${cardMoney(Number(p.amount_cents))}` : ""}
                              </p>
                            </td>
                            <td className="p-3">
                              {a.cost_center_id ? (
                                <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-900">
                                  {centers.data?.find((c) => c.id === a.cost_center_id)?.name ||
                                    "Carregando…"}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  Sem centro de custo
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap p-3 font-semibold">
                              {cardMoney(Number(a.amount_cents))}
                            </td>
                            <td className="p-3">
                              {a.settled_on ? (
                                <>
                                  <span className="text-primary">Pago</span>
                                  <p className="text-xs">{dateLabel(a.settled_on)}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {banks.data?.find((b) => b.id === a.bank_account_id)?.name ||
                                      "Banco não informado"}
                                  </p>
                                </>
                              ) : (
                                <span className={due < today ? "text-destructive" : ""}>
                                  Em aberto
                                </span>
                              )}
                            </td>
                            <td className="p-3">
                              <div className="flex gap-1">
                                {p && p.installments === 1 && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    aria-label={`Repetição de ${p.description}`}
                                    title={
                                      p.recurrence_id ? "Editar repetição" : "Tornar recorrente"
                                    }
                                    disabled={
                                      busy ||
                                      recurring.isLoading ||
                                      !!recurring.error ||
                                      (!selected.active && !p.recurrence_id)
                                    }
                                    onClick={() => editPurchase(p, true)}
                                  >
                                    <Repeat2 className="h-4 w-4 text-primary" />
                                  </Button>
                                )}
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  aria-label={`Editar ${p?.description}`}
                                  disabled={!p || locked || busy}
                                  title={
                                    locked
                                      ? "Desfaça a baixa da fatura antes de editar"
                                      : "Editar a compra e suas parcelas"
                                  }
                                  onClick={() => p && editPurchase(p)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  aria-label={`Excluir ${p?.description}`}
                                  disabled={!p || locked || busy}
                                  title={
                                    locked
                                      ? "Desfaça a baixa da fatura antes de excluir"
                                      : "Excluir a compra e todas as parcelas"
                                  }
                                  onClick={() => p && setConfirm({ action: "delete", purchase: p })}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  {!(deleted ? removed.length : visible.length) && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">
                        {loading
                          ? "Carregando…"
                          : deleted
                            ? "Nenhuma despesa excluída."
                            : "Nenhuma despesa nesta fatura."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
          <Link
            to="/contas-a-receber"
            search={{ view: "payable" }}
            className="inline-block text-sm text-primary underline"
          >
            Conferir faturas no Contas a pagar
          </Link>
        </>
      )}
      <Dialog
        open={!!cardDraft}
        onOpenChange={(open) => {
          if (!open && !busy) setCardDraft(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogTitle>{cardDraft?.old ? "Editar" : "Cadastrar"} cartão</DialogTitle>
          <DialogDescription>
            Use o nome, o banco e, se desejar, somente os quatro últimos dígitos. A identidade
            visual vem do banco escolhido.
          </DialogDescription>
          {cardDraft && (
            <form className="space-y-4" onSubmit={saveCard}>
              <Field label="Nome do cartão">
                <Input
                  required
                  maxLength={120}
                  placeholder="Ex.: Itaú empresarial"
                  value={cardDraft.name}
                  onChange={(e) => setCardDraft({ ...cardDraft, name: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Banco / visual">
                  <select
                    className={inputSelect}
                    value={cardDraft.theme}
                    onChange={(e) => {
                      const b = CARD_BANKS.find((b) => b.theme === e.target.value)!;
                      setCardDraft({ ...cardDraft, theme: b.theme, bank_label: b.name });
                    }}
                  >
                    {CARD_BANKS.map((b) => (
                      <option key={b.theme} value={b.theme}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Final do cartão (opcional)">
                  <Input
                    inputMode="numeric"
                    pattern="[0-9]{4}|^$"
                    maxLength={4}
                    placeholder="1234"
                    value={cardDraft.last_four}
                    onChange={(e) =>
                      setCardDraft({ ...cardDraft, last_four: e.target.value.replace(/\D/g, "") })
                    }
                  />
                </Field>
              </div>
              {cardDraft.theme === "other" && (
                <Field label="Nome do banco">
                  <Input
                    maxLength={120}
                    value={cardDraft.bank_label}
                    onChange={(e) => setCardDraft({ ...cardDraft, bank_label: e.target.value })}
                  />
                </Field>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Dia do fechamento">
                  <Input
                    type="number"
                    required
                    min={1}
                    max={31}
                    value={cardDraft.closing_day}
                    onChange={(e) =>
                      setCardDraft({ ...cardDraft, closing_day: Number(e.target.value) })
                    }
                  />
                </Field>
                <Field label="Dia do vencimento">
                  <Input
                    type="number"
                    required
                    min={1}
                    max={31}
                    value={cardDraft.due_day}
                    onChange={(e) =>
                      setCardDraft({ ...cardDraft, due_day: Number(e.target.value) })
                    }
                  />
                </Field>
              </div>
              <Field label="Limite (R$) · opcional">
                <Input
                  inputMode="decimal"
                  value={cardDraft.limit}
                  placeholder="Ex.: 10.000,00"
                  onChange={(e) => setCardDraft({ ...cardDraft, limit: e.target.value })}
                />
              </Field>
              <Field label="Conta padrão para pagar a fatura">
                <select
                  className={inputSelect}
                  value={cardDraft.bank}
                  onChange={(e) => setCardDraft({ ...cardDraft, bank: e.target.value })}
                >
                  <option value="">Definir no pagamento</option>
                  {banks.data
                    ?.filter((b) => b.active || b.id === cardDraft.bank)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                </select>
              </Field>
              <p className="text-xs text-muted-foreground">
                Compras feitas após o fechamento passam para a próxima fatura. Se fechamento e
                vencimento forem no mesmo dia, o vencimento será no mês seguinte. Em meses curtos,
                usa-se o último dia. Alterar datas não muda parcelas já lançadas.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCardDraft(null)}
                  disabled={busy}
                >
                  Cancelar
                </Button>
                <Button disabled={busy || !!error}>Salvar cartão</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!purchaseDraft}
        onOpenChange={(open) => {
          if (!open && !busy) setPurchaseDraft(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogTitle>
            {purchaseDraft?.old ? "Editar compra" : "Lançar despesa"} · {selected?.name}
          </DialogTitle>
          <DialogDescription>
            Informe o valor total da compra. O parcelamento é sem juros; inclua juros ou tarifas
            como despesas separadas. Confira o mês da primeira fatura.
          </DialogDescription>
          {purchaseDraft && selected && (
            <form className="space-y-4" onSubmit={savePurchase}>
              <Field label="Descrição da compra">
                <Input
                  required
                  maxLength={500}
                  autoFocus
                  value={purchaseDraft.description}
                  onChange={(e) =>
                    setPurchaseDraft({ ...purchaseDraft, description: e.target.value })
                  }
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Estabelecimento">
                  <Input
                    maxLength={200}
                    value={purchaseDraft.merchant}
                    onChange={(e) =>
                      setPurchaseDraft({ ...purchaseDraft, merchant: e.target.value })
                    }
                  />
                </Field>
                <Field label="Data da compra">
                  <Input
                    required
                    type="date"
                    max={today}
                    disabled={!!purchaseDraft.old?.recurrence_id}
                    value={purchaseDraft.date}
                    onChange={(e) =>
                      setPurchaseDraft({
                        ...purchaseDraft,
                        date: e.target.value,
                        firstMonth: e.target.value
                          ? firstCardInvoice(e.target.value, selected.closing_day, selected.due_day)
                          : purchaseDraft.firstMonth,
                      })
                    }
                  />
                </Field>
                <Field label="Valor total (R$)">
                  <Input
                    required
                    inputMode="decimal"
                    placeholder="Ex.: 1.500,00"
                    value={purchaseDraft.value}
                    onChange={(e) => setPurchaseDraft({ ...purchaseDraft, value: e.target.value })}
                  />
                </Field>
                <Field label="Número de parcelas">
                  <Input
                    required
                    type="number"
                    disabled={purchaseDraft.repeat?.enabled}
                    min={1}
                    max={60}
                    value={purchaseDraft.installments}
                    onChange={(e) =>
                      setPurchaseDraft({ ...purchaseDraft, installments: Number(e.target.value) })
                    }
                  />
                </Field>
                <Field label="Primeira fatura · mês do vencimento">
                  <Input
                    required
                    type="month"
                    disabled={!!purchaseDraft.old?.recurrence_id}
                    value={purchaseDraft.firstMonth}
                    onChange={(e) =>
                      setPurchaseDraft({ ...purchaseDraft, firstMonth: e.target.value })
                    }
                  />
                </Field>
                <Field label="Centro de custo da despesa">
                  <select
                    className={inputSelect}
                    value={purchaseDraft.center}
                    onChange={(e) => setPurchaseDraft({ ...purchaseDraft, center: e.target.value })}
                  >
                    <option value="">Sem centro de custo</option>
                    {centers.data
                      ?.filter(
                        (c) =>
                          (c.active && compatibleCenter(c, "payable")) ||
                          c.id === purchaseDraft.center,
                      )
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.active ? "" : " (desativado)"}
                        </option>
                      ))}
                  </select>
                </Field>
              </div>
              <Field label="Categoria (opcional)">
                <Input
                  maxLength={200}
                  placeholder="Ex.: combustível, materiais, assinatura"
                  value={purchaseDraft.category}
                  onChange={(e) => setPurchaseDraft({ ...purchaseDraft, category: e.target.value })}
                />
              </Field>
              <Field label="Observações">
                <textarea
                  className="min-h-20 w-full rounded-md border bg-background p-3 text-sm"
                  maxLength={10000}
                  value={purchaseDraft.notes}
                  onChange={(e) => setPurchaseDraft({ ...purchaseDraft, notes: e.target.value })}
                />
              </Field>
              <InlineRecurrenceFields
                card
                value={purchaseDraft.repeat || inlineRecurrence()}
                onChange={(repeat) =>
                  setPurchaseDraft({
                    ...purchaseDraft,
                    repeat,
                    installments: repeat.enabled ? 1 : purchaseDraft.installments,
                  })
                }
                existing={!!purchaseDraft.old?.recurrence_id}
                start={purchaseDraft.date}
                disabled={busy || !!(purchaseDraft.old && purchaseDraft.old.installments > 1)}
              />
              {purchaseDraft.old &&
                !purchaseDraft.old.recurrence_id &&
                accounts.data?.some(
                  (a) => a.card_purchase_id === purchaseDraft.old?.id && a.settled_on,
                ) && (
                  <p className="text-xs text-muted-foreground">
                    Compra já paga: mantenha os dados originais ao ativar a repetição. A baixa desta
                    compra será preservada.
                  </p>
                )}
              <InstallmentPreview draft={purchaseDraft} card={selected} />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setPurchaseDraft(null)}
                >
                  Cancelar
                </Button>
                <Button
                  disabled={
                    busy ||
                    !!error ||
                    banks.isLoading ||
                    centers.isLoading ||
                    recurring.isLoading ||
                    !!recurring.error
                  }
                >
                  Salvar despesa
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirm(null);
        }}
      >
        <DialogContent>
          <DialogTitle>
            {confirm?.action === "pay"
              ? "Registrar pagamento da fatura"
              : confirm?.action === "reopen"
                ? "Desfazer baixa da fatura"
                : confirm?.action === "delete"
                  ? "Excluir compra e parcelas"
                  : "Restaurar compra e parcelas"}
          </DialogTitle>
          <DialogDescription>
            {confirm?.purchase
              ? `${confirm.purchase.description}. A alteração alcança todas as parcelas e atualiza os totais do Financeiro. A exclusão pode ser desfeita.`
              : confirm?.action === "pay"
                ? `Registrar a baixa do saldo em aberto de ${cardMoney(pending)}. Este controle não executa um pagamento bancário.`
                : "As baixas desta fatura serão desfeitas e os valores voltarão ao contas a pagar. Nenhum dinheiro será movimentado."}
          </DialogDescription>
          {confirm?.action === "pay" && (
            <div className="space-y-3">
              <Field label="Data do pagamento">
                <Input
                  type="date"
                  max={today}
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                />
              </Field>
              <Field label="Conta bancária de saída">
                <select
                  className={inputSelect}
                  value={payBank}
                  onChange={(e) => setPayBank(e.target.value)}
                >
                  <option value="">Selecione a conta</option>
                  {banks.data
                    ?.filter((b) => b.active)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                </select>
              </Field>
              <p className="text-xs text-muted-foreground">
                O saldo desta conta será atualizado pelas mesmas parcelas da fatura, sem criar outra
                despesa.
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button
              disabled={busy || (confirm?.action === "pay" && (!payDate || !payBank))}
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
function InstallmentPreview({ draft, card }: { draft: PurchaseDraft; card: CreditCard }) {
  try {
    const parts = splitCardInstallments(parseFinanceMoney(draft.value), draft.installments);
    if (!/^\d{4}-\d{2}$/.test(draft.firstMonth)) return null;
    return (
      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        <p className="font-semibold">Prévia das parcelas</p>
        <p className="mt-1">
          {parts.length}x de {cardMoney(parts[0])}
          {parts.at(-1) !== parts[0] ? ` (última: ${cardMoney(parts.at(-1)!)})` : ""} · Total:{" "}
          {cardMoney(parts.reduce((a, b) => a + b, 0))}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Primeiro vencimento: {dateLabel(cardDate(draft.firstMonth, card.due_day))} · Último:{" "}
          {dateLabel(cardDate(shiftCardMonth(draft.firstMonth, parts.length - 1), card.due_day))}
        </p>
      </div>
    );
  } catch {
    return null;
  }
}
