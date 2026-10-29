import { Star } from "lucide-react";
import { toast } from "sonner";
import { createIsoTextPdf } from "@/lib/iso-text-pdf";
import { extendedQuestions, isoProcesses, isoStandards } from "@/components/iso/IsoExtendedCatalog";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { Download, Plus, Search, X } from "lucide-react";
import { jsPDF } from "jspdf";
import { useIsoWorkspace, type IsoQuestion } from "@/components/iso/IsoWorkspace";

export const Route = createFileRoute("/_app/iso/roteiros")({ component: Interviews });

const legacyStarter: IsoQuestion[] = [
  {
    id: "env-1",
    process: "Meio Ambiente",
    standard: "ISO 14001",
    clause: "6.1.2",
    question: "Como são identificados e avaliados os aspectos e impactos ambientais das operações?",
    objective: "Verificar o método de identificação, avaliação e atualização.",
    expected: "Matriz atualizada, critérios definidos e controles para impactos significativos.",
    alert: "Atividade ou unidade fora do levantamento; controles não relacionados aos impactos.",
  },
  {
    id: "env-2",
    process: "Meio Ambiente",
    standard: "ISO 14001",
    clause: "6.1.3",
    question: "Como a equipe acompanha licenças, condicionantes e demais obrigações aplicáveis?",
    objective: "Confirmar a avaliação de requisitos legais e seu cumprimento.",
    expected: "Cadastro de obrigações, responsáveis, prazos e evidências de atendimento.",
    alert: "Licença vencida, condicionante sem responsável ou avaliação não demonstrada.",
  },
  {
    id: "env-3",
    process: "Meio Ambiente",
    standard: "ISO 14001",
    clause: "8.1",
    question: "Quais controles existem para coleta, armazenamento e destinação de resíduos?",
    objective: "Avaliar o controle operacional do ciclo de resíduos.",
    expected:
      "Segregação, rastreabilidade, documentação e destinação conforme requisitos aplicáveis.",
    alert: "Resíduo sem identificação, documentos inconsistentes ou destinação não rastreável.",
  },
  {
    id: "env-4",
    process: "Meio Ambiente",
    standard: "ISO 14001",
    clause: "8.2",
    question: "Como são testadas as respostas a emergências ambientais?",
    objective: "Verificar preparação e capacidade de resposta.",
    expected: "Cenários mapeados, recursos disponíveis, treinamentos e simulações avaliadas.",
    alert: "Plano desatualizado ou ausência de avaliação após simulado/incidente.",
  },
  {
    id: "qual-1",
    process: "Qualidade",
    standard: "ISO 9001",
    clause: "8.2",
    question: "Como os requisitos de cada cliente são conferidos antes de aceitar um serviço?",
    objective: "Verificar análise crítica de requisitos.",
    expected: "Registro de pedido, análise da capacidade e aprovação antes do compromisso.",
    alert: "Aceite sem validar requisitos ou mudanças não comunicadas.",
  },
  {
    id: "qual-2",
    process: "Qualidade",
    standard: "ISO 9001",
    clause: "9.1.2",
    question:
      "Como a satisfação dos clientes é medida e quais ações são tomadas com os resultados?",
    objective: "Verificar monitoramento da percepção do cliente.",
    expected: "Métricas, análises periódicas e ações derivadas dos resultados.",
    alert: "Dados sem análise ou reclamações recorrentes sem tratamento.",
  },
  {
    id: "sso-1",
    process: "SSO",
    standard: "ISO 45001",
    clause: "6.1.2",
    question: "Como são identificados perigos e avaliados riscos nas atividades de campo?",
    objective: "Verificar abrangência da avaliação de riscos ocupacionais.",
    expected: "Inventário atualizado com participação dos trabalhadores e controles definidos.",
    alert: "Riscos de atividades não rotineiras ausentes ou controles ineficazes.",
  },
  {
    id: "sso-2",
    process: "SSO",
    standard: "ISO 45001",
    clause: "8.1",
    question:
      "Como se confirma que equipes próprias e terceirizadas utilizam os controles e EPIs exigidos?",
    objective: "Verificar execução dos controles operacionais.",
    expected: "Treinamento, inspeção e evidências de aplicação dos controles.",
    alert: "EPI incompatível ou ausência de verificação em campo.",
  },
  {
    id: "compras-1",
    process: "Compras",
    standard: "ISO 9001",
    clause: "8.4",
    question: "Como fornecedores críticos são selecionados, avaliados e reavaliados?",
    objective: "Verificar controle de provedores externos.",
    expected: "Critérios documentados, avaliação de desempenho e ações quando necessário.",
    alert: "Fornecedor crítico sem avaliação ou problema recorrente sem ação.",
  },
  {
    id: "rh-1",
    process: "RH",
    standard: "ISO 9001",
    clause: "7.2",
    question: "Como são definidas e demonstradas as competências necessárias para cada função?",
    objective: "Verificar competência e evidências de capacitação.",
    expected: "Requisitos por função, registros de treinamento e avaliação de eficácia.",
    alert: "Pessoa executando atividade crítica sem competência demonstrada.",
  },
  {
    id: "direcao-1",
    process: "Alta Direção",
    standard: "ISO 14001",
    clause: "5.1",
    question: "Como a direção acompanha objetivos, recursos e desempenho do sistema de gestão?",
    objective: "Avaliar liderança e compromisso.",
    expected: "Análise crítica, decisões documentadas e recursos disponibilizados.",
    alert: "Objetivos sem acompanhamento ou ações sem responsáveis.",
  },
  {
    id: "log-1",
    process: "Logística",
    standard: "ISO 14001",
    clause: "8.1",
    question: "Como o transporte de resíduos mantém identificação, documentação e rastreabilidade?",
    objective: "Verificar controle operacional no transporte.",
    expected: "Procedimentos, documentos e registros consistentes até a destinação.",
    alert: "Divergência entre carga, manifesto e comprovante de destinação.",
  },
];
export const starter: IsoQuestion[] = [...legacyStarter, ...extendedQuestions];
const legacyProcesses = [
  "Comercial",
  "Produção",
  "RH",
  "Compras",
  "Qualidade",
  "Manutenção",
  "Logística",
  "Meio Ambiente",
  "SSO",
  "Alta Direção",
  "Projeto e Desenvolvimento",
  "Assistência Técnica",
  "TI e Segurança da Informação",
  "Contratadas e Terceiros",
  "Planejamento da Qualidade",
  "Gestão de Fornecedores",
  "Metrologia e Laboratório",
  "Inspeção e Ensaios",
];
const initial = {
  process: "Meio Ambiente",
  standard: "ISO 14001",
  clause: "",
  question: "",
  objective: "",
  expected: "",
  alert: "",
};
const control =
  "h-10 w-full rounded-lg border border-[#dce6dc] bg-white px-3 text-sm outline-none focus:border-[#72ad76]";

