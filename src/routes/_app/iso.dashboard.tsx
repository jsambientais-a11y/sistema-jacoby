import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, ClipboardCheck, FileText, TriangleAlert } from "lucide-react";
import { useIsoWorkspace } from "@/components/iso/IsoWorkspace";
import { isoReportChecks, isPlanOverdue } from "@/lib/iso-workflow";
import { isoChecklist } from "@/components/iso/IsoChecklist";
export const Route = createFileRoute("/_app/iso/dashboard")({ component: Overview });
const box = "rounded-xl border border-[#dce6dc] bg-white p-5 shadow-sm";
function Overview() {
  const { audits, selected } = useIsoWorkspace();
  const checks = isoReportChecks(selected);
  const plans = selected.plans || [];
  const ncs = selected.ncs || [];
  const completed = isoChecklist.filter((item) => selected.statuses[item.id] === "done").length;
  const answered = selected.selectedQuestions.filter(
    (id) => selected.answers?.[id] && selected.answers[id].status !== "pending",
  ).length;
  const pending = ncs.filter((nc) => !plans.some((plan) => plan.ncId === nc.id));
  const links = [
    {
      title: "Preparar auditoria",
      description: `${completed} de ${isoChecklist.length} itens concluídos`,
      to: "/iso",
      icon: ClipboardCheck,
    },
    {
      title: "Registrar evidências",
      description: `${answered} de ${selected.selectedQuestions.length} entrevistas avaliadas`,
      to: "/iso/evidencias",
      icon: FileText,
    },
    {
      title: "Tratar não conformidades",
      description: `${pending.length} NC(s) aguardando plano de ação`,
      to: "/iso/pac",
      icon: TriangleAlert,
    },
    {
      title: "Revisar e entregar",
      description: `${checks.filter((c) => !c.ok).length} ponto(s) para revisar no relatório`,
      to: "/iso/relatorio",
      icon: CheckCircle2,
    },
  ] as const;
  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl space-y-6 px-4 py-7 sm:px-7">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#478156]">
          Visão geral da auditoria
        </p>
        <h1 className="mt-1 text-2xl font-bold [overflow-wrap:anywhere]">{selected.name}</h1>
        <p className="mt-1 text-sm text-[#6c7d70]">
          {selected.organization || "Empresa ainda não informada"} · {selected.type} ·{" "}
          {selected.standards.join(" · ") || "Normas a definir"}
        </p>
      </header>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Auditorias neste ambiente", audits.length],
          ["NCs nesta auditoria", ncs.length],
          ["Planos em aberto", plans.filter((p) => p.status !== "Concluído").length],
          ["Planos atrasados", plans.filter((p) => isPlanOverdue(p)).length],
        ].map(([label, value]) => (
          <div key={label} className={box}>
            <p className="text-xs text-[#6c7d70]">{label}</p>
            <b className="mt-1 block text-3xl">{value}</b>
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {links.map(({ title, description, to, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className={`${box} group flex items-start gap-4 transition hover:border-[#76ac7c]`}
          >
            <div className="shrink-0 rounded-xl bg-[#eaf4e9] p-3 text-[#28753a]">
              <Icon className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-bold">{title}</h2>
              <p className="mt-1 text-sm text-[#6c7d70]">{description}</p>
            </div>
            <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-[#78a381]" />
          </Link>
        ))}
      </div>
      <section className={box}>
        <h2 className="font-bold">Preparação para auditoria</h2>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-[#edf3ec]">
          <div
            className="h-full rounded-full bg-[#3e8b4a]"
            style={{ width: `${Math.round((completed / isoChecklist.length) * 100)}%` }}
          />
        </div>
        <p className="mt-2 text-sm text-[#6c7d70]">
          {completed} de {isoChecklist.length} itens do kit concluídos. O progresso é do checklist e
          não representa aprovação ou certificação.
        </p>
      </section>
      <section className={box}>
        <h2 className="font-bold">Próximas ações</h2>
        <div className="mt-4 space-y-3">
          {pending.length > 0 && (
            <Link
              to="/iso/pac"
              className="block rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"
            >
              Criar plano de ação para {pending.length} NC(s) desta auditoria →
            </Link>
          )}
          {selected.selectedQuestions.length > answered && (
            <Link to="/iso/evidencias" className="block rounded-lg border p-3 text-sm">
              Avaliar {selected.selectedQuestions.length - answered} entrevista(s) pendente(s) →
            </Link>
          )}
          {!selected.selectedQuestions.length && (
            <Link to="/iso/roteiros" className="block rounded-lg border p-3 text-sm">
              Selecionar as perguntas da auditoria →
            </Link>
          )}
          <Link to="/iso/relatorio" className="block rounded-lg border p-3 text-sm">
            Conferir dados, conclusão e pendências do relatório →
          </Link>
        </div>
      </section>
    </div>
  );
}
