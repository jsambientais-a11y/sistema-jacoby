import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useFinanceLedger } from "@/hooks/use-finance-ledger";
import { useBanks, useCostCenters } from "@/hooks/use-cost-centers";
import { localFinanceToday, summarizeFinance } from "@/lib/enterprise-finance";
import { monthBounds, bankMonthlyBalance, costCenterMonthly } from "@/lib/finance-reports";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/_app/relatorios-financeiros")({ component: FinanceReports });
const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v / 100);
function FinanceReports() {
  const { hasPermission, isClient } = useAuth();
  const ledger = useFinanceLedger();
  const banks = useBanks();
  const centers = useCostCenters();
  const today = localFinanceToday();
  const [month, setMonth] = useState(today.slice(0, 7)),
    [bankFilter, setBankFilter] = useState("");
  if (isClient || !hasPermission("finance")) return <Navigate to="/dashboard" />;
  const { start, end } = monthBounds(month);
  const rows = ledger.rows.filter((r) => !bankFilter || r.bankAccountId === bankFilter);
  const monthRows = rows.filter((r) => {
    const d = r.settledOn || r.dueOn;
    return d && d >= start && d <= end;
  });
  const totals = summarizeFinance(monthRows);
  const bankRows = (banks.data || []).filter(
    (b) =>
      (!bankFilter || b.id === bankFilter) &&
      (b.active || b.opening_on || rows.some((r) => r.bankAccountId === b.id)),
  );
  const bankResults = bankRows.map((bank) => ({
    bank,
    balance: bankMonthlyBalance(bank, rows, month, today),
  }));
  const available = bankResults.filter((b) => b.balance.available);
  const projected = available.reduce((s, b) => s + b.balance.projected!, 0);
  const current = available.reduce((s, b) => s + b.balance.current!, 0);
  const missingOpening = bankResults.filter((b) => !b.balance.available).length;
  const firstReference =
    bankRows
      .map((b) => b.opening_on)
      .filter((d): d is string => !!d)
      .sort()[0] || start;
  const unassigned = rows.filter(
    (r) =>
      !r.bankAccountId &&
      ((r.settledOn && r.settledOn >= firstReference && r.settledOn <= end) ||
        (!r.settledOn && r.dueOn && r.dueOn <= end)),
  );
  const undated = rows.filter((r) => !r.settledOn && !r.dueOn);
  const provisional = rows.filter(
    (r) => r.provisional && !r.settledOn && r.dueOn && r.dueOn <= end && end >= today,
  ).length;
  const pendingBefore = rows.filter((r) => !r.settledOn && r.dueOn && r.dueOn < start);
  const incomplete =
    !bankRows.length ||
    !!missingOpening ||
    !!unassigned.length ||
    !!undated.length ||
    !!provisional;
  const centerRows = costCenterMonthly(rows, month).sort((a, b) =>
    (centers.data?.find((c) => c.id === a.id)?.name || "Sem centro de custo").localeCompare(
      centers.data?.find((c) => c.id === b.id)?.name || "Sem centro de custo",
      "pt-BR",
    ),
  );
  const loading = ledger.isLoading || banks.isLoading || centers.isLoading;
  const error = ledger.error || banks.error || centers.error;
  const display = (v: number) => (error ? "Indisponível" : loading ? "Carregando…" : money(v));
  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">Financeiro</p>
          <h1 className="text-3xl font-bold">Relatórios mensais</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Visão da empresa: contas a receber, contas a pagar e recebíveis do Faturamento, sem
            duplicar BMs.
          </p>
        </div>
        <Link to="/bancos" className="text-sm text-primary underline">
          Definir saldos e contas bancárias
        </Link>
      </div>
      <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4">
        <div>
          <Label htmlFor="report-month">Mês do relatório</Label>
          <Input
            id="report-month"
            type="month"
            value={month}
            onChange={(e) => {
              if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)) setMonth(e.target.value);
            }}
          />
        </div>
        <div>
          <Label htmlFor="report-bank">Banco / conta</Label>
          <select
            id="report-bank"
            value={bankFilter}
            onChange={(e) => setBankFilter(e.target.value)}
            className="block h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">Todas as contas</option>
            {(banks.data || []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.active ? "" : " (desativada)"}
              </option>
            ))}
          </select>
        </div>
        <Button variant="outline" onClick={() => setMonth(today.slice(0, 7))}>
          Mês atual
        </Button>
      </div>
      {error && (
        <p role="alert" className="rounded border border-destructive p-3 text-sm text-destructive">
          Falha ao carregar dados. Os valores não estão disponíveis; atualize antes de decidir.
        </p>
      )}
      <section className="rounded-xl border bg-primary/5 p-5">
        <p className="text-sm font-semibold">
          {end < today
            ? "Saldo de encerramento calculado"
            : incomplete
              ? "Quanto deve sobrar · projeção parcial"
              : "Quanto deve sobrar no final do mês"}
        </p>
        <strong
          className={`mt-2 block text-4xl ${projected < 0 ? "text-destructive" : "text-primary"}`}
        >
          {!available.length && !loading && !error
            ? "Defina os saldos iniciais"
            : display(projected)}
        </strong>
        <p className="mt-2 text-sm text-muted-foreground">
          Saldo inicial de cada conta + entradas com baixa − saídas com baixa + recebíveis previstos
          − contas a pagar até {end.split("-").reverse().join("/")}. Contas em aberto de meses
          anteriores entram na projeção para não esconder atrasos.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          O saldo de referência é do início do dia informado. Valores sem banco ou sem previsão não
          entram na projeção das contas. Esta é uma previsão baseada no controle lançado, não uma
          consulta ao extrato.
        </p>
      </section>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Recebido no mês", totals.received],
          ["Pago no mês", totals.paid],
          ["Resultado realizado do mês", totals.realizedNet],
          ["Saldo calculado das contas", current],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <b className="mt-1 block text-2xl">
              {String(label) === "Saldo calculado das contas" &&
              !available.length &&
              !loading &&
              !error
                ? "A definir"
                : display(Number(value))}
            </b>
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["A receber no mês", totals.openIn],
          ["A pagar no mês", totals.openOut],
          ["Resultado previsto do mês", totals.expectedNet],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <b className="text-xl">{display(Number(value))}</b>
          </div>
        ))}
      </div>
      {!loading && !error && incomplete && (
        <section
          aria-label="Pendências da projeção"
          className="space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
          <h2 className="font-semibold">O que falta para fechar a visão</h2>
          {!bankRows.length && <p>Cadastre as contas bancárias e seus saldos iniciais.</p>}
          {missingOpening > 0 && (
            <p>{missingOpening} conta(s) sem saldo inicial válido para este mês.</p>
          )}
          {unassigned.length > 0 && (
            <p>
              {unassigned.length} lançamento(s) sem banco/conta: valores não incluídos no saldo
              projetado. Classifique em Contas a receber ou Contas a pagar → Centro / banco.
            </p>
          )}
          {undated.length > 0 && (
            <p>{undated.length} conta(s) em aberto sem previsão, fora da projeção mensal.</p>
          )}
          {provisional > 0 && (
            <p>
              {provisional} recebível(is) da projeção com valor provisório. Confira o acordo no
              Faturamento.
            </p>
          )}
          <Link to="/contas-a-receber" className="inline-block underline">
            Conferir lançamentos
          </Link>
        </section>
      )}
      {pendingBefore.length > 0 && end >= today && (
        <p className="rounded border p-3 text-sm">
          {pendingBefore.length} conta(s) ainda em aberto com previsão anterior ao mês. Elas entram
          no saldo final projetado; a tabela por centro abaixo considera somente as datas do mês
          selecionado.
        </p>
      )}
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="text-lg font-semibold">Saldo por banco / conta</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-3">Conta</th>
                <th>Saldo no início do mês</th>
                <th>Saldo calculado até o mês</th>
                <th>Saldo final projetado</th>
              </tr>
            </thead>
            <tbody>
              {bankResults.map(({ bank, balance }) => (
                <tr key={bank.id} className="border-b last:border-0">
                  <td className="p-3 font-medium">
                    {bank.name}
                    {!bank.active && " (desativada)"}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {bank.opening_on
                        ? `Referência: ${bank.opening_on.split("-").reverse().join("/")}`
                        : "Sem referência"}
                    </span>
                  </td>
                  <td className="p-3">
                    {balance.opening == null
                      ? "Não definido para o início do mês"
                      : display(balance.opening)}
                  </td>
                  <td className="p-3">
                    {balance.current == null ? "A definir" : display(balance.current)}
                  </td>
                  <td className="p-3 font-semibold">
                    {balance.projected == null ? "A definir" : display(balance.projected)}
                  </td>
                </tr>
              ))}
              {!bankResults.length && (
                <tr>
                  <td colSpan={4} className="p-6 text-muted-foreground">
                    Nenhuma conta cadastrada para exibir.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="text-lg font-semibold">Receitas e despesas por centro de custo</h2>
        <p className="text-xs text-muted-foreground">
          Baixas pela data em que ocorreram; contas abertas pelo vencimento/previsão dentro do mês.
          O resultado não inclui saldo bancário inicial.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                {[
                  "Centro de custo",
                  "Recebido",
                  "Pago",
                  "A receber",
                  "A pagar",
                  "Resultado realizado",
                  "Resultado previsto",
                ].map((t) => (
                  <th key={t} className="whitespace-nowrap p-3">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {centerRows.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="p-3 font-medium">
                    {centers.data?.find((cc) => cc.id === c.id)?.name || "Sem centro de custo"}
                  </td>
                  {[
                    c.received,
                    c.paid,
                    c.pendingIn,
                    c.pendingOut,
                    c.received - c.paid,
                    c.received + c.pendingIn - c.paid - c.pendingOut,
                  ].map((v, i) => (
                    <td className="whitespace-nowrap p-3" key={i}>
                      {display(v)}
                    </td>
                  ))}
                </tr>
              ))}
              {!centerRows.length && (
                <tr>
                  <td colSpan={7} className="p-6 text-muted-foreground">
                    {loading ? "Carregando…" : "Sem lançamentos neste mês."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
