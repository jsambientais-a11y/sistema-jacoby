import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Trash2, Download } from "lucide-react";
import { jsPDF } from "jspdf";
import {
  useIsoWorkspace,
  type IsoAudit,
  type IsoSchedule,
  type IsoAuditee,
} from "@/components/iso/IsoWorkspace";

export const Route = createFileRoute("/_app/iso/plano")({ component: Plan });

const input =
  "mt-1 block h-10 w-full rounded-lg border border-[#dbe5db] bg-white px-3 text-sm font-normal outline-none focus:border-[#72ad76]";
const area =
  "mt-1 block min-h-20 w-full rounded-lg border border-[#dbe5db] bg-white p-3 text-sm font-normal outline-none focus:border-[#72ad76]";
const card = "rounded-xl border border-[#dce6dc] bg-white p-5 shadow-sm";
const label = "block text-sm font-semibold text-[#344b39]";

function Plan() {
  const {
    selected,
    archivedIds,
    updateAudit,
    criteria: customCriteria,
    processes: customProcesses,
  } = useIsoWorkspace();
  const field =
    (key: keyof IsoAudit) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      updateAudit({ [key]: event.target.value });
  const addRow = () =>
    updateAudit({
      schedule: [
        ...(selected.schedule || []),
        {
          id: crypto.randomUUID(),
          start: "09:00",
          end: "10:00",
          process: "",
          auditee: "",
          location: "",
        },
      ],
    });
  const updateRow = (id: string, patch: Partial<IsoSchedule>) =>
    updateAudit({
      schedule: (selected.schedule || []).map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      ),
    });
  const addAuditee = () =>
    updateAudit({
      auditees: [
        ...(selected.auditees || []),
        { id: crypto.randomUUID(), name: "", role: "", email: "" },
      ],
    });
  const updateAuditee = (id: string, patch: Partial<IsoAuditee>) =>
    updateAudit({
      auditees: (selected.auditees || []).map((person) =>
        person.id === id ? { ...person, ...patch } : person,
      ),
    });
  const download = () => {
    const pdf = new jsPDF();
    let y = 22;
    const line = (text: string, size = 10) => {
      pdf.setFontSize(size);
      for (const part of pdf.splitTextToSize(text || "—", 175)) {
        if (y > 275) {
          pdf.addPage();
          y = 20;
        }
        pdf.text(part, 18, y);
        y += size * 0.55 + 3;
      }
    };
    line("JACOBY SOLUÇÕES AMBIENTAIS", 14);
    line("PLANO DE AUDITORIA", 16);
    y += 3;
    line(`Auditoria: ${selected.name}`);
    line(`Organização: ${selected.organization}`);
    line(`Tipo: ${selected.type}`);
    line(`Data: ${selected.scheduledFor}`);
    line(`Normas: ${selected.standards?.join(", ") || "A definir"}`);
    line(`Escopo: ${selected.scope}`);
    line(`Objetivo: ${selected.objective}`);
    line(`Critérios: ${selected.criteria}`);
    line(`Papel: ${selected.auditorRole} · Duração: ${selected.hours} horas`);
    y += 4;
    line("CRONOGRAMA", 12);
    (selected.schedule || []).forEach((row) =>
      line(`${row.start}–${row.end} | ${row.process} | ${row.auditee} | ${row.location}`),
    );
    y += 4;
    line("AUDITADOS CONVOCADOS", 12);
    (selected.auditees || []).forEach((person) =>
      line(`${person.name} · ${person.role} · ${person.email}`),
    );
    y += 4;
    line("LOGÍSTICA", 12);
    line(`Sala e recursos: ${selected.room}`);
    line(`EPI necessário: ${selected.ppe}`);
    line(`Acompanhante: ${selected.escort}`);
    line(`Observações: ${selected.logistics}`);
    pdf.save(`plano-auditoria-${selected.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`);
  };
  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-7 sm:px-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Plano de Auditoria</h1>
          <p className="mt-1 max-w-3xl text-sm text-[#6c7d70]">
            O documento de uma página enviado ao auditado antes da auditoria: objetivo, escopo,
            critérios, cronograma, auditados e logística.
          </p>
        </div>
        <button
          type="button"
          onClick={download}
          className="inline-flex items-center gap-2 rounded-lg bg-[#2c7b38] px-4 py-2 text-sm font-semibold text-white"
        >
          <Download className="h-4 w-4" />
          Baixar Plano de Auditoria (PDF)
        </button>
      </div>
      <div className="rounded-lg border-l-4 border-[#46a45c] bg-[#edf6ef] px-4 py-3 text-sm">
        <b>O que fazer aqui:</b> monte o plano e confira o PDF antes de compartilhar com o auditado.
      </div>
      <section className={card}>
        <h2 className="mb-3 font-bold">Auditoria</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-sm font-semibold">{selected.name}</p>
            <p className="text-xs text-[#7c8b7e]">
              {selected.organization || "Organização não informada"}
            </p>
          </div>
          <div className="text-sm text-[#66786a]">
            {selected.type || "Interna"} · {selected.scheduledFor || "Data a definir"}
          </div>
        </div>
      </section>
      <section className={card}>
        <h2 className="font-bold">Resumo do plano</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {customCriteria
            .filter((item) => !archivedIds.includes(item.id))
            .map((item) => (
              <button
                key={item.id}
                type="button"
                className="rounded border px-2 py-1 text-xs"
                onClick={() =>
                  updateAudit({
                    criteria: [selected.criteria, `${item.name}: ${item.description}`]
                      .filter(Boolean)
                      .join("\n"),
                  })
                }
              >
                Incluir critério: {item.name}
              </button>
            ))}
          {customProcesses
            .filter((item) => !archivedIds.includes(item.id))
            .map((item) => (
              <button
                key={item.id}
                type="button"
                className="rounded border px-2 py-1 text-xs"
                onClick={() =>
                  updateAudit({
                    processes: [
                      ...new Set([
                        ...selected.processes
                          .split(",")
                          .map((x) => x.trim())
                          .filter(Boolean),
                        item.name,
                      ]),
                    ].join(", "),
                  })
                }
              >
                Incluir processo: {item.name}
              </button>
            ))}
        </div>
        <p className="mb-4 text-xs text-[#758577]">
          Normas: {selected.standards?.join(", ") || "A definir"} · Processos:{" "}
          {selected.processes || "A definir"}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>
            Objetivo
            <textarea
              value={selected.objective || ""}
              onChange={field("objective")}
              placeholder="Ex.: verificar conformidade e eficácia do SGI"
              className={area}
            />
          </label>
          <label className={label}>
            Escopo
            <textarea
              value={selected.scope || ""}
              onChange={field("scope")}
              placeholder="Unidades, processos e atividades abrangidos"
              className={area}
            />
          </label>
          <label className={label}>
            Processos auditados
            <input
              value={selected.processes || ""}
              onChange={field("processes")}
              placeholder="Ex.: Operações, Meio Ambiente"
              className={input}
            />
          </label>
          <label className={label}>
            Critérios de auditoria
            <textarea
              value={selected.criteria || ""}
              onChange={field("criteria")}
              placeholder="Normas, procedimentos e requisitos aplicáveis"
              className={area}
            />
          </label>
          <label className={label}>
            Papel na auditoria
            <select
              value={selected.auditorRole || "Auditor líder"}
              onChange={field("auditorRole")}
              className={input}
            >
              <option>Auditor líder</option>
              <option>Auditor</option>
              <option>Observador</option>
            </select>
          </label>
          <label className={label}>
            Horas de auditoria
            <input
              type="number"
              min="1"
              value={selected.hours || ""}
              onChange={field("hours")}
              className={input}
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() =>
            updateAudit({
              criteria:
                selected.standards?.map((s) => `${s}: requisitos aplicáveis;`).join(" ") ||
                "Normas e procedimentos aplicáveis ao escopo.",
            })
          }
          className="mt-3 text-sm font-semibold text-[#2b783e]"
        >
          Sugerir a partir das normas
        </button>
      </section>
      <section className={card}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold">Cronograma hora a hora</h2>
            <p className="text-xs text-[#768878]">Horário, processo, auditado e local.</p>
          </div>
          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-semibold"
          >
            <Plus className="h-4 w-4" />
            Linha
          </button>
        </div>
        {!(selected.schedule || []).length && (
          <p className="rounded-lg bg-[#f6f9f5] p-4 text-sm text-[#849185]">
            Nenhuma linha no cronograma. Clique em Linha para começar.
          </p>
        )}
        {(selected.schedule || []).map((row) => (
          <div
            key={row.id}
            className="mb-2 grid gap-2 rounded-lg border border-[#e4ebe3] p-3 sm:grid-cols-[1fr_1fr_2fr_2fr_2fr_auto]"
          >
            <input
              aria-label="Início"
              type="time"
              value={row.start}
              onChange={(e) => updateRow(row.id, { start: e.target.value })}
              className={input}
            />
            <input
              aria-label="Fim"
              type="time"
              value={row.end}
              onChange={(e) => updateRow(row.id, { end: e.target.value })}
              className={input}
            />
            <input
              aria-label="Processo"
              placeholder="Processo"
              value={row.process}
              onChange={(e) => updateRow(row.id, { process: e.target.value })}
              className={input}
            />
            <input
              aria-label="Auditado"
              placeholder="Auditado"
              value={row.auditee}
              onChange={(e) => updateRow(row.id, { auditee: e.target.value })}
              className={input}
            />
            <input
              aria-label="Local"
              placeholder="Local"
              value={row.location}
              onChange={(e) => updateRow(row.id, { location: e.target.value })}
              className={input}
            />
            <button
              type="button"
              aria-label="Remover linha"
              onClick={() =>
                updateAudit({ schedule: selected.schedule.filter((item) => item.id !== row.id) })
              }
              className="mt-1 rounded-lg p-2 text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </section>
      <section className={card}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold">Auditados convocados</h2>
          <button
            type="button"
            onClick={addAuditee}
            className="flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-semibold"
          >
            <Plus className="h-4 w-4" />
            Auditado
          </button>
        </div>
        {!(selected.auditees || []).length && (
          <p className="rounded-lg bg-[#f6f9f5] p-4 text-sm text-[#849185]">
            Nenhum auditado adicionado.
          </p>
        )}
        {(selected.auditees || []).map((person) => (
          <div
            key={person.id}
            className="mb-2 grid gap-2 rounded-lg border border-[#e4ebe3] p-3 sm:grid-cols-[2fr_2fr_2fr_auto]"
          >
            <input
              aria-label="Nome do auditado"
              placeholder="Nome"
              value={person.name}
              onChange={(e) => updateAuditee(person.id, { name: e.target.value })}
              className={input}
            />
            <input
              aria-label="Função do auditado"
              placeholder="Função"
              value={person.role}
              onChange={(e) => updateAuditee(person.id, { role: e.target.value })}
              className={input}
            />
            <input
              aria-label="E-mail do auditado"
              type="email"
              placeholder="E-mail"
              value={person.email}
              onChange={(e) => updateAuditee(person.id, { email: e.target.value })}
              className={input}
            />
            <button
              type="button"
              aria-label="Remover auditado"
              onClick={() =>
                updateAudit({ auditees: selected.auditees.filter((item) => item.id !== person.id) })
              }
              className="mt-1 rounded-lg p-2 text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </section>
      <section className={card}>
        <h2 className="mb-4 font-bold">Logística</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>
            Sala e recursos
            <input value={selected.room || ""} onChange={field("room")} className={input} />
          </label>
          <label className={label}>
            EPI necessário
            <input value={selected.ppe || ""} onChange={field("ppe")} className={input} />
          </label>
          <label className={label}>
            Acompanhante
            <input value={selected.escort || ""} onChange={field("escort")} className={input} />
          </label>
          <label className={label}>
            Observações
            <textarea
              value={selected.logistics || ""}
              onChange={field("logistics")}
              className={area}
            />
          </label>
        </div>
      </section>
      <div className={card}>
        <p className="text-xs font-semibold uppercase text-[#708875]">
          Próximo passo · Etapa 1 de 5
        </p>
        <h2 className="mt-1 font-bold">Roteiros de Entrevista</h2>
        <p className="my-2 text-sm text-[#6d7d70]">
          Selecione perguntas por processo para a auditoria.
        </p>
        <Link to="/iso/roteiros" className="text-sm font-semibold text-[#26773a]">
          Ir para Roteiros de Entrevista →
        </Link>
      </div>
    </div>
  );
}
