import { parseIsoState } from "@/lib/iso-local-state";
import { IsoAccessPanel } from "@/components/iso/IsoAccessPanel";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { Plus, Pencil, Archive, RotateCcw, Download, Upload, Star } from "lucide-react";
import { toast } from "sonner";
import {
  useIsoWorkspace,
  type IsoQuestion,
  type IsoEvidence,
  type IsoNc,
} from "@/components/iso/IsoWorkspace";
import {
  isoProcesses,
  isoStandards,
  promptCatalog,
  type IsoPrompt,
} from "@/components/iso/IsoExtendedCatalog";
import { evidenceCatalog, ncModels } from "@/components/iso/IsoCatalog";
import { starter } from "./iso.roteiros";
import type { IsoLocalState, IsoNamedItem } from "@/lib/iso-local-state";
import {
  downloadIsoBlob,
  exportIsoBackup,
  inspectIsoBackup,
  writeIsoBlob,
} from "@/lib/iso-local-files";
export const Route = createFileRoute("/_app/iso/biblioteca")({ component: Library });
const kinds = [
  ["processes", "Processos"],
  ["criteria", "Critérios"],
  ["questions", "Perguntas"],
  ["evidence", "Evidências"],
  ["customNcs", "Modelos de NC"],
  ["prompts", "Meus prompts"],
] as const;
type Kind = (typeof kinds)[number][0];
type Item = IsoQuestion | IsoEvidence | IsoNc | IsoPrompt | IsoNamedItem;
const fields: Record<Kind, [string, string, boolean][]> = {
  processes: [
    ["name", "Nome do processo", true],
    ["description", "Descrição", false],
  ],
  criteria: [
    ["name", "Nome do critério", true],
    ["description", "Requisitos ou referência", true],
  ],
  questions: [
    ["standard", "Norma / critério", true],
    ["clause", "Cláusula", false],
    ["process", "Processo", true],
    ["question", "Pergunta", true],
    ["objective", "Objetivo", false],
    ["expected", "Evidência esperada", false],
    ["alert", "Sinal de alerta", false],
  ],
  evidence: [
    ["standard", "Norma / critério", true],
    ["clause", "Cláusula", false],
    ["title", "Título", true],
    ["type", "Tipo de evidência", true],
    ["risk", "Risco se ausente", true],
    ["description", "Descrição", true],
    ["example", "Exemplo", false],
  ],
  customNcs: [
    ["standard", "Norma / critério", true],
    ["clause", "Cláusula", false],
    ["title", "Título", true],
    ["finding", "Constatação modelo", true],
    ["evidence", "Evidência objetiva modelo", false],
    ["classification", "Classificação sugerida", true],
    ["cause", "Orientação para investigar causa", false],
    ["action", "Ação sugerida", false],
    ["closingEvidence", "Evidência de fechamento esperada", false],
  ],
  prompts: [
    ["title", "Título", true],
    ["standard", "Norma / critério", true],
    ["clause", "Cláusula", false],
    ["process", "Processo", true],
    ["category", "Categoria", true],
    ["body", "Texto do prompt", true],
    ["tip", "Dica de uso", false],
  ],
};
const textOf = (item: Item) =>
  "question" in item ? item.question : "name" in item ? item.name : item.title;
