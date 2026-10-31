import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCostCenters, useBanks, type CostCenter } from "@/hooks/use-cost-centers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { parseBankBalance } from "@/lib/finance-reports";
import { localFinanceToday } from "@/lib/enterprise-finance";
import { BankBalanceCells } from "@/components/BankBalanceCells";
import { toast } from "sonner";
export const Route = createFileRoute("/_app/centros-de-custo")({ component: CostCentersPage });
const kinds = { income: "Receitas", expense: "Despesas", both: "Receitas e despesas" };
function CostCentersPage() {
  return <FinanceRegistry />;
}
export function FinanceRegistry({ bank = false }: { bank?: boolean }) {
  const { hasPermission, isClient } = useAuth();
  const costCenters = useCostCenters();
  const banks = useBanks();
  const centers = bank ? banks : costCenters;
  const title = bank ? "Bancos e contas" : "Centros de custo";
  const singular = bank ? "conta bancária" : "centro de custo";
  const [search, setSearch] = useState(""),
    [inactive, setInactive] = useState(false);
  const [draft, setDraft] = useState<{
    name: string;
    kind: CostCenter["kind"];
    old?: CostCenter;
    balance?: string;
    reference?: string;
  } | null>(null);
  const fail = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
  if (isClient || !hasPermission("finance")) return <Navigate to="/dashboard" />;
  const rows = (centers.data || []).filter(
    (c) =>
      (inactive || c.active) &&
      c.name.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")),
  );
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    try {
      await centers.save.mutateAsync({
        old: draft.old,
        values: bank
          ? {
              name: draft.name.trim(),
              opening_balance_cents: draft.balance?.trim() ? parseBankBalance(draft.balance) : null,
              opening_on: draft.balance?.trim() ? draft.reference || localFinanceToday() : null,
            }
          : { name: draft.name.trim(), kind: draft.kind },
      });
      setDraft(null);
      toast.success("Cadastro salvo.");
    } catch (e) {
      fail(e);
    }
  };
  return (
    <div className="space-y-5 p-4 md:p-6">
      <Link to="/contas-a-receber" className="text-sm text-primary">
        ← Financeiro
      </Link>
      <div>
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="mt-2 text-muted-foreground">
          {bank
            ? "Cadastre o banco e a identificação da conta para informar onde os valores entraram ou saíram. Não conecta nem movimenta sua conta bancária."
            : "Organize as receitas e despesas da empresa por área, unidade ou atividade."}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Vincule o cadastro às contas e aos recebimentos usando Centro / banco no Financeiro.
          Desativar impede novos vínculos e mantém o histórico.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          aria-label={bank ? "Buscar banco ou conta" : "Buscar centro de custo"}
          placeholder={bank ? "Buscar banco ou conta" : "Buscar centro de custo"}
          className="max-w-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={inactive}
            onChange={(e) => setInactive(e.target.checked)}
          />
          Mostrar desativados
        </label>
        <Button
          onClick={() =>
            setDraft({ name: "", kind: "both", balance: "", reference: localFinanceToday() })
          }
        >
          {bank ? "Nova conta bancária" : "Novo centro de custo"}
        </Button>
      </div>
      {centers.error && (
        <p role="alert" className="text-destructive">
          {centers.error.message}
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="p-4">Nome</th>
              <th>Aplicação</th>
              {bank && <th>Saldo da conta</th>}
              <th>Situação</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="p-4 font-medium">{c.name}</td>
                <td>{bank ? "Conta bancária" : kinds[c.kind]}</td>
                {bank && (
                  <td>
                    <BankBalanceCells bank={c} />
                  </td>
                )}
                <td>{c.active ? "Ativo" : "Desativado"}</td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setDraft({
                          name: c.name,
                          kind: c.kind || "both",
                          old: c,
                          balance:
                            c.opening_balance_cents == null
                              ? ""
                              : (Number(c.opening_balance_cents) / 100)
                                  .toFixed(2)
                                  .replace(".", ","),
                          reference: c.opening_on || localFinanceToday(),
                        })
                      }
                    >
                      Editar
                    </Button>
                    <Button
                      disabled={centers.save.isPending}
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        try {
                          await centers.save.mutateAsync({ old: c, values: { active: !c.active } });
                          toast.success(
                            c.active
                              ? "Cadastro desativado. Histórico preservado."
                              : "Cadastro reativado.",
                          );
                        } catch (e) {
                          fail(e);
                        }
                      }}
                    >
                      {c.active ? "Desativar" : "Reativar"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={bank ? 5 : 4} className="p-8 text-center text-muted-foreground">
                  {centers.isLoading ? "Carregando…" : "Nenhum cadastro encontrado."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Dialog
        open={!!draft}
        onOpenChange={(open) => {
          if (!open) setDraft(null);
        }}
      >
        <DialogContent>
          <DialogTitle>
            {draft?.old ? "Editar" : "Novo"} {singular}
          </DialogTitle>
          <DialogDescription>
            {bank
              ? "Exemplo: Banco do Brasil — Conta da empresa. Não informe senhas ou dados de acesso."
              : "Escolha se o centro será usado para receitas, despesas ou ambos."}
          </DialogDescription>
          {draft && (
            <form onSubmit={save} className="space-y-4">
              <div>
                <Label htmlFor="cc-name">Nome</Label>
                <Input
                  id="cc-name"
                  autoFocus
                  required
                  maxLength={120}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              {bank && (
                <div className="space-y-3 rounded-lg border p-3">
                  <div>
                    <Label htmlFor="bank-balance">Saldo inicial (R$)</Label>
                    <Input
                      id="bank-balance"
                      inputMode="decimal"
                      placeholder="A definir"
                      value={draft.balance || ""}
                      onChange={(e) => setDraft({ ...draft, balance: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="bank-reference">Data de referência</Label>
                    <Input
                      id="bank-reference"
                      type="date"
                      max={localFinanceToday()}
                      required={!!draft.balance?.trim()}
                      value={draft.reference || ""}
                      onChange={(e) => setDraft({ ...draft, reference: e.target.value })}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Informe o saldo no início desse dia. Baixas a partir dessa data serão somadas ou
                    descontadas. Deixe vazio para definir depois; zero significa saldo confirmado em
                    R$ 0,00. Editar a referência recalcula os relatórios.
                  </p>
                </div>
              )}
              {!bank && (
                <div>
                  <Label htmlFor="cc-kind">Aplicação</Label>
                  <select
                    id="cc-kind"
                    className="h-10 w-full rounded-md border bg-background px-3"
                    value={draft.kind}
                    onChange={(e) =>
                      setDraft({ ...draft, kind: e.target.value as CostCenter["kind"] })
                    }
                  >
                    {Object.entries(kinds).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDraft(null)}>
                  Cancelar
                </Button>
                <Button disabled={centers.save.isPending || !draft.name.trim()} type="submit">
                  Salvar
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
