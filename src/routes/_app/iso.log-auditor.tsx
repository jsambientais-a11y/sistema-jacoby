import { isoExperienceSections } from "@/lib/iso-experience";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useIsoWorkspace } from "@/components/iso/IsoWorkspace";
import { createIsoTextPdf } from "@/lib/iso-text-pdf";
import { isoStandards } from "@/components/iso/IsoExtendedCatalog";
export const Route = createFileRoute("/_app/iso/log-auditor")({ component: AuditorLog });
const box = "rounded-xl border border-[#dce6dc] bg-white p-5 shadow-sm";
const field = "mt-1 h-10 w-full rounded-lg border px-3 text-sm";
function AuditorLog() {
  const ws = useIsoWorkspace();
  const [name, setName] = useState(ws.auditorName);
  const [anonymize, setAnonymize] = useState(true);
  const [standard, setStandard] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [activitySearch, setActivitySearch] = useState("");
  const [busy, setBusy] = useState(false);
  const audits = ws.audits.filter(
    (a) =>
      (!standard || a.standards.includes(standard)) &&
      (!from || (a.report?.startDate || a.scheduledFor) >= from) &&
      (!to || (a.report?.endDate || a.scheduledFor) <= to),
  );
  const norms = [...new Set(audits.flatMap((a) => a.standards))];
  const processes = [
    ...new Set(
      audits.flatMap((a) =>
        a.processes
          .split(/[,;\n]/)
          .map((p) => p.trim())
          .filter(Boolean),
      ),
    ),
  ];
  const hours = audits.reduce(
    (sum, a) => sum + (Number.isFinite(Number(a.hours)) ? Number(a.hours) : 0),
    0,
  );
  const activity = ws.activity.filter((entry) =>
    `${entry.action} ${entry.detail} ${ws.audits.find((a) => a.id === entry.auditId)?.name || ""}`
      .toLocaleLowerCase("pt-BR")
      .includes(activitySearch.toLocaleLowerCase("pt-BR")),
  );
  const exportExperience = async () => {
    if (!name.trim()) {
      toast.error("Informe o nome do auditor.");
      return;
    }
    setBusy(true);
    try {
      ws.setAuditorName(name.trim());
      const doc = await createIsoTextPdf("Declaração de experiência em auditorias", [
        { title: "Auditor", text: name.trim() },
        {
          title: "Resumo dos registros",
          text: `${audits.length} auditoria(s) · ${hours} hora(s) informada(s) · ${norms.join(", ") || "Normas não informadas"}`,
        },
        ...isoExperienceSections(audits, anonymize),
        {
          title: "Origem das informações",
          text: "Declaração baseada nos registros preenchidos pelo auditor. A comprovação das atividades e horas depende dos respectivos documentos de execução.",
        },
      ]);
      doc.save("jacoby-declaracao-experiencia.pdf");
      ws.logAction(
        "Declaração de experiência gerada",
        `${audits.length} auditoria(s); organizações ${anonymize ? "anonimizadas" : "identificadas"}`,
      );
    } catch {
      toast.error("Não foi possível gerar a declaração.");
    } finally {
      setBusy(false);
    }
  };
  const exportLog = async () => {
    const doc = await createIsoTextPdf(
      "Histórico de atividades ISO",
      activity.map((entry) => ({
        title: `${new Date(entry.at).toLocaleString("pt-BR")} · ${entry.action}`,
        text: `${ws.audits.find((a) => a.id === entry.auditId)?.name || "Biblioteca / sistema"}\n${entry.detail}`,
      })),
    );
    doc.save("jacoby-iso-historico.pdf");
  };
  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-7 sm:px-7">
      <header>
        <h1 className="text-2xl font-bold">Log do Auditor</h1>
        <p className="mt-1 text-sm text-[#6c7d70]">
          Experiência registrada em auditorias e histórico de atividades deste ambiente.
        </p>
      </header>
      <section className={`${box} grid gap-3 sm:grid-cols-3`}>
        <label className="text-xs font-semibold">
          Norma
          <select className={field} value={standard} onChange={(e) => setStandard(e.target.value)}>
            <option value="">Todas as normas</option>
            {isoStandards.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold">
          De
          <input
            type="date"
            className={field}
            value={from}
            onInput={(e) => setFrom(e.currentTarget.value)}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-xs font-semibold">
          Até
          <input
            type="date"
            className={field}
            value={to}
            onInput={(e) => setTo(e.currentTarget.value)}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </section>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Auditorias", audits.length],
          ["Horas informadas", hours],
          ["Referenciais", norms.length],
          ["Processos", processes.length],
        ].map(([label, value]) => (
          <div key={label} className={box}>
            <p className="text-xs text-[#6c7d70]">{label}</p>
            <b className="text-3xl">{value}</b>
          </div>
        ))}
      </div>
      <section className={box}>
        <h2 className="font-bold">Declaração de experiência</h2>
        <label className="mt-3 block text-xs font-semibold">
          Nome do auditor
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={anonymize}
            onChange={(e) => setAnonymize(e.target.checked)}
          />
          Anonimizar organizações auditadas
        </label>
        <p className="mt-1 text-xs text-[#6c7d70]">
          Na declaração, os nomes serão substituídos por Organização 1, 2, 3… As horas são as
          informadas no Plano de Auditoria.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void exportExperience()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#2c7b38] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {busy ? "Gerando…" : "Gerar declaração em PDF"}
        </button>
      </section>
      <section className={box}>
        <h2 className="font-bold">Auditorias registradas</h2>
        {audits.map((a) => (
          <div
            key={a.id}
            className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
          >
            <div>
              <b>{a.name}</b>
              <p className="mt-1 text-xs text-[#6c7d70]">
                {a.organization || "Empresa a definir"} · {a.scheduledFor || "Sem data"} ·{" "}
                {a.standards.join(", ") || "Sem normas"}
              </p>
              <p className="mt-1 text-xs">
                {a.auditorRole} · {a.hours || "0"} hora(s) informada(s)
              </p>
            </div>
            <Link
              to="/iso/plano"
              onClick={() => ws.setSelectedId(a.id)}
              className="rounded-lg border px-3 py-2 text-xs"
            >
              Abrir planejamento
            </Link>
          </div>
        ))}
        {!audits.length && (
          <p className="mt-4 text-sm text-[#6c7d70]">Nenhuma auditoria para os filtros.</p>
        )}
      </section>
      <section className={box}>
        <div className="flex flex-wrap justify-between gap-3">
          <h2 className="font-bold">Histórico de atividades</h2>
          <button
            type="button"
            onClick={() =>
              void exportLog().catch(() => toast.error("Falha ao exportar histórico."))
            }
            className="rounded-lg border px-3 py-2 text-xs"
          >
            Exportar histórico PDF
          </button>
        </div>
        <input
          aria-label="Buscar atividade"
          className={field}
          value={activitySearch}
          onChange={(e) => setActivitySearch(e.target.value)}
          placeholder="Buscar por ação, auditoria ou área"
        />
        <div className="mt-3 max-h-[32rem] overflow-auto">
          {activity.map((entry) => (
            <article key={entry.id} className="border-b py-3 text-sm">
              <b>{entry.action}</b>
              <p className="text-xs text-[#6c7d70]">
                {new Date(entry.at).toLocaleString("pt-BR")} ·{" "}
                {ws.audits.find((a) => a.id === entry.auditId)?.name || "Biblioteca / sistema"}
              </p>
              <p className="mt-1 text-xs">{entry.detail}</p>
            </article>
          ))}
          {!activity.length && (
            <p className="p-4 text-sm text-[#6c7d70]">
              Não há atividades registradas nesta seleção. O histórico começou a ser coletado nesta
              versão local.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
