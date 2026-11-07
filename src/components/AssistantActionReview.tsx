import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  assistantActionSchema,
  applyAssistantAction,
  normalizeAssistantAction,
} from "@/lib/chatgpt-actions";
import { canManageChatGpt } from "@/lib/chatgpt-connection";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
const brl = (c: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100);
const priority: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};
export function AssistantActionReview({ value }: { value: string }) {
  const { user, isAdmin, isClient } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ id: string; tela: string } | null>(null);
  const [approved, setApproved] = useState(false);
  const normalized = normalizeAssistantAction(value);
  const action = normalized ? assistantActionSchema.parse(JSON.parse(normalized)) : null;
  const permitted = canManageChatGpt(user?.id, isAdmin, isClient, import.meta.env.DEV);
  const p = action?.pedido;
  const current = useQuery({
    queryKey: ["assistant-action-current", action?.requestId, user?.id],
    enabled: permitted && p?.tipo === "editar_tarefa",
    queryFn: async () => {
      if (p?.tipo !== "editar_tarefa") return null;
      const r = await supabase
        .from("tasks")
        .select("id,title,due_date,priority,updated_at")
        .eq("id", p.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (r.error || !r.data) throw new Error("Tarefa indisponível. Solicite uma nova proposta.");
      return r.data;
    },
  });
  if (!permitted || !action || !p)
    return <p role="alert">Proposta indisponível para este acesso.</p>;
  const expired = action.expiresAt < Date.now();
  const changed =
    p.tipo === "editar_tarefa" && current.data?.updated_at !== action.anterior?.updated_at;
  async function save() {
    if (!user || !approved || !permitted || !action || saved) return;
    setBusy(true);
    try {
      // Recheck the current identity/roles via the UI guard, and enforce RLS and server version on write.
      const result = await applyAssistantAction(supabase, action, user.id);
      setSaved(result);
      setApproved(false);
      void qc.invalidateQueries({
        predicate: (q) => ["tasks", "enterprise-finance-accounts"].includes(String(q.queryKey[0])),
      });
      toast.success("Alteração salva na Jacoby.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="space-y-4 p-5">
      <h2 className="font-semibold">Conferir ação preparada pelo assistente</h2>
      <p className="text-sm text-muted-foreground">
        Confira a proposta antes de salvar. Para pedir outros valores, volte à conversa e prepare
        uma nova proposta.
      </p>
      {p.tipo === "editar_tarefa" ? (
        <>
          <p className="text-sm">
            Tarefa: {current.data?.title || action.anterior?.title} · <code>{p.id}</code>
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Campo</th>
                  <th>Atual</th>
                  <th>Proposto</th>
                </tr>
              </thead>
              <tbody>
                {p.titulo !== undefined && (
                  <tr>
                    <td className="p-2">Título</td>
                    <td>{current.data?.title || action.anterior?.title}</td>
                    <td>{p.titulo}</td>
                  </tr>
                )}
                {p.prazo !== undefined && (
                  <tr>
                    <td className="p-2">Prazo</td>
                    <td>{current.data?.due_date || "Sem prazo"}</td>
                    <td>{p.prazo || "Sem prazo"}</td>
                  </tr>
                )}
                {p.prioridade !== undefined && (
                  <tr>
                    <td className="p-2">Prioridade</td>
                    <td>{priority[current.data?.priority || ""] || "Sem prioridade"}</td>
                    <td>{priority[p.prioridade]}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {current.isLoading && <p>Conferindo a tarefa atual…</p>}
          {(current.error || (!current.isLoading && changed)) && (
            <p role="alert" className="text-sm text-destructive">
              A tarefa mudou ou está indisponível. Solicite uma nova proposta ao assistente.
            </p>
          )}
        </>
      ) : (
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Lançamento</dt>
            <dd>{p.natureza === "payable" ? "Conta a pagar" : "Conta a receber"} · manual</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Descrição</dt>
            <dd>{p.descricao}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Valor</dt>
            <dd className="font-semibold">{brl(p.valor_centavos)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Vencimento</dt>
            <dd>{p.vencimento}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Cliente/fornecedor</dt>
            <dd>{p.favorecido || "Não informado"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Categoria</dt>
            <dd>{p.categoria || "Não informada"}</dd>
          </div>
        </dl>
      )}
      {saved ? (
        <p role="status" className="text-sm text-primary">
          Salvo.{" "}
          <a className="underline" href={saved.tela}>
            Abrir lançamento na Jacoby
          </a>
        </p>
      ) : (
        <>
          {expired ? (
            <p role="alert" className="text-destructive">
              A proposta expirou. Peça uma nova ao assistente.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Válida até {new Date(action.expiresAt).toLocaleTimeString("pt-BR")}. Nenhum dado foi
              alterado.
            </p>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={approved}
              onChange={(e) => setApproved(e.target.checked)}
              disabled={expired || busy}
            />
            Conferi os dados e quero salvar esta alteração.
          </label>
          <Button
            onClick={save}
            disabled={
              !approved ||
              busy ||
              expired ||
              (p.tipo === "editar_tarefa" && (current.isLoading || !!current.error || changed))
            }
          >
            {busy ? "Salvando…" : "Confirmar e salvar na Jacoby"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Este registro não executa pagamento, baixa ou transferência bancária.
          </p>
        </>
      )}
    </Card>
  );
}
