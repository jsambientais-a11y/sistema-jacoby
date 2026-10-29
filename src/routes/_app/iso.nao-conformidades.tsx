import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Plus, Pencil, Star } from "lucide-react";
import { ncModels } from "@/components/iso/IsoCatalog";
import { isoStandards } from "@/components/iso/IsoExtendedCatalog";
import { useIsoWorkspace, type IsoNc } from "@/components/iso/IsoWorkspace";
import { IsoAttachments } from "@/components/iso/IsoAttachments";
import { starter } from "./iso.roteiros";
export const Route = createFileRoute("/_app/iso/nao-conformidades")({ component: Nonconformities });
const blank = (): IsoNc => ({
  id: "",
  standard: "ISO 14001",
  clause: "",
  title: "",
  finding: "",
  evidence: "",
  classification: "NC Menor",
  cause: "",
  action: "",
  closingEvidence: "",
  status: "Aberta",
});
const box = "rounded-xl border border-[#dce6dc] bg-white p-5 shadow-sm",
  field = "mt-1 w-full rounded-lg border border-[#dce6dc] bg-white px-3 py-2 text-sm font-normal";
function Nonconformities() {
  const ws = useIsoWorkspace();
  const { selected, updateAudit } = ws;
  const ncs = selected.ncs || [];
  const [standard, setStandard] = useState("");
  const [clause, setClause] = useState("");
  const [search, setSearch] = useState("");
  const [classification, setClassification] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<IsoNc>(blank);
  const [limit, setLimit] = useState(16);
  const models = [
    ...ncModels.map((nc, index) => ({ ...nc, id: `base-nc-${index}`, status: "Aberta" })),
    ...ws.customNcs,
  ].filter((nc) => !ws.archivedIds.includes(nc.id));
  const shown = models.filter(
    (nc) =>
      (!standard || nc.standard === standard) &&
      (!clause || nc.clause === clause) &&
      (!classification || nc.classification === classification) &&
      `${nc.title} ${nc.finding} ${nc.clause}`
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR")),
  );
  const bank = [...starter, ...ws.questions];
  const deviations = bank.filter(
    (q) =>
      selected.selectedQuestions.includes(q.id) &&
      ["parcial", "nao_conforme"].includes(selected.answers?.[q.id]?.status || ""),
  );
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.finding.trim() || !draft.evidence.trim()) return;
    const nc = {
      ...draft,
      id: draft.id || crypto.randomUUID(),
      title: draft.title.trim() || `Achado ${draft.clause}`,
    };
    updateAudit({
      ncs: draft.id ? ncs.map((item) => (item.id === draft.id ? nc : item)) : [...ncs, nc],
    });
    setOpen(false);
  };
  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-7 sm:px-7">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Banco de NCs e Ações Corretivas</h1>
          <p className="mt-1 text-sm text-[#6c7d70]">
            Formalize constatações com o requisito aplicável e a evidência objetiva da amostra.
          </p>
        </div>
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg bg-[#2c7b38] px-4 py-2 text-sm font-semibold text-white"
          onClick={() => {
            setDraft(blank());
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Redigir NC guiada
        </button>
      </header>
      <section className={box}>
        <h2 className="font-bold">Desvios encontrados nas entrevistas</h2>
        {deviations.map((q) => (
          <article
            key={q.id}
            className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"
          >
            <div className="flex-1">
              <b>
                {q.process} · {q.standard} {q.clause}
              </b>
              <p>{q.question}</p>
            </div>
            {ncs.some((nc) => nc.questionId === q.id) ? (
              <span className="text-xs font-semibold text-[#28713a]">Formalizado</span>
            ) : (
              <button
                type="button"
                className="rounded-lg border px-3 py-2 text-xs font-semibold"
                onClick={() => {
                  setDraft({
                    ...blank(),
                    standard: q.standard,
                    clause: q.clause,
                    title: `Desvio em ${q.process}`,
                    finding: selected.answers?.[q.id]?.observation || "",
                    evidence: selected.answers?.[q.id]?.evidence || "",
                    questionId: q.id,
                  });
                  setOpen(true);
                }}
              >
                Formalizar NC
              </button>
            )}
          </article>
        ))}
        {!deviations.length && (
          <p className="mt-3 text-sm text-[#6c7d70]">
            Não há desvios marcados nesta auditoria.{" "}
            <Link to="/iso/evidencias" className="font-semibold underline">
              Ir para Auditar
            </Link>
          </p>
        )}
      </section>
      <section className={box}>
        <h2 className="font-bold">NCs desta auditoria ({ncs.length})</h2>
        {ncs.map((nc, index) => (
          <article key={nc.id} className="mt-3 space-y-2 rounded-lg border p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <p className="text-xs text-[#39814a]">
                  NC {index + 1} · {nc.standard} {nc.clause} · {nc.classification}
                </p>
                <h3 className="mt-1 font-bold">{nc.title}</h3>
              </div>
              <select
                aria-label={`Status da NC ${index + 1}`}
                className="rounded-lg border px-3 text-xs"
                value={nc.status}
                onChange={(e) =>
                  updateAudit({
                    ncs: ncs.map((item) =>
                      item.id === nc.id ? { ...item, status: e.target.value } : item,
                    ),
                  })
                }
              >
                {["Aberta", "Em tratamento", "Verificação de eficácia", "Encerrada"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <p className="whitespace-pre-wrap text-sm">
              <b>Constatação:</b> {nc.finding}
            </p>
            <p className="text-sm">
              <b>Evidência:</b> {nc.evidence}
            </p>
            {nc.cause && (
              <p className="text-sm">
                <b>Causa:</b> {nc.cause}
              </p>
            )}
            {nc.action && (
              <p className="text-sm">
                <b>Ação sugerida:</b> {nc.action}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setDraft({ ...nc });
                  setOpen(true);
                }}
                className="flex items-center gap-1 text-xs font-semibold text-[#28713a]"
              >
                <Pencil className="h-3 w-3" />
                Editar NC
              </button>
              <button
                type="button"
                onClick={() => ws.saveLibraryItem("customNcs", { ...nc, id: crypto.randomUUID() })}
                className="text-xs font-semibold text-[#28713a]"
              >
                Salvar como modelo na biblioteca
              </button>
              <Link to="/iso/pac" className="text-xs font-semibold text-[#28713a] underline">
                Ver planos vinculados ({selected.plans?.filter((p) => p.ncId === nc.id).length || 0}
                )
              </Link>
            </div>
            <button
              type="button"
              className="text-xs text-[#7a5e3a] underline"
              onClick={() => ws.archiveRecord("nc", nc.id)}
            >
              Mover NC para lixeira local
            </button>
            <IsoAttachments ownerId={nc.id} title={`Anexos da NC ${index + 1}`} />
          </article>
        ))}
        {!ncs.length && <p className="mt-3 text-sm text-[#6c7d70]">Nenhuma NC registrada.</p>}
      </section>
      <Link to="/iso/pac" className={`${box} block font-semibold text-[#28713a]`}>
        Próxima etapa: Planos de Ação (PAC) →
      </Link>
      <section className={box}>
        <h2 className="font-bold">Modelos de NC</h2>
        <p className="mt-1 text-xs text-[#6c7d70]">
          Modelos próprios da Jacoby para adaptar aos fatos verificados. Confirme a edição e a
          cláusula antes de registrar.
        </p>
        <div className="mt-4 grid gap-2 md:grid-cols-4">
          <select
            aria-label="Filtrar norma"
            className={field}
            value={standard}
            onChange={(e) => {
              setStandard(e.target.value);
              setClause("");
              setLimit(16);
            }}
          >
            <option value="">Todas as normas</option>
            {[...new Set(models.map((n) => n.standard))].sort().map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
          <select
            aria-label="Filtrar cláusula"
            className={field}
            value={clause}
            onChange={(e) => {
              setClause(e.target.value);
              setLimit(16);
            }}
          >
            <option value="">Todas as cláusulas</option>
            {[
              ...new Set(
                models.filter((n) => !standard || n.standard === standard).map((n) => n.clause),
              ),
            ]
              .sort()
              .map((c) => (
                <option key={c}>{c}</option>
              ))}
          </select>
          <select
            aria-label="Filtrar classificação"
            className={field}
            value={classification}
            onChange={(e) => {
              setClassification(e.target.value);
              setLimit(16);
            }}
          >
            <option value="">Todas as classificações</option>
            {[...new Set(models.map((n) => n.classification))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input
            aria-label="Buscar modelo"
            className={field}
            value={search}
            placeholder="Buscar título ou constatação"
            onChange={(e) => {
              setSearch(e.target.value);
              setLimit(16);
            }}
          />
        </div>
        <p className="mt-3 text-xs text-[#6c7d70]">{shown.length} modelo(s) encontrado(s)</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {shown.slice(0, limit).map((nc) => (
            <article key={nc.id} className="rounded-lg border p-4">
              <div className="flex justify-between gap-2">
                <p className="text-xs text-[#39814a]">
                  {nc.standard} {nc.clause} · {nc.classification}
                </p>
                <button
                  type="button"
                  aria-label={`Favoritar ${nc.title}`}
                  onClick={() => ws.toggleFavorite(nc.id)}
                >
                  <Star
                    className={`h-4 w-4 ${ws.favorites.includes(nc.id) ? "fill-amber-400 text-amber-500" : "text-[#829287]"}`}
                  />
                </button>
              </div>
              <h3 className="mt-1 font-bold">{nc.title}</h3>
              <p className="mt-2 text-sm text-[#6c7d70]">{nc.finding}</p>
              <button
                type="button"
                className="mt-3 rounded-lg border px-3 py-2 text-xs font-semibold text-[#28713a]"
                onClick={() => {
                  setDraft({ ...nc, id: "", status: "Aberta", questionId: undefined });
                  setOpen(true);
                }}
              >
                Adaptar e registrar na auditoria
              </button>
            </article>
          ))}
        </div>
        {shown.length > limit && (
          <button
            type="button"
            onClick={() => setLimit((n) => n + 16)}
            className="mt-4 rounded-lg border px-4 py-2 text-sm"
          >
            Carregar mais 16 modelos
          </button>
        )}
        {!shown.length && (
          <p className="mt-4 text-sm text-[#6c7d70]">Nenhum modelo corresponde aos filtros.</p>
        )}
      </section>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-label="Redigir não conformidade"
            onSubmit={save}
            className="max-h-[90vh] w-full max-w-2xl space-y-3 overflow-y-auto rounded-xl bg-white p-6"
          >
            <h2 className="text-xl font-bold">
              {draft.id ? "Editar" : "Redigir"} não conformidade
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold">
                Norma auditada
                <select
                  className={field}
                  value={draft.standard}
                  onChange={(e) => setDraft({ ...draft, standard: e.target.value })}
                >
                  {[
                    ...new Set([
                      ...isoStandards,
                      ...ws.criteria
                        .filter((c) => !ws.archivedIds.includes(c.id))
                        .map((c) => c.name),
                      draft.standard,
                    ]),
                  ].map((n) => (
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
            {(
              [
                ["finding", "Constatação (fato verificado)", true],
                ["evidence", "Evidência objetiva", true],
                ["cause", "Causa raiz", false],
                ["action", "Ação corretiva sugerida", false],
                ["closingEvidence", "Evidência de fechamento esperada", false],
              ] as const
            ).map(([key, label, required]) => (
              <label key={key} className="block text-xs font-semibold">
                {label}
                {required ? " *" : ""}
                <textarea
                  required={required}
                  className={`${field} min-h-20`}
                  value={draft[key]}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                />
              </label>
            ))}
            <label className="block text-xs font-semibold">
              Classificação
              <select
                className={field}
                value={draft.classification}
                onChange={(e) => setDraft({ ...draft, classification: e.target.value })}
              >
                {["OFI — Oportunidade de melhoria", "NC Menor", "NC Maior"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border px-4 py-2 text-sm"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#2c7b38] px-4 py-2 text-sm text-white"
              >
                Salvar NC
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
