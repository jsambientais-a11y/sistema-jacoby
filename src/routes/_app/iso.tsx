import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { isoChecklistStages } from "@/components/iso/IsoChecklist";
import { CheckCircle2, CircleDashed, Clock3 } from "lucide-react";
import { useIsoWorkspace, type IsoStatus } from "@/components/iso/IsoWorkspace";

export const Route = createFileRoute("/_app/iso")({ component: IsoRoute });

function IsoRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return pathname === "/iso" || pathname === "/iso/" ? <Kit /> : <Outlet />;
}

const stages = isoChecklistStages;
const count = stages.reduce((total, stage) => total + stage.items.length, 0);
const shortcuts: Record<
  string,
  { to: "/iso/roteiros" | "/iso/evidencias" | "/iso/nao-conformidades"; label: string }
> = {
  program: { to: "/iso/roteiros", label: "Ir para Roteiros" },
  "internal-program": { to: "/iso/roteiros", label: "Ir para Roteiros" },
  internal: { to: "/iso/roteiros", label: "Ir para Roteiros" },
  interviews: { to: "/iso/roteiros", label: "Ir para Roteiros" },
  briefing: { to: "/iso/roteiros", label: "Ir para Roteiros" },
  practice: { to: "/iso/roteiros", label: "Ir para Roteiros" },
  "critical-questions": { to: "/iso/roteiros", label: "Ir para Roteiros" },
  legal: { to: "/iso/evidencias", label: "Ir para Evidências" },
  "legal-check": { to: "/iso/evidencias", label: "Ir para Evidências" },
  manual: { to: "/iso/evidencias", label: "Ir para Evidências" },
  risks: { to: "/iso/evidencias", label: "Ir para Evidências" },
  environment: { to: "/iso/evidencias", label: "Ir para Evidências" },
  sso: { to: "/iso/evidencias", label: "Ir para Evidências" },
  training: { to: "/iso/evidencias", label: "Ir para Evidências" },
  documents: { to: "/iso/evidencias", label: "Ir para Evidências" },
  "evidence-folder": { to: "/iso/evidencias", label: "Ir para Evidências" },
  "digital-files": { to: "/iso/evidencias", label: "Ir para Evidências" },
  licenses: { to: "/iso/evidencias", label: "Ir para Evidências" },
  review: { to: "/iso/evidencias", label: "Ir para Evidências" },
  evidence: { to: "/iso/evidencias", label: "Ir para Evidências" },
  "evidence-kit": { to: "/iso/evidencias", label: "Ir para Evidências" },
  "nc-review": { to: "/iso/nao-conformidades", label: "Ir para NCs" },
  "nc-close": { to: "/iso/nao-conformidades", label: "Ir para NCs" },
  record: { to: "/iso/nao-conformidades", label: "Ir para NCs" },
};

function Kit() {
  const { selected, updateAudit } = useIsoWorkspace();
  const statuses = selected.statuses || {};
  const ids = stages.flatMap((stage) => stage.items.map(([id]) => id));
  const done = ids.filter((id) => statuses[id] === "done").length;
  const progress = Math.round((done / count) * 100);
  const setStatus = (id: string, status: IsoStatus) =>
    updateAudit({ statuses: { ...statuses, [id]: status } });
  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-5 px-4 py-7 sm:px-7">
      <div>
        <h1 className="text-2xl font-bold">Kit Pré-Auditoria Externa</h1>
        <p className="mt-1 text-sm text-[#6c7d70]">
          Acompanhe a preparação da auditoria em uma linha do tempo, dos 90 dias anteriores até o
          dia da visita.
        </p>
      </div>
      <div className="rounded-lg border-l-4 border-[#46a45c] bg-[#edf6ef] px-4 py-3 text-sm">
        <b>O que fazer aqui:</b> percorra as tarefas e marque o andamento de cada uma.
      </div>
      <section className="rounded-xl border border-[#dde7dd] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-[#718474]">Auditoria ativa</p>
            <h2 className="mt-1 font-bold">{selected.name}</h2>
            <p className="text-xs text-[#718474]">
              {selected.organization || "Organização não informada"}
              {selected.scheduledFor
                ? ` · ${new Date(`${selected.scheduledFor}T12:00:00`).toLocaleDateString("pt-BR")}`
                : " · Data a definir"}
            </p>
          </div>
          <div className="rounded-lg bg-[#e9f5e9] px-4 py-2 text-right text-[#287a3a]">
            <b className="block text-2xl">{progress}%</b>
            <span className="text-xs">pronta</span>
          </div>
        </div>
        <div className="mt-4 h-2 rounded-full bg-[#e5ebe5]">
          <div className="h-full rounded-full bg-[#349349]" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-[#64786b]">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4 text-green-700" />
            {done} concluídos
          </span>
          <span className="flex items-center gap-1">
            <Clock3 className="h-4 w-4 text-amber-600" />
            {ids.filter((id) => statuses[id] === "in_progress").length} em andamento
          </span>
          <span className="flex items-center gap-1">
            <CircleDashed className="h-4 w-4" />
            {ids.filter((id) => !statuses[id] || statuses[id] === "pending").length} pendentes
          </span>
        </div>
      </section>
      {stages.map((stage) => (
        <section
          key={stage.title}
          className="overflow-hidden rounded-xl border border-[#dde7dd] bg-white shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-[#e6eee6] bg-[#f7faf7] px-5 py-4">
            <h2 className="font-bold">{stage.title}</h2>
            <span className="text-xs text-[#6e806f]">
              {stage.items.filter(([id]) => statuses[id] === "done").length} de {stage.items.length}{" "}
              concluídos
            </span>
          </div>
          <div className="divide-y divide-[#e8eee8]">
            {stage.items.map(([id, title, owner]) => (
              <div
                key={id}
                className="flex min-w-0 flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium [overflow-wrap:anywhere]">{title}</p>
                  <p className="text-xs text-[#839085]">Responsável sugerido: {owner}</p>
                  {shortcuts[id] && (
                    <Link
                      to={shortcuts[id].to}
                      className="mt-1 inline-block text-xs font-semibold text-[#2b783e]"
                    >
                      {shortcuts[id].label} →
                    </Link>
                  )}
                </div>
                <select
                  aria-label={`Status: ${title}`}
                  value={statuses[id] || "pending"}
                  onChange={(e) => setStatus(id, e.target.value as IsoStatus)}
                  className="h-9 rounded-lg border border-[#dbe5da] bg-white px-3 text-xs"
                >
                  <option value="pending">Pendente</option>
                  <option value="in_progress">Em andamento</option>
                  <option value="done">Concluído</option>
                </select>
              </div>
            ))}
          </div>
        </section>
      ))}
      <div className="rounded-xl border border-[#dce7db] bg-white p-5">
        <p className="text-xs font-semibold uppercase text-[#708875]">
          Próximo passo · Etapa 1 de 5
        </p>
        <h2 className="mt-1 font-bold">Plano de Auditoria</h2>
        <p className="my-2 text-sm text-[#6d7d70]">
          Defina critérios, cronograma, auditados e logística.
        </p>
        <Link to="/iso/plano" className="text-sm font-semibold text-[#26773a]">
          Ir para Plano de Auditoria →
        </Link>
      </div>
    </div>
  );
}
