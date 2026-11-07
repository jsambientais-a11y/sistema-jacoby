import { normalizeAssistantAction } from "@/lib/chatgpt-actions";
import { AssistantActionReview } from "@/components/AssistantActionReview";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { OAuthAuthorizationDetails, OAuthRedirect, OAuthGrant } from "@supabase/supabase-js";
import {
  Bot,
  MessageCircle,
  ArrowUpRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  buildJacobyAssistantLink,
  canManageChatGpt,
  isChatGptCallback,
  parseChatGptDraft,
  normalizeChatGptDraftSearch,
} from "@/lib/chatgpt-connection";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { TaskDialog } from "@/components/TaskDialog";

export const Route = createFileRoute("/_app/integracoes-chatgpt")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { authorization_id?: string; rascunho?: string; acao?: string } => ({
    authorization_id:
      typeof search.authorization_id === "string" &&
      /^[a-zA-Z0-9_-]{1,200}$/.test(search.authorization_id)
        ? search.authorization_id
        : undefined,
    rascunho: normalizeChatGptDraftSearch(search.rascunho),
    acao: normalizeAssistantAction(search.acao),
  }),
  component: ChatGptConnection,
});
type Status = {
  enabled: boolean;
  oauthEnabled: boolean;
  clientsConfigured: boolean;
  clientIds: string[];
  serverUrl: string;
  mode: string;
  pluginId?: string;
};
function ChatGptConnection() {
  const { user, loading, isAdmin, isClient } = useAuth();
  if (loading) return <p className="p-6">Carregando…</p>;
  if (!canManageChatGpt(user?.id, isAdmin, isClient, import.meta.env.DEV))
    return <Navigate to="/dashboard" replace />;
  return <ConnectionDetails />;
}
function ConnectionDetails() {
  const { user } = useAuth();
  const { authorization_id, rascunho, acao } = Route.useSearch();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [showConnection, setShowConnection] = useState(!!authorization_id);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [taskOpen, setTaskOpen] = useState(false);
  const draft = useMemo(() => parseChatGptDraft(rascunho), [rascunho]);
  const status = useQuery({
    queryKey: ["chatgpt-status", user?.id],
    queryFn: async (): Promise<Status> => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Entre novamente para consultar a conexão.");
      const response = await fetch("/api/chatgpt/status", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok)
        throw new Error(
          "Não foi possível verificar o conector. Atualize a página ou tente novamente.",
        );
      return response.json();
    },
    retry: false,
  });
  const grants = useQuery<OAuthGrant[]>({
    queryKey: ["chatgpt-grants", user?.id],
    enabled: status.data?.oauthEnabled === true && status.data.clientsConfigured,
    queryFn: async () => {
      const { data, error } = await supabase.auth.oauth.listGrants();
      if (error) throw new Error("Não foi possível consultar as conexões autorizadas.");
      return (data || []).filter((grant: OAuthGrant) =>
        status.data?.clientIds.includes(grant.client.id),
      );
    },
    retry: false,
  });
  const consent = useQuery<OAuthAuthorizationDetails | OAuthRedirect>({
    queryKey: ["chatgpt-consent", user?.id, authorization_id],
    enabled:
      !!authorization_id &&
      !!status.data?.oauthEnabled &&
      !!status.data.enabled &&
      !!status.data.clientsConfigured,
    queryFn: async (): Promise<OAuthAuthorizationDetails | OAuthRedirect> => {
      const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorization_id!);
      if (error || !data)
        throw new Error("A solicitação expirou ou é inválida. Reinicie a conexão pelo ChatGPT.");
      // Even an already-consented response requires a deliberate return click.
      if (!("authorization_id" in data)) {
        if (!isChatGptCallback(data.redirect_url))
          throw new Error("Retorno inválido. Reinicie pelo ChatGPT.");
        return data;
      }
      if (
        data.user.id !== user?.id ||
        !status.data?.clientIds.includes(data.client.id) ||
        !isChatGptCallback(data.redirect_uri)
      )
        throw new Error("Este aplicativo não é o conector ChatGPT autorizado para a Jacoby.");
      return data;
    },
    retry: false,
  });
  useEffect(() => {
    setTaskOpen(false);
  }, [rascunho]);
  const decide = async (approve: boolean) => {
    if (!authorization_id || !consent.data || !("authorization_id" in consent.data)) return;
    setBusy(true);
    try {
      const result = approve
        ? await supabase.auth.oauth.approveAuthorization(authorization_id, {
            skipBrowserRedirect: true,
          })
        : await supabase.auth.oauth.denyAuthorization(authorization_id, {
            skipBrowserRedirect: true,
          });
      if (result.error || !result.data || !isChatGptCallback(result.data.redirect_url))
        throw new Error("Não foi possível concluir a autorização. Reinicie pelo ChatGPT.");
      window.location.assign(result.data.redirect_url);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (clientId: string) => {
    setBusy(true);
    try {
      const { error } = await supabase.auth.oauth.revokeGrant({ clientId });
      if (error) throw error;
      setConfirmRevoke(null);
      await qc.invalidateQueries({ queryKey: ["chatgpt-grants", user?.id] });
      toast.success("Conexão revogada. O conector não poderá mais consultar seus dados.");
    } catch {
      toast.error("Não foi possível revogar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };
  const ready = status.data?.enabled && status.data.oauthEnabled && status.data.clientsConfigured;
  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <header className="flex items-start gap-3">
        <span className="rounded-xl bg-primary/10 p-3 text-primary">
          <Bot size={24} />
        </span>
        <div>
          <p className="text-sm text-primary">Assistente da Juliana</p>
          <h1 className="text-2xl font-semibold">Pergunte ao assistente de IA</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cruze informações entre as áreas, entenda os fluxos e prepare ações para confirmar aqui.
          </p>
        </div>
      </header>
      {import.meta.env.DEV && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Prévia local. O Reinan também pode conferir esta tela durante o teste. No sistema
          publicado, o acesso é exclusivo da Juliana.
        </p>
      )}
      {authorization_id && (
        <Card className="space-y-4 border-primary/30 p-5">
          <h2 className="font-semibold">Autorizar acesso do ChatGPT</h2>
          {consent.isFetching ? (
            <p className="text-sm">Carregando solicitação…</p>
          ) : consent.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {consent.error.message}
            </p>
          ) : consent.data && "redirect_url" in consent.data ? (
            <>
              <p className="text-sm">
                A autorização desta conexão já existe. Continue para voltar ao ChatGPT.
              </p>
              <Button
                onClick={() => {
                  if (
                    consent.data &&
                    "redirect_url" in consent.data &&
                    isChatGptCallback(consent.data.redirect_url)
                  )
                    window.location.assign(consent.data.redirect_url);
                }}
              >
                Continuar no ChatGPT
              </Button>
            </>
          ) : consent.data ? (
            <>
              <p className="text-sm">
                O aplicativo <strong>{consent.data.client.name}</strong> solicita acesso à Jacoby
                pela conta <strong>{user?.email}</strong>.
              </p>
              <p className="text-sm text-muted-foreground">
                Poderá consultar clientes e BMs, explicar os fluxos e preparar tarefas. Os dados
                retornados pelas consultas serão enviados ao ChatGPT. Os rascunhos só serão salvos
                depois de revisados na Jacoby.
              </p>
              <div className="flex gap-2">
                <Button disabled={busy} onClick={() => void decide(true)}>
                  Autorizar conexão
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => void decide(false)}>
                  Recusar
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Conclua a ativação do servidor para avaliar esta solicitação.
            </p>
          )}
        </Card>
      )}
      <Card className="space-y-4 border-primary/20 p-5 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold">O que você quer fazer no sistema?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Peça uma explicação, consulte um boletim ou prepare uma tarefa.
          </p>
        </div>
        <Textarea
          aria-label="Seu pedido ao assistente"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          maxLength={2000}
          rows={4}
          className="resize-none text-base"
          placeholder="Ex.: Procure o BM 211 e me explique o que está lançado nele."
        />
        <div className="flex flex-wrap gap-2">
          {[
            "Explique o caminho do BM até o recebimento.",
            "Procure o BM 211.",
            "Prepare uma tarefa de conferência para eu revisar.",
          ].map((example) => (
            <Button
              key={example}
              variant="outline"
              size="sm"
              className="h-auto whitespace-normal py-2 text-left"
              onClick={() => setPrompt(example)}
            >
              {example}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={
              !ready ||
              !grants.data?.length ||
              !buildJacobyAssistantLink(status.data?.pluginId, prompt)
            }
            onClick={() => {
              const url = buildJacobyAssistantLink(status.data?.pluginId, prompt);
              if (ready && grants.data?.length && url) window.location.assign(url);
            }}
          >
            <MessageCircle size={17} /> Abrir conversa no ChatGPT <ArrowUpRight size={15} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowConnection((value) => !value)}>
            {showConnection ? "Ocultar conexão" : "Minha conexão"}
          </Button>
        </div>
        {!ready ? (
          <p className="text-sm text-amber-700">
            Falta concluir a primeira conexão para o assistente acessar a Jacoby. Você já pode
            montar seu pedido acima.
          </p>
        ) : !grants.data?.length ? (
          <p className="text-sm text-muted-foreground">
            Conecte sua conta uma vez em Minha conexão para começar.
          </p>
        ) : !status.data?.pluginId ? (
          <p className="text-sm text-muted-foreground">
            A conexão está autorizada. Falta vincular o atalho do assistente ao plugin instalado.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Abre o aplicativo ChatGPT com o conector Jacoby mencionado. Você revisa e envia o pedido
            na conversa. As tarefas preparadas voltam ao formulário da Jacoby para salvar.
          </p>
        )}
      </Card>
      {showConnection && (
        <Card className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Sua conexão</h2>
            <Button
              variant="outline"
              size="sm"
              disabled={status.isFetching}
              onClick={() => {
                void status.refetch().then((result) => {
                  if (result.data?.oauthEnabled && result.data.clientsConfigured)
                    void grants.refetch();
                });
              }}
            >
              <RefreshCw size={14} /> Verificar
            </Button>
          </div>
          {status.isPending ? (
            <p className="flex items-center gap-2 text-sm">
              <Loader2 size={16} className="animate-spin" /> Verificando disponibilidade…
            </p>
          ) : status.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {status.error.message}
            </p>
          ) : (
            <>
              <p className="flex items-center gap-2 text-sm font-medium">
                <span
                  className={`h-2 w-2 rounded-full ${ready ? "bg-green-600" : "bg-amber-500"}`}
                />
                {ready
                  ? grants.isError
                    ? "Não foi possível verificar a conexão"
                    : grants.isPending
                      ? "Consultando autorizações…"
                      : grants.data?.length
                        ? "Conexão autorizada na Jacoby"
                        : "Pronto para conectar"
                  : "Aguardando ativação do conector"}
              </p>
              {!ready && (
                <p className="text-sm text-muted-foreground">
                  {!status.data.oauthEnabled
                    ? "A autorização do ChatGPT ainda precisa ser ativada no servidor da Jacoby."
                    : "A configuração do conector precisa ser concluída antes da conexão."}{" "}
                  Nenhuma conta foi conectada por esta tela.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!ready}
                  onClick={() => {
                    if (ready)
                      window.open("https://chatgpt.com/plugins", "_blank", "noopener,noreferrer");
                  }}
                >
                  <ExternalLink size={16} /> Conectar pelo ChatGPT
                </Button>
                <Button
                  variant="outline"
                  disabled={!ready}
                  onClick={() => {
                    void navigator.clipboard.writeText(status.data.serverUrl).then(
                      () => toast.success("Endereço copiado."),
                      () => toast.error("Não foi possível copiar."),
                    );
                  }}
                >
                  <Copy size={15} /> Copiar endereço do conector
                </Button>
              </div>
              {ready && (
                <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                  <li>
                    No ChatGPT, abra Plugins → Adicionar → Adicionar servidor MCP personalizado.
                  </li>
                  <li>Use o nome Jacoby, cole o endereço copiado e escolha OAuth.</li>
                  <li>Volte à Jacoby quando solicitado e revise a autorização abaixo.</li>
                </ol>
              )}
            </>
          )}
          {status.data?.oauthEnabled && status.data.clientsConfigured && grants.isError && (
            <p role="alert" className="text-sm text-destructive">
              {grants.error.message}
            </p>
          )}
          {grants.data?.map((grant) => (
            <div key={grant.client.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{grant.client.name || "Conector ChatGPT"}</p>
                  <p className="text-xs text-muted-foreground">
                    Autorizado em {new Date(grant.granted_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmRevoke(grant.client.id)}
                >
                  <Unplug size={14} /> Desconectar
                </Button>
              </div>
              {confirmRevoke === grant.client.id && (
                <div className="mt-3 space-y-2 text-sm">
                  <p>
                    Revogar o acesso deste conector à Jacoby? Os registros do sistema serão
                    preservados.
                  </p>
                  <Button
                    disabled={busy}
                    variant="destructive"
                    size="sm"
                    onClick={() => void revoke(grant.client.id)}
                  >
                    Revogar acesso
                  </Button>{" "}
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRevoke(null)}>
                    Cancelar
                  </Button>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
      {acao && <AssistantActionReview key={acao} value={acao} />}
      {rascunho && (
        <Card className="space-y-3 p-5">
          <h2 className="font-semibold">Revisar tarefa preparada</h2>
          {draft ? (
            <>
              <p className="text-sm">{draft.title}</p>
              <p className="text-sm text-muted-foreground">
                Abra o formulário para conferir cliente, prazo e responsável. Nada foi salvo ainda.
              </p>
              <Button onClick={() => setTaskOpen(true)}>Revisar no formulário</Button>
              <TaskDialog open={taskOpen} onOpenChange={setTaskOpen} initialDraft={draft} />
            </>
          ) : (
            <p role="alert" className="text-sm text-destructive">
              Rascunho inválido. Peça ao ChatGPT para preparar novamente.
            </p>
          )}
        </Card>
      )}
      <details className="rounded-xl border bg-card p-4 text-sm">
        <summary className="cursor-pointer font-medium">Como o assistente funciona</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Card className="space-y-2 p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <ShieldCheck size={18} /> Acesso controlado
            </h2>
            <p className="text-sm text-muted-foreground">
              Somente a conta da Juliana pode conectar no sistema publicado. As consultas usam as
              permissões da própria conta. A senha do ChatGPT não é solicitada nem armazenada na
              Jacoby.
            </p>
          </Card>
          <Card className="space-y-2 p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <CheckCircle2 size={18} /> Pela sua assinatura
            </h2>
            <p className="text-sm text-muted-foreground">
              A conversa acontece no ChatGPT, sujeita aos limites do plano dela. Este conector não
              chama a API de IA e não pede chave de API.
            </p>
          </Card>
        </div>
      </details>
    </div>
  );
}
