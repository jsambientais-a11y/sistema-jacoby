import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Repeat2, Plus, Pencil, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useFinanceAccounts } from "@/hooks/use-finance-accounts";
import { useFinanceRecurrences } from "@/hooks/use-finance-recurrences";
import { useBanks, useCostCenters, compatibleCenter } from "@/hooks/use-cost-centers";
import {
  RECURRENCE_FREQUENCIES,
  recurrencePreview,
  type FinanceRecurrence,
  type RecurrenceFrequency,
} from "@/lib/finance-recurrence";
import { localFinanceToday, parseFinanceMoney } from "@/lib/enterprise-finance";
import { cardMoney } from "@/lib/credit-cards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
export const Route = createFileRoute("/_app/despesas-recorrentes")({
  component: RecurringExpenses,
});
type Draft = {
  old?: FinanceRecurrence;
  description: string;
  counterparty: string;
  category: string;
  value: string;
  frequency: RecurrenceFrequency;
  start: string;
  end: string;
  center: string;
  bank: string;
  notes: string;
  effective: string;
};
const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm";
const dateLabel = (date: string) => date.split("-").reverse().join("/");
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}
function RecurringExpenses() {
  const { hasPermission, isClient } = useAuth();
  const rules = useFinanceRecurrences();
  const accounts = useFinanceAccounts();
  const banks = useBanks();
  const centers = useCostCenters();
  const today = localFinanceToday();
  const [search, setSearch] = useState(""),
    [showPaused, setShowPaused] = useState(false),
    [draft, setDraft] = useState<Draft | null>(null),
    [confirm, setConfirm] = useState<FinanceRecurrence | null>(null);
  if (isClient || !hasPermission("finance")) return <Navigate to="/dashboard" />;
  const busy = rules.save.isPending || rules.setActive.isPending;
  const loading = rules.isLoading || accounts.isLoading;
  const error = rules.error || accounts.error || banks.error || centers.error;
  const ruleList = (rules.data || []).filter(
    (r) =>
      (showPaused || (r.active && (!r.end_on || r.end_on >= today))) &&
      `${r.description} ${r.counterparty}`
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR")),
  );
  const newRule = () =>
    setDraft({
      description: "",
      counterparty: "",
      category: "",
      value: "",
      frequency: "monthly",
      start: today,
      end: "",
      center: "",
      bank: "",
      notes: "",
      effective: today,
    });
  const edit = (r: FinanceRecurrence) =>
    setDraft({
      old: r,
      description: r.description,
      counterparty: r.counterparty,
      category: r.category,
      value: (Number(r.amount_cents) / 100).toFixed(2).replace(".", ","),
      frequency: r.frequency,
      start: r.start_on,
      end: r.end_on || "",
      center: r.cost_center_id || "",
      bank: r.bank_account_id || "",
      notes: r.notes,
      effective: today,
    });
  const fail = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    try {
      await rules.save.mutateAsync({
        old: draft.old,
        effective: draft.effective,
        values: {
          description: draft.description.trim(),
          counterparty: draft.counterparty.trim(),
          category: draft.category.trim(),
          amount_cents: parseFinanceMoney(draft.value),
          frequency: draft.frequency,
          start_on: draft.start,
          end_on: draft.end || null,
          cost_center_id: draft.center || null,
          bank_account_id: draft.bank || null,
          notes: draft.notes,
        },
      });
      setDraft(null);
      toast.success("Recorrência salva. Contas a pagar e relatórios atualizados.");
    } catch (e) {
      fail(e);
    }
  };
  let preview: string[] = [];
  try {
    if (draft?.start)
      preview = recurrencePreview(draft.start, draft.frequency, draft.end || null, 4);
  } catch {}
  const activeCount = (rules.data || []).filter(
    (r) => r.active && (!r.end_on || r.end_on >= today),
  ).length;
  const pending = (accounts.data || []).filter(
    (a) => a.recurrence_id && !a.deleted_at && !a.settled_on,
  );
  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">Financeiro</p>
          <h1 className="text-3xl font-bold">Despesas recorrentes</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Cadastre uma vez para prever os próximos vencimentos. Aluguel, internet, mensalidades e
            outros compromissos entram em Contas a pagar e nos relatórios.
          </p>
        </div>
        <Button onClick={newRule}>
          <Plus className="mr-2 h-4 w-4" />
          Nova despesa recorrente
        </Button>
      </header>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Recorrências ativas</p>
          <b className="text-2xl">{error ? "Indisponível" : loading ? "…" : activeCount}</b>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Ocorrências em aberto</p>
          <b className="text-2xl">{error ? "Indisponível" : loading ? "…" : pending.length}</b>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Valor em aberto já previsto</p>
          <b className="text-2xl">
            {loading ? "…" : cardMoney(pending.reduce((s, a) => s + Number(a.amount_cents), 0))}
          </b>
        </div>
      </div>
      <div className="rounded-xl border bg-primary/5 p-4 text-sm">
        <p className="font-medium">Previsão automática dos próximos 12 meses</p>
        <p className="mt-1 text-muted-foreground">
          A janela é renovada diariamente pelo sistema e ao abrir o Financeiro. Sem término, a
          recorrência continua ativa. Em meses curtos, o vencimento cai no último dia e volta ao dia
          original no mês seguinte.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Os valores só saem do saldo bancário realizado quando você registra a baixa. Não há
          pagamento bancário automático.
        </p>
      </div>
      {error && (
        <p role="alert" className="rounded border border-destructive p-3 text-sm text-destructive">
          Não foi possível carregar todos os dados: {error.message}
        </p>
      )}
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Input
            className="max-w-sm"
            aria-label="Buscar despesa recorrente"
            placeholder="Descrição ou fornecedor"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={showPaused}
              onChange={(e) => setShowPaused(e.target.checked)}
            />
            Mostrar pausadas e encerradas
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                {[
                  "Despesa / fornecedor",
                  "Frequência / período",
                  "Valor por ocorrência",
                  "Centro / conta",
                  "Próximo vencimento em aberto",
                  "Situação",
                  "Ações",
                ].map((t) => (
                  <th key={t} className="p-3 font-medium">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ruleList.map((r) => {
                const occurrence = (accounts.data || [])
                  .filter((a) => a.recurrence_id === r.id && !a.deleted_at && !a.settled_on)
                  .sort((a, b) => a.due_on.localeCompare(b.due_on))[0];
                const center = centers.data?.find((c) => c.id === r.cost_center_id),
                  bank = banks.data?.find((b) => b.id === r.bank_account_id);
                return (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="p-3">
                      <b className="block">{r.description}</b>
                      <span className="text-xs text-muted-foreground">
                        {r.counterparty || "Fornecedor não informado"}
                      </span>
                    </td>
                    <td className="p-3">
                      {RECURRENCE_FREQUENCIES[r.frequency]}
                      <span className="block whitespace-nowrap text-xs text-muted-foreground">
                        {dateLabel(r.start_on)} → {r.end_on ? dateLabel(r.end_on) : "Sem término"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap p-3 font-semibold">
                      {cardMoney(Number(r.amount_cents))}
                    </td>
                    <td className="p-3">
                      <span className="block">{center?.name || "Sem centro de custo"}</span>
                      <span className="text-xs text-muted-foreground">
                        {bank?.name || "Banco a definir"}
                      </span>
                      {((center && !center.active) || (bank && !bank.active)) && (
                        <p className="max-w-48 text-xs text-amber-700">
                          Cadastro desativado. Atualize o vínculo; novas ocorrências ficarão sem
                          esse centro/conta.
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap p-3">
                      {occurrence ? (
                        <span className={occurrence.due_on < today ? "text-destructive" : ""}>
                          {dateLabel(occurrence.due_on)}
                          {occurrence.due_on < today ? " · Vencida" : ""}
                        </span>
                      ) : r.end_on && r.end_on < today ? (
                        "Sem novas ocorrências"
                      ) : (
                        "Nenhuma na janela atual"
                      )}
                    </td>
                    <td className="p-3">
                      <span
                        className={
                          r.active && (!r.end_on || r.end_on >= today)
                            ? "text-primary"
                            : "text-muted-foreground"
                        }
                      >
                        {!r.active
                          ? "Pausada"
                          : r.end_on && r.end_on < today
                            ? "Encerrada"
                            : "Ativa"}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => edit(r)}>
                          <Pencil className="mr-1 h-3 w-3" />
                          Editar série
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => setConfirm(r)}
                        >
                          {r.active ? (
                            <Pause className="mr-1 h-3 w-3" />
                          ) : (
                            <Play className="mr-1 h-3 w-3" />
                          )}
                          {r.active ? "Pausar" : "Reativar"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!ruleList.length && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    {loading ? "Carregando…" : "Nenhuma despesa recorrente encontrada."}
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
        Ver ocorrências em Contas a pagar
      </Link>
      <Dialog
        open={!!draft}
        onOpenChange={(open) => {
          if (!open && !busy) setDraft(null);
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogTitle>
            {draft?.old ? "Editar série de despesas" : "Nova despesa recorrente"}
          </DialogTitle>
          <DialogDescription>
            {draft?.old
              ? "As próximas ocorrências em aberto serão atualizadas a partir da data escolhida. Pagas e ocorrências ajustadas individualmente são preservadas."
              : "Cada vencimento será uma conta a pagar. Você pode registrar a baixa, ajustar ou excluir uma ocorrência sem interromper a série."}
          </DialogDescription>
          {draft && (
            <form className="space-y-4" onSubmit={save}>
              <Field label="Descrição">
                <Input
                  autoFocus
                  required
                  maxLength={500}
                  placeholder="Ex.: Aluguel do escritório"
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Fornecedor / favorecido">
                  <Input
                    maxLength={500}
                    value={draft.counterparty}
                    onChange={(e) => setDraft({ ...draft, counterparty: e.target.value })}
                  />
                </Field>
                <Field label="Valor por ocorrência (R$)">
                  <Input
                    required
                    inputMode="decimal"
                    placeholder="Ex.: 1.500,00"
                    value={draft.value}
                    onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                  />
                </Field>
                <Field label="Frequência">
                  <select
                    className={selectClass}
                    disabled={!!draft.old}
                    value={draft.frequency}
                    onChange={(e) =>
                      setDraft({ ...draft, frequency: e.target.value as RecurrenceFrequency })
                    }
                  >
                    {Object.entries(RECURRENCE_FREQUENCIES).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Primeiro vencimento">
                  <Input
                    type="date"
                    required
                    disabled={!!draft.old}
                    value={draft.start}
                    onChange={(e) => setDraft({ ...draft, start: e.target.value })}
                  />
                </Field>
                <Field label="Último vencimento (opcional)">
                  <Input
                    type="date"
                    min={draft.start}
                    value={draft.end}
                    onChange={(e) => setDraft({ ...draft, end: e.target.value })}
                  />
                </Field>
                {draft.old ? (
                  <Field label="Alterar próximas a partir de">
                    <Input
                      type="date"
                      min={today}
                      required
                      value={draft.effective}
                      onChange={(e) => setDraft({ ...draft, effective: e.target.value })}
                    />
                  </Field>
                ) : (
                  <div className="self-center text-xs text-muted-foreground">
                    Deixe o término vazio para continuar todos os períodos.
                  </div>
                )}
                <Field label="Centro de custo">
                  <select
                    className={selectClass}
                    value={draft.center}
                    onChange={(e) => setDraft({ ...draft, center: e.target.value })}
                  >
                    <option value="">Sem centro</option>
                    {centers.data
                      ?.filter(
                        (c) =>
                          (c.active && compatibleCenter(c, "payable")) || c.id === draft.center,
                      )
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.active ? "" : " (desativado)"}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Conta bancária prevista">
                  <select
                    className={selectClass}
                    value={draft.bank}
                    onChange={(e) => setDraft({ ...draft, bank: e.target.value })}
                  >
                    <option value="">Definir depois</option>
                    {banks.data
                      ?.filter((b) => b.active || b.id === draft.bank)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                          {b.active ? "" : " (desativada)"}
                        </option>
                      ))}
                  </select>
                </Field>
              </div>
              <Field label="Categoria (opcional)">
                <Input
                  maxLength={200}
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                />
              </Field>
              <Field label="Observações">
                <textarea
                  className="min-h-20 w-full rounded-md border bg-background p-3 text-sm"
                  maxLength={10000}
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                />
              </Field>
              {!draft.old && preview.length > 0 && (
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <p className="font-semibold">Primeiros vencimentos</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {preview.map((date) => (
                      <span
                        key={date}
                        className="rounded-md border bg-background px-2 py-1 text-xs"
                      >
                        {dateLabel(date)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {draft.old && (
                <p className="text-xs text-muted-foreground">
                  Para encerrar, defina o último vencimento. Ocorrências futuras em aberto após o
                  término saem da previsão; pagas e atrasadas anteriores a hoje são preservadas.
                  Para mudar início ou frequência, encerre esta série e cadastre outra.
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setDraft(null)}
                >
                  Cancelar
                </Button>
                <Button disabled={busy || !!error || banks.isLoading || centers.isLoading}>
                  {busy ? "Salvando…" : "Salvar recorrência"}
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
          <DialogTitle>{confirm?.active ? "Pausar" : "Reativar"} recorrência</DialogTitle>
          <DialogDescription>
            {confirm?.description}.{" "}
            {confirm?.active
              ? "As ocorrências de hoje em diante ainda não pagas saem da previsão. Pagas e atrasadas anteriores a hoje permanecem."
              : "As ocorrências retiradas pela pausa voltam à previsão. Exclusões feitas individualmente não são recriadas."}
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (!confirm) return;
                try {
                  await rules.setActive.mutateAsync({ rule: confirm, active: !confirm.active });
                  setConfirm(null);
                  toast.success("Recorrência atualizada.");
                } catch (e) {
                  fail(e);
                }
              }}
            >
              Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