function Interviews() {
  const {
    selected,
    updateAudit,
    questions,
    addQuestion,
    processes: customProcesses,
    criteria: customCriteria,
    favorites,
    toggleFavorite,
    filters: savedFilters,
    saveFilter,
    removeFilter,
    archivedIds,
  } = useIsoWorkspace();
  const all = [...starter, ...questions].filter(
    (q) => !archivedIds.includes(q.id) || selected.selectedQuestions.includes(q.id),
  );
  const processes = [
    ...new Set([
      ...isoProcesses,
      ...customProcesses.filter((p) => !archivedIds.includes(p.id)).map((p) => p.name),
    ]),
  ];
  const [process, setProcess] = useState("Meio Ambiente");
  const [standard, setStandard] = useState("");
  const [clause, setClause] = useState("");
  const [search, setSearch] = useState("");
  const [focus, setFocus] = useState("all");
  const [limit, setLimit] = useState(36);
  const [view, setView] = useState<"list" | "quick">("list");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [draft, setDraft] = useState(initial);
  const [savedFilter, setSavedFilter] = useState("");
  const [filterName, setFilterName] = useState("");
  const selectedIds = selected.selectedQuestions || [];
  const filtered = useMemo(
    () =>
      all.filter(
        (q) =>
          (!process || q.process === process) &&
          (!standard || q.standard === standard) &&
          (!clause || q.clause === clause) &&
          (!search ||
            `${q.question} ${q.objective} ${q.clause}`
              .toLowerCase()
              .includes(search.toLowerCase())) &&
          (focus !== "selected" || selectedIds.includes(q.id)),
      ),
    [all, process, standard, clause, search, focus, selectedIds],
  );
  const toggle = (id: string) =>
    updateAudit({
      selectedQuestions: selectedIds.includes(id)
        ? selectedIds.filter((item) => item !== id)
        : [...selectedIds, id],
    });
  const create = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.question.trim()) return;
    const question = { ...draft, id: crypto.randomUUID(), custom: true };
    addQuestion(question);
    setProcess(question.process);
    setNewOpen(false);
    setDraft(initial);
  };
  const exportPdf = async (fieldOnly = false) => {
    try {
      const lines = fieldOnly ? all.filter((q) => selectedIds.includes(q.id)) : filtered;
      const doc = await createIsoTextPdf(fieldOnly ? "Roteiro de campo" : "Roteiro de entrevista", [
        { title: selected.name, text: selected.organization },
        ...lines.map((q, index) => ({
          title: `${index + 1}. [${q.standard} ${q.clause}] ${q.question}`,
          text: `Processo: ${q.process}\nObjetivo: ${q.objective}\nEvidência esperada: ${q.expected}\nAlerta: ${q.alert}\nAnotações: ${selected.notes?.[q.id] || ""}`,
        })),
      ]);
      doc.save(fieldOnly ? "roteiro-de-campo.pdf" : "roteiro-de-entrevista.pdf");
    } catch {
      toast.error("Falha ao gerar roteiro em PDF.");
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-7 sm:px-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Roteiros de Entrevista por Processo</h1>
          <p className="mt-1 text-sm text-[#6d7f70]">
            Perguntas com objetivo, resposta esperada e sinal de alerta para cada processo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-sm font-semibold"
          >
            <Plus className="h-4 w-4" />
            Nova pergunta minha
          </button>
          <button
            type="button"
            onClick={() => exportPdf()}
            className="flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-sm font-semibold"
          >
            <Download className="h-4 w-4" />
            Exportar roteiro em PDF
          </button>
        </div>
      </div>
      <div className="rounded-lg border-l-4 border-[#46a45c] bg-[#edf6ef] px-4 py-3 text-sm">
        <b>O que fazer aqui:</b> selecione as perguntas que farão parte desta auditoria.
      </div>
      <section className="rounded-xl border border-[#dce6dc] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold">
            {selectedIds.length} pergunta{selectedIds.length === 1 ? "" : "s"} selecionada
            {selectedIds.length === 1 ? "" : "s"} para esta auditoria
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                updateAudit({
                  selectedQuestions: [...new Set([...selectedIds, ...filtered.map((q) => q.id)])],
                })
              }
              className="rounded-lg border px-3 py-2 text-xs font-semibold"
            >
              Incluir todas{process ? ` de ${process}` : " dos filtros"}
            </button>
            <button
              type="button"
              disabled={!selectedIds.length}
              onClick={() => exportPdf(true)}
              className="rounded-lg bg-[#2c7b38] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              Roteiro de campo (só as selecionadas)
            </button>
          </div>
        </div>
      </section>
      <section className="rounded-xl border border-[#dce6dc] bg-white p-4 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <select
            aria-label="Filtrar norma"
            value={standard}
            onChange={(e) => {
              setStandard(e.target.value);
              setClause("");
            }}
            className={control}
          >
            <option value="">Todas as normas</option>
            {[...new Set(all.map((q) => q.standard))].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            aria-label="Filtrar cláusula"
            value={clause}
            onChange={(e) => setClause(e.target.value)}
            className={control}
          >
            <option value="">Todas as cláusulas</option>
            {[
              ...new Set(
                all.filter((q) => !standard || q.standard === standard).map((q) => q.clause),
              ),
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            aria-label="Filtrar processo"
            value={process}
            onChange={(e) => setProcess(e.target.value)}
            className={control}
          >
            <option value="">Todos os processos</option>
            {processes.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-[#879889]" />
            <input
              aria-label="Buscar por palavra-chave"
              placeholder="Buscar por palavra-chave..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${control} pl-9`}
            />
          </div>
          <select
            aria-label="Foco das perguntas"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            className={control}
          >
            <option value="all">Foco: todas as perguntas</option>
            <option value="selected">Foco: selecionadas</option>
          </select>
          <input
            aria-label="Nome do conjunto de filtros"
            placeholder="Nome do conjunto de filtros"
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            className={control}
          />
          <button
            type="button"
            onClick={() => {
              if (filterName.trim()) {
                saveFilter(filterName.trim(), { process, standard, clause, search, focus });
                setSavedFilter(filterName.trim());
              }
            }}
            className="rounded-lg border px-3 text-sm font-semibold"
          >
            Salvar filtros
          </button>
          <button
            type="button"
            onClick={() => {
              setStandard("");
              setClause("");
              setSearch("");
              setFocus("all");
              setFilterName("");
            }}
            className="rounded-lg border px-3 text-sm font-semibold"
          >
            Limpar
          </button>
        </div>
        <select
          aria-label="Aplicar filtros salvos"
          className={`${control} mt-3`}
          value=""
          onChange={(e) => {
            const saved = savedFilters.find((f) => f.id === e.target.value);
            if (saved) {
              setProcess(saved.values.process || "");
              setStandard(saved.values.standard || "");
              setClause(saved.values.clause || "");
              setSearch(saved.values.search || "");
              setFocus(saved.values.focus || "all");
              setFilterName(saved.name);
            }
          }}
        >
          <option value="">Aplicar conjunto salvo…</option>
          {savedFilters.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        {savedFilter && (
          <p className="mt-2 text-xs text-[#66836c]">Filtro salvo neste ambiente: {savedFilter}</p>
        )}
      </section>
      <section className="rounded-xl border border-[#dce6dc] bg-white shadow-sm">
        <div
          className="flex gap-1 overflow-x-auto border-b p-3"
          role="tablist"
          aria-label="Processos"
        >
          {processes.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={process === item}
              onClick={() => setProcess(item)}
              className={`shrink-0 rounded-lg px-3 py-2 text-sm ${process === item ? "bg-[#e7f3e5] font-semibold text-[#26733b]" : "text-[#758577] hover:bg-[#f2f6f1]"}`}
            >
              {item} <span className="text-xs">{all.filter((q) => q.process === item).length}</span>
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-b px-4 py-2">
          <button
            type="button"
            onClick={() => setView("list")}
            className={`rounded-lg px-3 py-1.5 text-xs ${view === "list" ? "bg-[#e7f3e5] font-semibold" : ""}`}
          >
            Lista
          </button>
          <button
            type="button"
            onClick={() => setView("quick")}
            className={`rounded-lg px-3 py-1.5 text-xs ${view === "quick" ? "bg-[#e7f3e5] font-semibold" : ""}`}
          >
            Entrevista rápida
          </button>
        </div>
        <div className="space-y-3 p-4">
          <p className="text-xs text-[#6c7d70]">
            {filtered.length} pergunta(s) nos filtros · {selectedIds.length} selecionadas na
            auditoria
          </p>
          {filtered.length === 0 && (
            <div className="rounded-lg bg-[#f5f8f5] p-5 text-sm text-[#798b7b]">
              Nenhuma pergunta neste processo com os filtros atuais. Você pode cadastrar uma
              pergunta própria.
            </div>
          )}
          {filtered.slice(0, limit).map((q, index) => (
            <article key={q.id} className="rounded-xl border border-[#dfe9df] p-4">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  aria-label={`Selecionar pergunta ${index + 1}`}
                  checked={selectedIds.includes(q.id)}
                  onChange={() => toggle(q.id)}
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded bg-[#e7f3e5] px-2 py-1 font-semibold text-[#28773a]">
                      {q.standard}
                    </span>
                    <span className="rounded bg-[#edf1ed] px-2 py-1 font-semibold">
                      {q.clause || "Sem cláusula"}
                    </span>
                    {q.custom && (
                      <span className="rounded bg-[#f0f6e8] px-2 py-1">Minha pergunta</span>
                    )}
                  </div>
                  <p className="mt-3 text-sm font-semibold">
                    {index + 1}. {q.question}
                  </p>
                  <button
                    type="button"
                    aria-label={`Favoritar pergunta ${index + 1}`}
                    className="mt-2 text-xs text-amber-600"
                    onClick={() => toggleFavorite(q.id)}
                  >
                    {favorites.includes(q.id) ? "★ Favorita" : "☆ Favoritar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle(q.id)}
                    className="mt-2 text-xs font-semibold text-[#29783e]"
                  >
                    {selectedIds.includes(q.id) ? "Remover da auditoria" : "Incluir na auditoria"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded(
                        expanded.includes(q.id)
                          ? expanded.filter((id) => id !== q.id)
                          : [...expanded, q.id],
                      )
                    }
                    className="ml-4 text-xs text-[#637869]"
                  >
                    {expanded.includes(q.id)
                      ? "Ocultar detalhes"
                      : "Ver objetivo, resposta esperada e sinal de alerta"}
                  </button>
                  {expanded.includes(q.id) && (
                    <div className="mt-3 grid gap-2 rounded-lg bg-[#f7faf6] p-3 text-xs">
                      <p>
                        <b>Objetivo:</b> {q.objective || "Não informado"}
                      </p>
                      <p>
                        <b>Resposta esperada:</b> {q.expected || "Não informada"}
                      </p>
                      <p>
                        <b>Sinal de alerta:</b> {q.alert || "Não informado"}
                      </p>
                    </div>
                  )}
                  <textarea
                    aria-label={`Anotação para ${q.question}`}
                    placeholder="Anotação rápida da resposta do entrevistado..."
                    value={selected.notes?.[q.id] || ""}
                    onChange={(e) =>
                      updateAudit({ notes: { ...(selected.notes || {}), [q.id]: e.target.value } })
                    }
                    className={`mt-3 w-full rounded-lg border p-3 text-sm ${view === "quick" ? "min-h-28" : "min-h-16"}`}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      <div className="rounded-xl border border-[#dce6dc] bg-white p-5 shadow-sm">
        <p className="text-xs font-bold uppercase text-[#708875]">Próximo passo · Etapa 2 de 5</p>
        <h2 className="mt-1 font-bold">Biblioteca de Evidências</h2>
        <p className="my-2 text-sm text-[#6d7d70]">
          Responda às perguntas selecionadas e registre as evidências verificadas.
        </p>
        <Link to="/iso/evidencias" className="text-sm font-semibold text-[#26773a]">
          Ir para Evidências →
        </Link>
      </div>
      {filtered.length > limit && (
        <button
          type="button"
          className="rounded-lg border bg-white px-4 py-2 text-sm"
          onClick={() => setLimit((n) => n + 36)}
        >
          Carregar mais 36 perguntas
        </button>
      )}
      {newOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setNewOpen(false);
          }}
        >
          <form
            onSubmit={create}
            role="dialog"
            aria-label="Nova pergunta minha"
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl"
          >
            <div className="mb-4 flex justify-between">
              <h2 className="text-xl font-bold">Nova pergunta minha</h2>
              <button type="button" aria-label="Fechar" onClick={() => setNewOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold">
                Processo
                <select
                  value={draft.process}
                  onChange={(e) => setDraft({ ...draft, process: e.target.value })}
                  className={`mt-1 ${control}`}
                >
                  {processes.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold">
                Norma / critério
                <select
                  value={draft.standard}
                  onChange={(e) => setDraft({ ...draft, standard: e.target.value })}
                  className={`mt-1 ${control}`}
                >
                  {[
                    ...new Set([
                      ...isoStandards,
                      ...customCriteria
                        .filter((c) => !archivedIds.includes(c.id))
                        .map((c) => c.name),
                    ]),
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold sm:col-span-2">
                Cláusula (opcional)
                <input
                  value={draft.clause}
                  onChange={(e) => setDraft({ ...draft, clause: e.target.value })}
                  className={`mt-1 ${control}`}
                />
              </label>
            </div>
            {[
              ["Pergunta", "question"],
              ["Objetivo da pergunta (opcional)", "objective"],
              ["Resposta esperada / conforme (opcional)", "expected"],
              ["Sinal de alerta / não conforme (opcional)", "alert"],
            ].map(([title, key]) => (
              <label key={key} className="mt-3 block text-sm font-semibold">
                {title}
                <textarea
                  required={key === "question"}
                  value={draft[key as keyof typeof draft]}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  className="mt-1 min-h-16 w-full rounded-lg border p-3 font-normal"
                />
              </label>
            ))}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewOpen(false)}
                className="rounded-lg px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!draft.question.trim()}
                className="rounded-lg bg-[#2c7b38] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Salvar na minha biblioteca
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
