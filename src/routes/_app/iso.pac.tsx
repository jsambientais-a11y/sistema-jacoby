import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Plus, Pencil, X, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useIsoWorkspace, type IsoNc } from "@/components/iso/IsoWorkspace";
import { isoToday, isPlanOverdue, prepareIsoPlan, type IsoActionPlan } from "@/lib/iso-workflow";

export const Route = createFileRoute("/_app/iso/pac")({ component: Plans });
const box = "rounded-xl border border-[#dce6dc] bg-white p-5 shadow-sm";
const input =
  "mt-1 w-full rounded-lg border border-[#dce6dc] bg-white px-3 py-2 text-sm font-normal";
const statuses = ["Aberto", "Em andamento", "Concluído"] as const;
const blank = (): IsoActionPlan => ({
  id: "",
  ncId: null,
  title: "",
  standard: "SGI",
  clause: "",
  finding: "",
  cause: "",
  action: "",
  responsible: "",
  dueDate: "",
  status: "Aberto",
  closingEvidence: "",
  effectiveness: "",
  closedOn: "",
  createdAt: "",
});
function Plans() {
  const { selected, updateAudit, remote } = useIsoWorkspace();
  const plans = selected.plans || [];
  const ncs = selected.ncs || [];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<IsoActionPlan>(blank);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [norm, setNorm] = useState("all");
  const [view, setView] = useState<"board" | "list">("board");
  const pending = ncs.filter((nc) => !plans.some((plan) => plan.ncId === nc.id));
  const shown = plans.filter(
    (plan) =>
      (status === "all" || (status === "overdue" ? isPlanOverdue(plan) : plan.status === status)) &&
      (norm === "all" || plan.standard === norm) &&
      `${plan.title} ${plan.responsible} ${plan.clause} ${plan.finding}`
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR")),
  );
  const fromNc = (nc: IsoNc) => {
    setDraft({
      ...blank(),
      ncId: nc.id,
      title: nc.title,
      standard: nc.standard,
      clause: nc.clause,
      finding: nc.finding,
      cause: nc.cause,
      action: nc.action,
    });
    setEditing(true);
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    try {
      const plan = prepareIsoPlan(
        {
          ...draft,
          id: draft.id || crypto.randomUUID(),
          createdAt: draft.createdAt || new Date().toISOString(),
        },
        ncs.map((nc) => nc.id),
      );
      if (
        !updateAudit({
          plans: draft.id
            ? plans.map((existing) => (existing.id === draft.id ? plan : existing))
            : [...plans, plan],
        })
      )
        return;
      setEditing(false);
      toast.success(
        remote
          ? "Plano preparado. Aguarde Salvo no servidor."
          : "Plano salvo nesta auditoria local.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o plano.");
    }
  };
  const card = (plan: IsoActionPlan) => (
    <article
      key={plan.id}
      className="space-y-3 rounded-xl border border-[#dce6dc] bg-white p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-[#39814a]">
            {plan.standard} {plan.clause}
            {plan.ncId ? " · NC vinculada" : " · Plano independente"}
          </p>
          <h3 className="mt-1 font-bold">{plan.title}</h3>
        </div>
        <button
          type="button"
          aria-label={`Editar plano ${plan.title}`}
          onClick={() => {
            setDraft({ ...plan });
            setEditing(true);
          }}
          className="rounded p-1 hover:bg-muted"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>
      <p className="whitespace-pre-wrap text-sm text-[#64796a]">
        {plan.action || "Ação corretiva ainda não definida."}
      </p>
      <p className="text-xs">
        Responsável: <b>{plan.responsible || "A definir"}</b>
      </p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={`rounded-full px-2 py-1 ${isPlanOverdue(plan) ? "bg-red-100 text-red-800" : "bg-[#edf5ed] text-[#476a50]"}`}
        >
          {plan.dueDate
            ? `Prazo: ${new Date(`${plan.dueDate}T12:00:00`).toLocaleDateString("pt-BR")}`
            : "Prazo a definir"}
          {isPlanOverdue(plan) ? " · Atrasado" : ""}
        </span>
        {plan.status === "Concluído" && (
          <span className="flex items-center gap-1 text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Concluído
          </span>
        )}
      </div>
      {plan.closingEvidence && (
        <p className="text-xs">
          <b>Evidência de fechamento:</b> {plan.closingEvidence}
        </p>
      )}
    </article>
  );
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-7">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Planos de Ação (PAC)</h1>
          <p className="mt-1 text-sm text-[#6c7d70]">
            Transforme as NCs de {selected.name} em ações com responsável, prazo e evidência de
            fechamento.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDraft(blank());
            setEditing(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-[#2c7b38] px-4 py-2 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          Novo plano de ação
        </button>
      </header>
      <section className={box}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">NCs desta auditoria sem plano de ação</h2>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-900">
            {pending.length} pendente(s)
          </span>
        </div>
        {pending.length ? (
          <div className="mt-3 space-y-2">
            {pending.map((nc) => (
              <div
                key={nc.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"
              >
                <div>
                  <b>{nc.title}</b>
                  <p className="text-xs text-[#6c7d70]">
                    {nc.standard} {nc.clause} · {nc.classification}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-lg border border-[#bdd8bd] px-3 py-2 font-semibold text-[#28713a]"
                  onClick={() => fromNc(nc)}
                >
                  Criar plano para esta NC
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-[#6c7d70]">
            {ncs.length
              ? "Todas as NCs desta auditoria têm plano de ação."
              : "Nenhuma NC registrada nesta auditoria. Você também pode criar um plano independente."}{" "}
            <Link to="/iso/nao-conformidades" className="font-semibold text-[#28713a] underline">
              Ir para NCs
            </Link>
          </p>
        )}
      </section>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Total", plans.length],
          ["Abertos", plans.filter((p) => p.status === "Aberto").length],
          ["Em andamento", plans.filter((p) => p.status === "Em andamento").length],
          ["Concluídos", plans.filter((p) => p.status === "Concluído").length],
          ["Atrasados", plans.filter((p) => isPlanOverdue(p)).length],
        ].map(([name, count]) => (
          <div key={name} className={box}>
            <p className="text-xs text-[#6c7d70]">{name}</p>
            <b className="text-2xl">{count}</b>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="min-w-52 flex-1 text-xs font-semibold">
          Buscar plano
          <input
            className={input}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Título, responsável ou cláusula"
          />
        </label>
        <label className="text-xs font-semibold">
          Norma
          <select className={input} value={norm} onChange={(e) => setNorm(e.target.value)}>
            <option value="all">Todas as normas</option>
            {[...new Set(plans.map((p) => p.standard))].sort().map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold">
          Situação
          <select className={input} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Todos os status</option>
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
            <option value="overdue">Atrasados</option>
          </select>
        </label>
        <div className="flex items-end gap-1">
          {(["board", "list"] as const).map((v) => (
            <button
              type="button"
              key={v}
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`rounded-lg border px-4 py-2 text-sm ${view === v ? "bg-[#e5f0e4] font-bold" : "bg-white"}`}
            >
              {v === "board" ? "Quadro" : "Lista"}
            </button>
          ))}
        </div>
      </div>
      {shown.length ? (
        view === "board" ? (
          <div className="grid gap-4 lg:grid-cols-3">
            {statuses.map((s) => (
              <section
                key={s}
                className="space-y-3 rounded-xl border border-[#dae5da] bg-[#edf3ed] p-3"
              >
                <h2 className="flex justify-between px-1 font-semibold">
                  {s}
                  <span className="rounded-full bg-white px-2 text-sm">
                    {shown.filter((p) => p.status === s).length}
                  </span>
                </h2>
                {shown.filter((p) => p.status === s).map(card)}
              </section>
            ))}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">{shown.map(card)}</div>
        )
      ) : (
        <div className={`${box} py-12 text-center text-sm text-[#6c7d70]`}>
          {plans.length
            ? "Nenhum plano corresponde aos filtros."
            : "Nenhum plano criado ainda. Comece por uma NC ou crie um plano independente."}
        </div>
      )}
      <Link
        to="/iso/relatorio"
        className={`${box} flex flex-wrap items-center justify-between gap-3 hover:border-[#6caa76]`}
      >
        <div>
          <p className="text-xs font-semibold text-[#488257]">PRÓXIMA ETAPA · ENTREGAR</p>
          <h2 className="mt-1 font-bold">Relatório de Auditoria</h2>
          <p className="text-sm text-[#6c7d70]">
            Revise os dados, entrevistas, NCs e planos antes de gerar o PDF.
          </p>
        </div>
        <span className="font-semibold text-[#28713a]">Abrir relatório →</span>
      </Link>
      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-label={draft.id ? "Editar plano de ação" : "Novo plano de ação"}
            onSubmit={save}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
          >
            <div className="mb-4 flex justify-between">
              <div>
                <h2 className="text-xl font-bold">{draft.id ? "Editar" : "Novo"} plano de ação</h2>
                <p className="text-xs text-[#6c7d70]">
                  Salvo somente na auditoria local selecionada.
                </p>
              </div>
              <button type="button" aria-label="Fechar" onClick={() => setEditing(false)}>
                <X />
              </button>
            </div>
            <label className="block text-xs font-semibold">
              NC vinculada (opcional)
              <select
                className={input}
                value={draft.ncId || ""}
                onChange={(e) => {
                  const nc = ncs.find((n) => n.id === e.target.value);
                  if (nc)
                    setDraft({
                      ...draft,
                      ncId: nc.id,
                      title: nc.title,
                      standard: nc.standard,
                      clause: nc.clause,
                      finding: nc.finding,
                      cause: nc.cause,
                      action: nc.action,
                    });
                  else setDraft({ ...draft, ncId: null });
                }}
              >
                <option value="">Plano independente</option>
                {ncs.map((nc) => (
                  <option key={nc.id} value={nc.id}>
                    {nc.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-semibold">
                Norma
                <input
                  className={input}
                  value={draft.standard}
                  onChange={(e) => setDraft({ ...draft, standard: e.target.value })}
                />
              </label>
              <label className="text-xs font-semibold">
                Cláusula
                <input
                  className={input}
                  value={draft.clause}
                  onChange={(e) => setDraft({ ...draft, clause: e.target.value })}
                />
              </label>
              <label className="text-xs font-semibold">
                Status
                <select
                  className={input}
                  value={draft.status}
                  onChange={(e) =>
                    setDraft({ ...draft, status: e.target.value as IsoActionPlan["status"] })
                  }
                >
                  {statuses.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="mt-3 block text-xs font-semibold">
              Título do plano *
              <input
                required
                className={input}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            {(
              [
                ["finding", "Constatação / não conformidade"],
                ["cause", "Causa raiz"],
                ["action", "Ação corretiva"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="mt-3 block text-xs font-semibold">
                {label}
                <textarea
                  className={`${input} min-h-20`}
                  value={draft[key]}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                />
              </label>
            ))}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold">
                Responsável
                <input
                  className={input}
                  value={draft.responsible}
                  onChange={(e) => setDraft({ ...draft, responsible: e.target.value })}
                />
              </label>
              <label className="text-xs font-semibold">
                Prazo
                <input
                  type="date"
                  className={input}
                  value={draft.dueDate}
                  onInput={(e) => {
                    const value = e.currentTarget.value;
                    setDraft((current) => ({ ...current, dueDate: value }));
                  }}
                  onChange={(e) => setDraft((current) => ({ ...current, dueDate: e.target.value }))}
                />
              </label>
            </div>
            <label className="mt-3 block text-xs font-semibold">
              Evidência de fechamento{draft.status === "Concluído" ? " *" : ""}
              <textarea
                required={draft.status === "Concluído"}
                className={`${input} min-h-20`}
                value={draft.closingEvidence}
                onChange={(e) => setDraft({ ...draft, closingEvidence: e.target.value })}
                placeholder="Documento, registro ou referência que demonstra a execução"
              />
            </label>
            <label className="mt-3 block text-xs font-semibold">
              Verificação de eficácia
              <textarea
                className={`${input} min-h-20`}
                value={draft.effectiveness}
                onChange={(e) => setDraft({ ...draft, effectiveness: e.target.value })}
                placeholder="Como e quando a eficácia foi verificada"
              />
            </label>
            <p className="mt-3 flex items-start gap-2 text-xs text-[#6c7d70]">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Concluir o plano não encerra automaticamente a NC. A avaliação do achado continua na
              etapa Registrar.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border px-4 py-2 text-sm"
                onClick={() => setEditing(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#2c7b38] px-4 py-2 text-sm font-semibold text-white"
              >
                Salvar plano
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