const box = "rounded-xl border border-[#dce6dc] bg-white p-5 shadow-sm";
function Library() {
  const ws = useIsoWorkspace();
  const { archivedIds, favorites, toggleFavorite, archiveItem } = ws;
  const [kind, setKind] = useState<Kind>("processes");
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const [editor, setEditor] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Awaited<ReturnType<typeof inspectIsoBackup>> | null>(null);
  const recoveryPrefix = ws.storageKey.split(":").slice(0, -1).join(":") + ":";
  const recoveryKeys =
    ws.remote && typeof window !== "undefined"
      ? Object.keys(localStorage)
          .filter((key) => {
            if (!key.startsWith(recoveryPrefix)) return false;
            if (key.includes(":recovery:")) return true;
            if (key === ws.storageKey || key.endsWith(":sync") || key.endsWith(":selection"))
              return false;
            try {
              return JSON.parse(localStorage.getItem(`${key}:sync`) || "null")?.pending === true;
            } catch {
              return false;
            }
          })
          .sort()
          .reverse()
      : [];
  const rows = (ws[kind] as Item[]).filter(
    (item) =>
      archivedIds.includes(item.id) === archived &&
      JSON.stringify(item).toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")),
  );
  const edit = (item?: Item) => {
    const values = Object.fromEntries(fields[kind].map(([key]) => [key, ""]));
    setDraft({
      ...values,
      standard: "SGI",
      type: "Registro",
      risk: "Médio",
      classification: "NC Menor",
      status: "Aberta",
      ...item,
      id: item?.id || "",
    } as Record<string, string>);
    setEditor(true);
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (fields[kind].some(([key, , required]) => required && !draft[key]?.trim())) return;
    const item = {
      ...Object.fromEntries(fields[kind].map(([key]) => [key, draft[key] || ""])),
      id: draft.id || crypto.randomUUID(),
      ...(kind === "customNcs" ? { status: "Aberta" } : {}),
      ...(["questions", "evidence"].includes(kind) ? { custom: true } : {}),
    };
    if (!ws.saveLibraryItem(kind, item as unknown as Item)) return;
    setEditor(false);
    toast.success(
      ws.remote ? "Item preparado. Aguarde Salvo no servidor." : "Item salvo na biblioteca local.",
    );
  };
  const backup = async () => {
    setBusy(true);
    try {
      const blob = await exportIsoBackup(ws, ws.storageKey, ws.readFile);
      downloadIsoBlob(blob, `jacoby-iso-backup-${new Date().toISOString().slice(0, 10)}.zip`);
      toast.success("Backup ZIP completo gerado, incluindo os anexos.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao exportar.");
    } finally {
      setBusy(false);
    }
  };
  const readBackup = async (file: File) => {
    setBusy(true);
    try {
      setPending(await inspectIsoBackup(file));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Backup inválido.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  const restore = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      for (const [id, blob] of pending.files) await ws.writeFile(id, blob);
      if (!ws.replaceBackup(pending.state)) return;
      setPending(null);
      toast.success(
        ws.remote
          ? "Backup enviado para sincronização. Aguarde Salvo no servidor."
          : "Backup restaurado neste navegador, incluindo os anexos.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao restaurar.");
    } finally {
      setBusy(false);
    }
  };
  const favoriteRows = [
    ...starter,
    ...ws.questions,
    ...evidenceCatalog,
    ...ws.evidence,
    ...promptCatalog,
    ...ws.prompts,
    ...ncModels.map((n, i) => ({ ...n, id: `base-nc-${i}` })),
    ...ws.customNcs,
  ].filter((item) => favorites.includes(item.id));
  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-7 sm:px-7">
      <IsoAccessPanel />
      {recoveryKeys.length > 0 && (
        <section className="rounded-xl border bg-amber-50 p-4">
          <h2 className="font-bold">Cópias preservadas antes de recarregar</h2>
          <p className="text-sm">
            Estas cópias não substituem o servidor. Baixe o ZIP para revisar e, se necessário,
            restaurar pela área de backup.
          </p>
          {recoveryKeys.map((key) => (
            <button
              key={key}
              className="mt-2 block text-sm underline"
              onClick={() =>
                void (async () => {
                  try {
                    const copy = parseIsoState(localStorage.getItem(key) || "");
                    const blob = await exportIsoBackup(copy, ws.storageKey, ws.readFile);
                    downloadIsoBlob(blob, "jacoby-iso-copia-preservada.zip");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Falha ao exportar cópia.");
                  }
                })()
              }
            >
              {key.includes(":recovery:")
                ? `Baixar cópia de ${new Date(Number(key.split(":").at(-1))).toLocaleString("pt-BR")}`
                : "Baixar edição pendente de outra aba"}
            </button>
          ))}
        </section>
      )}

      <header>
        <h1 className="text-2xl font-bold">Minha biblioteca</h1>
        <p className="mt-1 text-sm text-[#6c7d70]">
          Cadastros próprios reutilizáveis em todas as auditorias deste ambiente.
        </p>
      </header>
      <div className="rounded-lg border-l-4 border-[#46a45c] bg-[#edf6ef] p-4 text-sm">
        Seus itens complementam os catálogos da Jacoby. Arquivar um item não apaga os vínculos já
        usados em auditorias.
      </div>
      <div className="flex flex-wrap gap-2">
        {kinds.map(([key, label]) => (
          <button
            type="button"
            key={key}
            aria-pressed={kind === key}
            onClick={() => {
              setKind(key);
              setSearch("");
            }}
            className={`rounded-lg border px-3 py-2 text-sm ${kind === key ? "bg-[#e5f0e4] font-bold" : "bg-white"}`}
          >
            {label} ({ws[key].filter((i) => !archivedIds.includes(i.id)).length})
          </button>
        ))}
      </div>
      <section className={box}>
        <div className="flex flex-wrap items-center gap-3">
          <input
            aria-label="Buscar na minha biblioteca"
            className="h-10 min-w-48 flex-1 rounded-lg border px-3 text-sm"
            placeholder="Buscar nos meus cadastros"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
            />
            Mostrar arquivados
          </label>
          <button
            type="button"
            onClick={() => edit()}
            className="flex items-center gap-1 rounded-lg bg-[#2c7b38] px-3 py-2 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Novo cadastro
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {rows.map((item) => (
            <article
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
            >
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">{textOf(item)}</h2>
                {"standard" in item && (
                  <p className="mt-1 text-xs text-[#6c7d70]">
                    {item.standard} {item.clause}
                    {"process" in item ? ` · ${item.process}` : ""}
                  </p>
                )}
                {"description" in item && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-[#6c7d70]">
                    {item.description}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-label={`Editar ${textOf(item)}`}
                  onClick={() => edit(item)}
                  className="rounded-lg border p-2"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={`${archived ? "Restaurar" : "Arquivar"} ${textOf(item)}`}
                  onClick={() => archiveItem(item.id, !archived)}
                  className="rounded-lg border p-2"
                >
                  {archived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                </button>
              </div>
            </article>
          ))}
          {!rows.length && (
            <p className="py-8 text-center text-sm text-[#6c7d70]">
              Nenhum cadastro nesta seleção. Use Novo cadastro para adicionar.
            </p>
          )}
        </div>
      </section>
      <section className={box}>
        <h2 className="font-bold">Favoritos ({favoriteRows.length})</h2>
        <div className="mt-3 space-y-2">
          {favoriteRows.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
              <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-500" />
              <span className="flex-1">{"question" in item ? item.question : item.title}</span>
              <button
                type="button"
                onClick={() => toggleFavorite(item.id)}
                className="text-xs underline"
              >
                Remover favorito
              </button>
            </div>
          ))}
          {!favoriteRows.length && (
            <p className="text-sm text-[#6c7d70]">
              Marque favoritos nas bibliotecas e nos prompts.
            </p>
          )}
        </div>
      </section>
      <section className={box}>
        <h2 className="font-bold">Conjuntos de filtros salvos</h2>
        {ws.filters.map((f) => (
          <div
            key={f.id}
            className="mt-2 flex items-center justify-between rounded border p-3 text-sm"
          >
            <span>{f.name}</span>
            <button
              type="button"
              onClick={() => ws.removeFilter(f.id)}
              className="text-xs underline"
            >
              Remover conjunto
            </button>
          </div>
        ))}
      </section>
      <section className={box}>
        <h2 className="font-bold">Auditorias deste ambiente</h2>
        <p className="mt-1 text-xs text-[#6c7d70]">
          Duplicar reaproveita o planejamento e o roteiro, começando sem respostas, achados, anexos
          ou conclusão.
        </p>
        <div className="mt-3 space-y-2">
          {ws.audits.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
            >
              <div>
                <b>{a.name}</b>
                <p className="text-xs text-[#6c7d70]">
                  {a.organization || "Empresa a definir"} ·{" "}
                  {ws.archivedAuditIds.includes(a.id) ? "Arquivada" : "Ativa"}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    ws.setSelectedId(a.id);
                    toast.success("Auditoria selecionada.");
                  }}
                  className="rounded border px-2 py-1"
                >
                  Selecionar
                </button>
                <button
                  type="button"
                  onClick={() => ws.duplicateAudit(a.id)}
                  className="rounded border px-2 py-1"
                >
                  Duplicar
                </button>
                <button
                  type="button"
                  onClick={() => ws.archiveAudit(a.id, !ws.archivedAuditIds.includes(a.id))}
                  className="rounded border px-2 py-1"
                >
                  {ws.archivedAuditIds.includes(a.id) ? "Restaurar" : "Arquivar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className={box}>
        <h2 className="font-bold">Lixeira local de registros</h2>
        <p className="mt-1 text-xs text-[#6c7d70]">
          Restaurar devolve o registro à auditoria de origem. Os anexos são preservados.
        </p>
        {ws.audits
          .flatMap((a) => [
            ...(a.removedNcs || []).map((n) => ({
              audit: a,
              id: n.id,
              title: n.title,
              kind: "nc" as const,
            })),
            ...(a.removedEvidenceRecords || []).map((r) => ({
              audit: a,
              id: r.id,
              title: r.title,
              kind: "evidence" as const,
            })),
          ])
          .map((row) => (
            <div
              key={`${row.audit.id}:${row.id}`}
              className="mt-2 flex justify-between gap-2 rounded-lg border p-3 text-sm"
            >
              <div>
                <b>{row.title}</b>
                <p className="text-xs text-[#6c7d70]">{row.audit.name}</p>
              </div>
              <button
                type="button"
                onClick={() => ws.restoreRecord(row.audit.id, row.kind, row.id)}
                className="text-xs underline"
              >
                Restaurar registro
              </button>
            </div>
          ))}
      </section>
      <section className={box}>
        <h2 className="font-bold">Backup e restauração</h2>
        <p className="mt-2 text-sm text-[#6c7d70]">
          O ZIP contém auditorias, biblioteca, favoritos, filtros, histórico e arquivos anexados. A
          restauração substitui os dados ISO deste ambiente; exporte um backup antes.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void backup()}
            className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {busy ? "Processando…" : "Exportar backup completo"}
          </button>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm">
            <Upload className="h-4 w-4" />
            Selecionar backup
            <input
              ref={input}
              aria-label="Selecionar backup ISO"
              type="file"
              accept=".zip,.json"
              disabled={busy || !ws.canWrite}
              className="sr-only"
              onChange={(e) => {
                if (e.target.files?.[0]) void readBackup(e.target.files[0]);
              }}
            />
          </label>
          {ws.storageError && (
            <button
              type="button"
              className="rounded-lg border px-4 py-2 text-sm"
              onClick={() =>
                downloadIsoBlob(
                  new Blob([localStorage.getItem(ws.storageKey) || ""], {
                    type: "application/json",
                  }),
                  "jacoby-iso-dados-para-recuperar.json",
                )
              }
            >
              Baixar dados preservados
            </button>
          )}
        </div>
      </section>
      <Link to="/iso/log-auditor" className="block text-sm font-semibold text-[#28713a] underline">
        Ver log e declaração de experiência →
      </Link>
      {editor && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-label="Editar cadastro da biblioteca"
            onSubmit={save}
            className="max-h-[90vh] w-full max-w-2xl space-y-3 overflow-y-auto rounded-xl bg-white p-6"
          >
            <h2 className="text-xl font-bold">
              {draft.id ? "Editar" : "Novo"} · {kinds.find((k) => k[0] === kind)?.[1]}
            </h2>
            <datalist id="iso-process-suggestions">
              {[...isoProcesses, ...ws.processes.map((p) => p.name)].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </datalist>
            <datalist id="iso-standard-suggestions">
              {[...isoStandards, ...ws.criteria.map((c) => c.name)].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </datalist>
            {fields[kind].map(([key, label, required]) => (
              <label key={key} className="block text-xs font-semibold">
                {label}
                {required ? " *" : ""}
                {[
                  "name",
                  "title",
                  "clause",
                  "process",
                  "standard",
                  "type",
                  "risk",
                  "category",
                  "classification",
                ].includes(key) ? (
                  <input
                    list={
                      key === "process"
                        ? "iso-process-suggestions"
                        : key === "standard"
                          ? "iso-standard-suggestions"
                          : undefined
                    }
                    required={required}
                    className="mt-1 h-10 w-full rounded-lg border px-3 text-sm font-normal"
                    value={draft[key] || ""}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  />
                ) : (
                  <textarea
                    required={required}
                    className="mt-1 min-h-20 w-full rounded-lg border p-3 text-sm font-normal"
                    value={draft[key] || ""}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  />
                )}
              </label>
            ))}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditor(false)}
                className="rounded-lg border px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#2c7b38] px-4 py-2 text-sm text-white"
              >
                Salvar cadastro
              </button>
            </div>
          </form>
        </div>
      )}
      {pending && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Revisar restauração do backup"
            className="w-full max-w-xl space-y-4 rounded-xl bg-white p-6"
          >
            <h2 className="text-xl font-bold">Revisar restauração</h2>
            <p className="text-sm">
              Arquivo validado: {pending.state.audits.length} auditoria(s),{" "}
              {pending.state.questions.length} pergunta(s) própria(s), {pending.files.size}{" "}
              anexo(s). Os dados atuais deste ambiente serão substituídos.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="rounded-lg border px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void restore()}
                className="rounded-lg bg-[#2c7b38] px-4 py-2 text-sm text-white"
              >
                Restaurar este backup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
