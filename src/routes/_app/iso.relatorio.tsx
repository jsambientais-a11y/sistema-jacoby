import { IsoAttachments } from "@/components/iso/IsoAttachments";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Download, CheckCircle2, CircleAlert } from "lucide-react";
import { toast } from "sonner";
import { useIsoWorkspace } from "@/components/iso/IsoWorkspace";
import { blankIsoReport, isoReportChecks, type IsoReport } from "@/lib/iso-workflow";
import { createIsoReportPdf } from "@/lib/iso-report-pdf";
import { starter } from "./iso.roteiros";
import { isoChecklist } from "@/components/iso/IsoChecklist";

export const Route = createFileRoute("/_app/iso/relatorio")({ component: Report });
const box = "rounded-xl border border-[#dce6dc] bg-white p-5 shadow-sm";
const field =
  "mt-1 w-full rounded-lg border border-[#dce6dc] bg-white px-3 py-2 text-sm font-normal";
const sections = [
  ["dados", "1. Dados"],
  ["entrevistas", "2. Entrevistas"],
  ["constatacoes", "3. Constatações"],
  ["planos", "4. Planos de ação"],
  ["encerramento", "5. Encerramento"],
] as const;
function Report() {
  const { selected, updateAudit, questions, criteria } = useIsoWorkspace();
  const [section, setSection] = useState<string>("dados");
  const [exporting, setExporting] = useState(false);
  const report = { ...blankIsoReport(), ...selected.report };
  const checks = isoReportChecks(selected);
  const pending = checks.filter((c) => !c.ok);
  const bank = [...starter, ...questions];
  const selectedQuestions = selected.selectedQuestions
    .map((id) => bank.find((q) => q.id === id))
    .filter(Boolean);
  const patch = (key: keyof IsoReport, value: string) =>
    updateAudit({ report: { ...report, [key]: value } });
  const download = async () => {
    setExporting(true);
    try {
      const doc = await createIsoReportPdf(selected, bank, isoChecklist);
      doc.save(
        `relatorio-${selected.name.replace(/[^a-z0-9áéíóúãõç_-]+/gi, "-").slice(0, 80) || "auditoria"}.pdf`,
      );
      toast.success("Relatório gerado com os dados desta auditoria.");
    } catch {
      toast.error("Não foi possível gerar o PDF. Seus dados continuam salvos localmente.");
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-7 sm:px-7">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Relatório de Auditoria</h1>
          <p className="mt-1 text-sm text-[#6c7d70]">
            Revise as informações de {selected.name} e gere o documento final.
          </p>
        </div>
        <button
          type="button"
          disabled={exporting}
          onClick={() => void download()}
          className="inline-flex items-center gap-2 rounded-lg bg-[#2c7b38] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          <Download className="h-4 w-4" />
          {exporting ? "Gerando…" : "Gerar PDF"}
        </button>
      </header>
      <section className={box}>
        <div className="flex flex-wrap justify-between gap-2">
          <h2 className="font-bold">Revisão da auditoria</h2>
          <span
            className={`rounded-full px-3 py-1 text-xs ${pending.length ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}
          >
            {checks.length - pending.length} concluídas · {pending.length} para revisar
          </span>
        </div>
        <p className="mt-1 text-xs text-[#6c7d70]">
          As verificações são orientativas. Se houver pendências, o PDF será identificado como
          rascunho.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {checks.map((check) => (
            <button
              type="button"
              key={check.id}
              onClick={() => setSection(check.section)}
              className="flex items-start gap-2 rounded-lg border p-3 text-left text-xs"
            >
              {check.ok ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <CircleAlert className="h-4 w-4 shrink-0 text-amber-600" />
              )}
              {check.label}
            </button>
          ))}
        </div>
      </section>
      <nav aria-label="Seções do relatório" className="flex flex-wrap gap-2">
        {sections.map(([id, label]) => (
          <button
            type="button"
            key={id}
            aria-pressed={section === id}
            onClick={() => setSection(id)}
            className={`rounded-lg border px-3 py-2 text-sm ${section === id ? "border-[#83b588] bg-[#e6f1e5] font-semibold" : "bg-white"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      {section === "dados" && (
        <section className={box}>
          <h2 className="mb-4 font-bold">Dados da auditoria</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold">
              Empresa auditada
              <input
                className={field}
                value={selected.organization}
                onChange={(e) => updateAudit({ organization: e.target.value })}
              />
            </label>
            <label className="text-xs font-semibold">
              Emitido por
              <input
                className={field}
                value={report.issuer}
                onChange={(e) => patch("issuer", e.target.value)}
              />
            </label>
            {(
              [
                ["unit", "Unidade"],
                ["leadAuditor", "Auditor líder"],
                ["startDate", "Data início"],
                ["endDate", "Data fim"],
                ["team", "Equipe auditora"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-xs font-semibold">
                {label}
                <input
                  type={key.endsWith("Date") ? "date" : "text"}
                  className={field}
                  value={report[key]}
                  onInput={(e) => patch(key, e.currentTarget.value)}
                  onChange={(e) => patch(key, e.target.value)}
                />
              </label>
            ))}
            <label className="text-xs font-semibold">
              Processos auditados
              <input
                className={field}
                value={selected.processes}
                onChange={(e) => updateAudit({ processes: e.target.value })}
              />
            </label>
          </div>
          <fieldset className="mt-4">
            <legend className="text-xs font-semibold">Normas auditadas</legend>
            <div className="mt-2 flex flex-wrap gap-3">
              {[
                ...new Set([
                  "ISO 9001",
                  "ISO 14001",
                  "ISO 45001",
                  "ISO 27001",
                  "ISO 28000",
                  "ISO 31000",
                  "IATF 16949",
                  ...criteria.map((c) => c.name),
                  ...selected.standards,
                ]),
              ].map((norm) => (
                <label key={norm} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.standards.includes(norm)}
                    onChange={(e) =>
                      updateAudit({
                        standards: e.target.checked
                          ? [...selected.standards, norm]
                          : selected.standards.filter((s) => s !== norm),
                      })
                    }
                  />
                  {norm}
                </label>
              ))}
            </div>
          </fieldset>
          {(
            [
              ["scope", "Escopo"],
              ["objective", "Objetivo"],
              ["criteria", "Critérios"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="mt-4 block text-xs font-semibold">
              {label}
              <textarea
                className={`${field} min-h-20`}
                value={selected[key]}
                onChange={(e) => updateAudit({ [key]: e.target.value })}
              />
            </label>
          ))}
          <label className="mt-4 block text-xs font-semibold">
            Metodologia
            <textarea
              className={`${field} min-h-20`}
              value={report.methodology}
              onChange={(e) => patch("methodology", e.target.value)}
            />
          </label>
        </section>
      )}
      {section === "entrevistas" && (
        <section className={box}>
          <div className="flex flex-wrap justify-between gap-2">
            <h2 className="font-bold">Entrevistas e evidências ({selectedQuestions.length})</h2>
            <Link to="/iso/evidencias" className="text-sm font-semibold text-[#28713a] underline">
              Editar na etapa Auditar
            </Link>
          </div>
          {selectedQuestions.length ? (
            <div className="mt-4 space-y-3">
              {selectedQuestions.map((q) => {
                if (!q) return null;
                const answer = selected.answers?.[q.id];
                return (
                  <article key={q.id} className="rounded-lg border p-4">
                    <p className="text-xs text-[#39814a]">
                      {q.process} · {q.standard} {q.clause}
                    </p>
                    <h3 className="mt-1 text-sm font-semibold">{q.question}</h3>
                    <p className="mt-2 text-sm">
                      Resultado:{" "}
                      {
                        {
                          pending: "Pendente",
                          conforme: "Conforme",
                          parcial: "Parcial",
                          nao_conforme: "Não conforme",
                        }[answer?.status || "pending"]
                      }
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">
                      {answer?.observation || "Sem resposta registrada."}
                    </p>
                    <p className="mt-1 text-xs">
                      <b>Evidência:</b> {answer?.evidence || "Não informada"}
                    </p>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 text-sm text-[#6c7d70]">
              Selecione perguntas em Roteiros e registre os resultados na etapa Auditar.
            </p>
          )}
        </section>
      )}
      {section === "constatacoes" && (
        <section className={box}>
          <div className="flex justify-between gap-2">
            <h2 className="font-bold">Constatações ({selected.ncs?.length || 0})</h2>
            <Link
              to="/iso/nao-conformidades"
              className="text-sm font-semibold text-[#28713a] underline"
            >
              Editar NCs
            </Link>
          </div>
          {(selected.ncs || []).map((nc) => (
            <article key={nc.id} className="mt-3 rounded-lg border p-4">
              <p className="text-xs text-[#39814a]">
                {nc.standard} {nc.clause} · {nc.classification} · {nc.status}
              </p>
              <h3 className="mt-1 font-semibold">{nc.title}</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm">{nc.finding}</p>
              <p className="mt-1 text-xs">
                <b>Evidência:</b> {nc.evidence || "Não informada"}
              </p>
            </article>
          ))}
          {!selected.ncs?.length && (
            <p className="mt-4 text-sm text-[#6c7d70]">Nenhuma NC registrada nesta auditoria.</p>
          )}
        </section>
      )}
      {section === "planos" && (
        <section className={box}>
          <div className="flex justify-between gap-2">
            <h2 className="font-bold">Planos de ação ({selected.plans?.length || 0})</h2>
            <Link to="/iso/pac" className="text-sm font-semibold text-[#28713a] underline">
              Editar planos
            </Link>
          </div>
          {(selected.plans || []).map((plan) => (
            <article key={plan.id} className="mt-3 rounded-lg border p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <b>{plan.title}</b>
                <span className="text-xs">{plan.status}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{plan.action || "Ação a definir"}</p>
              <p className="mt-2 text-xs">
                Responsável: {plan.responsible || "A definir"} · Prazo:{" "}
                {plan.dueDate || "A definir"}
              </p>
              {plan.closingEvidence && (
                <p className="mt-2 text-xs">Evidência de fechamento: {plan.closingEvidence}</p>
              )}
            </article>
          ))}
          {!selected.plans?.length && (
            <p className="mt-4 text-sm text-[#6c7d70]">Nenhum plano de ação registrado.</p>
          )}
        </section>
      )}
      {section === "encerramento" && (
        <section className={box}>
          <h2 className="font-bold">Encerramento</h2>
          {(
            [
              ["strengths", "Pontos fortes observados"],
              ["conclusion", "Conclusão do auditor"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="mt-4 block text-xs font-semibold">
              {label}
              <textarea
                className={`${field} min-h-36`}
                value={report[key]}
                onInput={(e) => patch(key, e.currentTarget.value)}
                onChange={(e) => patch(key, e.target.value)}
                placeholder="Registre a avaliação do auditor com base nas evidências desta auditoria"
              />
            </label>
          ))}
          <p className="mt-3 text-xs text-[#6c7d70]">
            A conclusão não é preenchida automaticamente. As evidências e o julgamento do auditor
            sustentam o relatório.
          </p>
        </section>
      )}
      <IsoAttachments ownerId={selected.id} />
      <p className="text-xs text-[#6c7d70]">
        As edições pertencem a esta auditoria. Confira o status de salvamento no topo antes de sair.
        Nenhuma informação é enviada ao sistema de referência.
      </p>
    </div>
  );
}
