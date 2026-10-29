import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Plus, Star, Pencil } from "lucide-react";
import { evidenceCatalog } from "@/components/iso/IsoCatalog";
import { isoStandards } from "@/components/iso/IsoExtendedCatalog";
import { IsoAttachments } from "@/components/iso/IsoAttachments";
import {
  useIsoWorkspace,
  type IsoAnswer,
  type IsoEvidence,
  type IsoEvidenceRecord,
} from "@/components/iso/IsoWorkspace";
import { starter } from "./iso.roteiros";
export const Route = createFileRoute("/_app/iso/evidencias")({ component: EvidencePage });
const box = "rounded-xl border border-[#dce6dc] bg-white p-5 shadow-sm",
  field = "mt-1 w-full rounded-lg border border-[#dce6dc] bg-white px-3 py-2 text-sm font-normal";
const emptyEvidence = (): IsoEvidence => ({
  id: "",
  standard: "ISO 14001",
  clause: "",
  title: "",
  type: "Registro",
  risk: "Médio",
  description: "",
  example: "",
  custom: true,
});
function EvidencePage() {
  const ws = useIsoWorkspace();
  const { selected, updateAudit } = ws;
  const all = [...evidenceCatalog, ...ws.evidence].filter((e) => !ws.archivedIds.includes(e.id));
  const bank = [...starter, ...ws.questions];
  const selectedQuestions = bank.filter((q) => selected.selectedQuestions.includes(q.id));
  const records = selected.evidenceRecords || [];
  const [standard, setStandard] = useState("");
  const [clause, setClause] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [risk, setRisk] = useState("");
  const [process, setProcess] = useState("");
  const [limit, setLimit] = useState(18);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [draft, setDraft] = useState<IsoEvidence>(emptyEvidence);
  const [record, setRecord] = useState<IsoEvidenceRecord | null>(null);
  const filtered = all.filter(
    (item) =>
      (!standard || item.standard === standard) &&
      (!clause || item.clause === clause) &&
      (!type || item.type === type) &&
      (!risk || item.risk === risk) &&
      (!onlyFavorites || ws.favorites.includes(item.id)) &&
      `${item.title} ${item.description} ${item.clause}`
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR")),
  );
  const answer = (id: string, patch: Partial<IsoAnswer>) =>
    updateAudit({
      answers: {
        ...selected.answers,
        [id]: {
          status: "pending",
          observation: "",
          evidence: "",
          ...selected.answers?.[id],
          ...patch,
        },
      },
    });
  const saveEvidence = (event: FormEvent) => {
    event.preventDefault();
    ws.addEvidence({ ...draft, id: crypto.randomUUID(), custom: true });
    setNewOpen(false);
  };
  const saveRecord = (event: FormEvent) => {
    event.preventDefault();
    if (!record || !record.reference.trim()) return;
    updateAudit({
      evidenceRecords: records.some((r) => r.id === record.id)
        ? records.map((r) => (r.id === record.id ? record : r))
        : [...records, record],
    });
    setRecord(null);
  };
  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-7 sm:px-7">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Biblioteca de Evidências</h1>
          <p className="mt-1 text-sm text-[#6c7d70]">
            Colete evidências, registre respostas e acompanhe a execução da auditoria ativa.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDraft(emptyEvidence());
            setNewOpen(true);
          }}
          className="flex items-center gap-2 rounded-lg bg-[#2c7b38] px-4 py-2 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          Nova evidência minha
        </button>
      </header>
      <section className={box}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold">
              Auditar: perguntas desta auditoria ({selectedQuestions.length})
            </h2>
            <p className="mt-1 text-xs text-[#6c7d70]">
              {
                selectedQuestions.filter(
                  (q) => selected.answers?.[q.id] && selected.answers[q.id].status !== "pending",
                ).length
              }{" "}
              avaliadas ·{" "}
              {
                selectedQuestions.filter(
                  (q) => !selected.answers?.[q.id] || selected.answers[q.id].status === "pending",
                ).length
              }{" "}
              pendentes
            </p>
          </div>
          <label className="text-xs font-semibold">
            Processo
            <select className={field} value={process} onChange={(e) => setProcess(e.target.value)}>
              <option value="">Todos os processos</option>
              {[...new Set(selectedQuestions.map((q) => q.process))].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 space-y-3">
          {selectedQuestions
            .filter((q) => !process || q.process === process)
            .map((q) => (
              <article key={q.id} className="rounded-xl border p-4">
                <p className="text-xs font-semibold text-[#39814a]">
                  {q.process} · {q.standard} {q.clause}
                </p>
                <h3 className="mt-1 text-sm font-semibold">{q.question}</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <label className="text-xs font-semibold">
                    Resultado
                    <select
                      aria-label={`Resultado de ${q.question}`}
                      className={field}
                      value={selected.answers?.[q.id]?.status || "pending"}
                      onChange={(e) =>
                        answer(q.id, { status: e.target.value as IsoAnswer["status"] })
                      }
                    >
                      <option value="pending">Pendente</option>
                      <option value="conforme">Conforme</option>
                      <option value="parcial">Parcial</option>
                      <option value="nao_conforme">Não conforme</option>
                    </select>
                  </label>
                  <label className="text-xs font-semibold">
                    Resposta / observação
                    <textarea
                      aria-label={`Observação de ${q.question}`}
                      className={`${field} min-h-24`}
                      value={selected.answers?.[q.id]?.observation || ""}
                      onChange={(e) => answer(q.id, { observation: e.target.value })}
                    />
                  </label>
                  <label className="text-xs font-semibold">
                    Evidência objetiva
                    <textarea
                      aria-label={`Evidência de ${q.question}`}
                      className={`${field} min-h-24`}
                      value={selected.answers?.[q.id]?.evidence || ""}
                      onChange={(e) => answer(q.id, { evidence: e.target.value })}
                    />
                  </label>
                </div>
                <IsoAttachments ownerId={q.id} title="Anexos desta entrevista" />
                {["parcial", "nao_conforme"].includes(selected.answers?.[q.id]?.status || "") && (
                  <Link
                    to="/iso/nao-conformidades"
                    className="mt-3 inline-block text-xs font-semibold text-[#28713a] underline"
                  >
                    Formalizar o achado na etapa Registrar →
                  </Link>
                )}
              </article>
            ))}
          {!selectedQuestions.length && (
            <p className="text-sm text-[#6c7d70]">
              Selecione perguntas nos{" "}
              <Link to="/iso/roteiros" className="font-semibold underline">
                Roteiros de Entrevista
              </Link>{" "}
              para iniciar.
            </p>
          )}
        </div>
      </section>
      <section className={box}>
        <h2 className="font-bold">Evidências registradas ({records.length})</h2>
        {records.map((r) => (
          <article key={r.id} className="mt-3 rounded-lg border p-4">
            <div className="flex justify-between gap-3">
              <div>
                <h3 className="font-semibold">{r.title}</h3>
                <p className="text-xs text-[#6c7d70]">
                  {r.standard} {r.clause} · {r.process || "Processo a definir"} · {r.status}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Editar registro ${r.title}`}
                onClick={() => setRecord({ ...r })}
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-sm">{r.reference}</p>
            {r.observation && (
              <p className="mt-1 whitespace-pre-wrap text-sm text-[#6c7d70]">{r.observation}</p>
            )}
            <button
              type="button"
              className="mt-2 text-xs text-[#7a5e3a] underline"
              onClick={() => ws.archiveRecord("evidence", r.id)}
            >
              Mover registro para lixeira local
            </button>
            <IsoAttachments ownerId={r.id} title="Anexos deste registro" />
          </article>
        ))}
        {!records.length && (
          <p className="mt-3 text-sm text-[#6c7d70]">
            Ainda não há registros. Use o catálogo abaixo para registrar uma evidência da amostra.
          </p>
        )}
      </section>
      <section className={box}>
        <h2 className="font-bold">Catálogo de apoio à coleta</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <input
            aria-label="Buscar evidência"
            className={field}
            placeholder="Buscar título, descrição ou cláusula"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setLimit(18);
            }}
          />
          <select
            aria-label="Filtrar norma"
            className={field}
            value={standard}
            onChange={(e) => {
              setStandard(e.target.value);
              setClause("");
              setLimit(18);
            }}
          >
            <option value="">Todas as normas</option>
            {[...new Set(all.map((e) => e.standard))].sort().map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
          <select
            aria-label="Filtrar cláusula"
            className={field}
            value={clause}
            onChange={(e) => {
              setClause(e.target.value);
              setLimit(18);
            }}
          >
            <option value="">Todas as cláusulas</option>
            {[
              ...new Set(
                all.filter((e) => !standard || e.standard === standard).map((e) => e.clause),
              ),
            ]
              .sort()
              .map((c) => (
                <option key={c}>{c}</option>
              ))}
          </select>
          <select
            aria-label="Filtrar tipo de evidência"
            className={field}
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setLimit(18);
            }}
          >
            <option value="">Todos os tipos</option>
            {[...new Set(all.map((e) => e.type))].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select
            aria-label="Filtrar risco"
            className={field}
            value={risk}
            onChange={(e) => {
              setRisk(e.target.value);
              setLimit(18);
            }}
          >
            <option value="">Todos os riscos</option>
            <option>Baixo</option>
            <option>Médio</option>
            <option>Alto</option>
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyFavorites}
              onChange={(e) => setOnlyFavorites(e.target.checked)}
            />
            Somente favoritos
          </label>
        </div>
        <p className="mt-3 text-xs text-[#6c7d70]">{filtered.length} evidência(s) encontrada(s)</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {filtered.slice(0, limit).map((e) => (
            <article key={e.id} className="space-y-2 rounded-lg border p-4">
              <div className="flex justify-between gap-2">
                <p className="text-xs font-semibold text-[#39814a]">
                  {e.standard} {e.clause} · {e.type}
                </p>
                <button
                  type="button"
                  aria-label={`Favoritar ${e.title}`}
                  onClick={() => ws.toggleFavorite(e.id)}
                >
                  <Star
                    className={`h-4 w-4 ${ws.favorites.includes(e.id) ? "fill-amber-400 text-amber-500" : "text-[#829287]"}`}
                  />
                </button>
              </div>
              <h3 className="font-bold">{e.title}</h3>
              <p className="text-sm text-[#6c7d70]">{e.description}</p>
              <p className="text-xs">
                <b>Exemplo:</b> {e.example}
              </p>
              <p className="text-xs">Risco se ausente: {e.risk}</p>
              <button
                type="button"
                className="rounded-lg border px-3 py-2 text-xs font-semibold text-[#28713a]"
                onClick={() =>
                  setRecord({
                    id: crypto.randomUUID(),
                    evidenceId: e.id,
                    standard: e.standard,
                    clause: e.clause,
                    title: e.title,
                    process: "",
                    status: "Apresentada",
                    reference: "",
                    observation: "",
                  })
                }
              >
                Registrar nesta auditoria
              </button>
            </article>
          ))}
        </div>
        {!filtered.length && (
          <p className="p-5 text-sm text-[#6c7d70]">Nenhuma evidência corresponde aos filtros.</p>
        )}
        {filtered.length > limit && (
          <button
            type="button"
            onClick={() => setLimit((n) => n + 18)}
            className="mt-4 rounded-lg border px-4 py-2 text-sm"
          >
            Carregar mais 18
          </button>
        )}
      </section>
      <Link to="/iso/nao-conformidades" className={`${box} block font-semibold text-[#28713a]`}>
        Próxima etapa: registrar não conformidades →
      </Link>
      {newOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-label="Nova evidência minha"
            onSubmit={saveEvidence}
            className="max-h-[90vh] w-full max-w-2xl space-y-3 overflow-y-auto rounded-xl bg-white p-6"
          >
            <h2 className="text-xl font-bold">Nova evidência minha</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold">
                Norma
                <select
                  className={field}
                  value={draft.standard}
                  onChange={(e) => setDraft({ ...draft, standard: e.target.value })}
                >
                  {[...new Set([...isoStandards, ...ws.criteria.map((c) => c.name)])].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold">
                Cláusula
                <input
                  className={field}
                  value={draft.clause}
                  onChange={(e) => setDraft({ ...draft, clause: e.target.value })}
                />
              </label>
              <label className="text-xs font-semibold">
                Tipo
                <select
                  className={field}
                  value={draft.type}
                  onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                >
                  {["Documento", "Registro", "Entrevista", "Observação in loco"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold">
                Risco
                <select
                  className={field}
                  value={draft.risk}
                  onChange={(e) => setDraft({ ...draft, risk: e.target.value })}
                >
                  {["Baixo", "Médio", "Alto"].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-xs font-semibold">
              Título *
              <input
                required
                className={field}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <label className="block text-xs font-semibold">
              Descrição *
              <textarea
                required
                className={`${field} min-h-24`}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </label>
            <label className="block text-xs font-semibold">
              Exemplo
              <textarea
                className={`${field} min-h-20`}
                value={draft.example}
                onChange={(e) => setDraft({ ...draft, example: e.target.value })}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border px-4 py-2 text-sm"
                onClick={() => setNewOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#2c7b38] px-4 py-2 text-sm text-white"
              >
                Salvar na minha biblioteca
              </button>
            </div>
          </form>
        </div>
      )}
      {record && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-label="Registrar evidência"
            onSubmit={saveRecord}
            className="w-full max-w-xl space-y-3 rounded-xl bg-white p-6"
          >
            <h2 className="text-xl font-bold">Registrar evidência</h2>
            <p className="text-sm">{record.title}</p>
            <label className="block text-xs font-semibold">
              Processo
              <input
                className={field}
                value={record.process}
                onChange={(e) => setRecord({ ...record, process: e.target.value })}
              />
            </label>
            <label className="block text-xs font-semibold">
              Situação
              <select
                className={field}
                value={record.status}
                onChange={(e) => setRecord({ ...record, status: e.target.value })}
              >
                {["Apresentada", "Pendente", "Incompleta"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold">
              Referência da amostra *
              <input
                required
                className={field}
                value={record.reference}
                onChange={(e) => setRecord({ ...record, reference: e.target.value })}
              />
            </label>
            <label className="block text-xs font-semibold">
              Observação
              <textarea
                className={`${field} min-h-24`}
                value={record.observation}
                onChange={(e) => setRecord({ ...record, observation: e.target.value })}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border px-4 py-2 text-sm"
                onClick={() => setRecord(null)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#2c7b38] px-4 py-2 text-sm text-white"
              >
                Salvar registro
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
