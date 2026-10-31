import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from "react";
import { toast } from "sonner";
import type { IsoActionPlan, IsoReport } from "@/lib/iso-workflow";
import {
  appendIsoLog,
  initializeIsoState,
  parseIsoState,
  upsertIsoItem,
  type IsoLocalState,
} from "@/lib/iso-local-state";
import { useAuth } from "@/hooks/use-auth";
import { isoRemoteEnabled, readIsoRemoteBlob, writeIsoRemoteBlob } from "@/lib/iso-remote";
import { readIsoBlob, writeIsoBlob } from "@/lib/iso-local-files";
import { useIsoServerSync } from "./useIsoServerSync";
export type IsoStatus = "pending" | "in_progress" | "done";
export type IsoQuestion = {
  id: string;
  process: string;
  standard: string;
  clause: string;
  question: string;
  objective: string;
  expected: string;
  alert: string;
  custom?: boolean;
};
export type IsoSchedule = {
  id: string;
  start: string;
  end: string;
  process: string;
  auditee: string;
  location: string;
};
export type IsoAuditee = { id: string; name: string; role: string; email: string };
export type IsoAnswer = {
  status: "pending" | "conforme" | "parcial" | "nao_conforme";
  observation: string;
  evidence: string;
};
export type IsoEvidence = {
  id: string;
  standard: string;
  clause: string;
  title: string;
  type: string;
  risk: string;
  description: string;
  example: string;
  custom?: boolean;
};
export type IsoEvidenceRecord = {
  id: string;
  evidenceId: string;
  standard: string;
  clause: string;
  title: string;
  process: string;
  status: string;
  reference: string;
  observation: string;
};
export type IsoNc = {
  id: string;
  standard: string;
  clause: string;
  title: string;
  finding: string;
  evidence: string;
  classification: string;
  cause: string;
  action: string;
  closingEvidence: string;
  status: string;
  questionId?: string;
};
export type IsoFile = {
  id: string;
  name: string;
  size: number;
  type: string;
  ownerId: string;
  addedAt: string;
};
export type IsoAudit = {
  id: string;
  name: string;
  organization: string;
  scheduledFor: string;
  type: string;
  standards: string[];
  scope: string;
  objective: string;
  processes: string;
  statuses: Record<string, IsoStatus>;
  criteria: string;
  auditorRole: string;
  hours: string;
  schedule: IsoSchedule[];
  auditees: IsoAuditee[];
  room: string;
  ppe: string;
  escort: string;
  logistics: string;
  selectedQuestions: string[];
  notes: Record<string, string>;
  removedNcs?: IsoNc[];
  removedEvidenceRecords?: IsoEvidenceRecord[];
  plans?: IsoActionPlan[];
  report?: Partial<IsoReport>;
  answers?: Record<string, IsoAnswer>;
  evidenceRecords?: IsoEvidenceRecord[];
  ncs?: IsoNc[];
  files?: IsoFile[];
};
export const emptyIsoAudit = (): IsoAudit => ({
  id: crypto.randomUUID(),
  name: "Nova auditoria",
  organization: "",
  scheduledFor: "",
  type: "Interna",
  standards: [],
  scope: "",
  objective: "",
  processes: "",
  statuses: {},
  criteria: "",
  auditorRole: "Auditor líder",
  hours: "8",
  schedule: [],
  auditees: [],
  room: "",
  ppe: "",
  escort: "",
  logistics: "",
  selectedQuestions: [],
  notes: {},
  answers: {},
  evidenceRecords: [],
  ncs: [],
  plans: [],
  files: [],
});
type LibraryKey = "questions" | "evidence" | "customNcs" | "prompts" | "processes" | "criteria";
type IsoContextValue = IsoLocalState & {
  remote: boolean;
  syncStatus: string;
  access: string;
  canWrite: boolean;
  reloadServer: () => void;
  readFile: (id: string) => Promise<Blob>;
  writeFile: (id: string, blob: Blob) => Promise<void>;
  selected: IsoAudit;
  storageKey: string;
  storageError: string;
  loaded: boolean;
  setSelectedId: (id: string) => void;
  createAudit: (patch: Partial<IsoAudit>) => boolean;
  updateAudit: (patch: Partial<IsoAudit>) => boolean;
  duplicateAudit: (id: string) => void;
  archiveAudit: (id: string, archive: boolean) => void;
  addQuestion: (item: IsoQuestion) => void;
  addEvidence: (item: IsoEvidence) => void;
  saveLibraryItem: <K extends LibraryKey>(key: K, item: IsoLocalState[K][number]) => boolean;
  toggleFavorite: (id: string) => void;
  archiveItem: (id: string, archive: boolean) => void;
  saveFilter: (name: string, values: Record<string, string>) => void;
  removeFilter: (id: string) => void;
  replaceBackup: (state: IsoLocalState) => boolean;
  setAuditorName: (name: string) => void;
  appendFiles: (auditId: string, files: IsoFile[]) => void;
  logAction: (action: string, detail: string) => void;
  archiveRecord: (kind: "nc" | "evidence", id: string) => void;
  restoreRecord: (auditId: string, kind: "nc" | "evidence", id: string) => void;
};
const Context = createContext<IsoContextValue | null>(null);
export function IsoWorkspace({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [tabId] = useState(() => {
    if (typeof window === "undefined") return "ssr";
    const key = "jacoby-iso-tab";
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(key, id);
    }
    return id;
  });
  const storageKey = `jacoby-iso-workspace-${isoRemoteEnabled ? "server-v1" : "v2"}:${user?.id || "preview"}${isoRemoteEnabled ? `:${tabId}` : ""}`;
  const [state, setState] = useState(() =>
    initializeIsoState({ ...emptyIsoAudit(), id: "preview" }),
  );
  const [loadedKey, setLoadedKey] = useState("");
  const [storageError, setStorageError] = useState("");
  const server = useIsoServerSync({
    enabled: isoRemoteEnabled,
    userId: user?.id,
    storageKey,
    setState,
    setError: setStorageError,
    loaded: () => setLoadedKey(storageKey),
    initial: () => initializeIsoState(emptyIsoAudit()),
  });
  useEffect(() => {
    if (isoRemoteEnabled) return;
    try {
      const raw = localStorage.getItem(storageKey);
      let next: IsoLocalState;
      if (raw) next = parseIsoState(raw);
      else {
        const legacy = JSON.parse(
          localStorage.getItem(`jacoby-iso-checklist-v1:${user?.id || "preview"}`) || "null",
        );
        if (Array.isArray(legacy) && legacy.length) {
          const first = initializeIsoState(emptyIsoAudit());
          next = parseIsoState(
            JSON.stringify({
              ...first,
              audits: legacy.map((item) => ({ ...emptyIsoAudit(), ...item })),
              selectedId: legacy[0].id,
            }),
          );
        } else next = initializeIsoState(emptyIsoAudit());
      }
      setState(next);
      setStorageError("");
    } catch (error) {
      setState(initializeIsoState(emptyIsoAudit()));
      setStorageError(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os dados locais. Os dados originais foram preservados.",
      );
    }
    setLoadedKey(storageKey);
  }, [storageKey, user?.id]);
  useEffect(() => {
    if (isoRemoteEnabled) return;
    const sync = (event: StorageEvent) => {
      if (event.key !== storageKey || !event.newValue) return;
      try {
        setState(parseIsoState(event.newValue));
        setStorageError("");
      } catch {
        setStorageError(
          "Outra aba gravou dados incompatíveis. Exporte os dados preservados antes de restaurar um backup.",
        );
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [storageKey]);
  const latest = useRef({ state, storageKey });
  latest.current = { state, storageKey };
  const selected = state.audits.find((a) => a.id === state.selectedId) || state.audits[0];
  const commit = (
    next: IsoLocalState,
    action: string,
    detail: string,
    auditId: string | null = selected.id,
    allowRecovery = false,
  ) => {
    if (loadedKey !== storageKey) return false;
    if (isoRemoteEnabled && action && (!server.canWrite || storageError)) {
      toast.error("Edição bloqueada. Confira a conexão e a permissão do ISO.");
      return false;
    }
    if (storageError && !allowRecovery) {
      toast.error(
        "Salvamento bloqueado para preservar os dados. Use Importar backup na Minha biblioteca.",
      );
      return false;
    }
    const result = action
      ? appendIsoLog(next, {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          auditId,
          action,
          detail,
        })
      : next;
    try {
      localStorage.setItem(storageKey, JSON.stringify(result));
      if (isoRemoteEnabled && action && !server.enqueue(result)) return false;
      if (isoRemoteEnabled && !action)
        localStorage.setItem(`${storageKey}:selection`, result.selectedId);
      setState(result);
      latest.current = { state: result, storageKey };
      setStorageError("");
      return true;
    } catch {
      setStorageError(
        "Não foi possível salvar no navegador. Libere espaço ou exporte um backup antes de continuar.",
      );
      toast.error("Falha no salvamento local. A edição não foi gravada.");
      return false;
    }
  };
  const setSelectedId = (id: string) => {
    if (state.audits.some((a) => a.id === id)) commit({ ...state, selectedId: id }, "", "", id);
  };
  const createAudit = (patch: Partial<IsoAudit>) => {
    const audit = { ...emptyIsoAudit(), ...patch };
    return commit(
      { ...state, audits: [...state.audits, audit], selectedId: audit.id },
      "Auditoria criada",
      audit.name,
      audit.id,
    );
  };
  const updateAudit = (patch: Partial<IsoAudit>) => {
    const names: Record<string, string> = {
      answers: "Respostas e evidências",
      ncs: "Não conformidades",
      plans: "Planos de ação",
      report: "Relatório",
      statuses: "Checklist",
      evidenceRecords: "Registros de evidências",
      files: "Anexos",
      selectedQuestions: "Roteiro de entrevista",
      notes: "Anotações",
      schedule: "Cronograma",
      auditees: "Auditados",
    };
    const detail = Object.keys(patch)
      .map((k) => names[k] || k)
      .join(", ");
    return commit(
      {
        ...state,
        audits: state.audits.map((a) => (a.id === selected.id ? { ...a, ...patch } : a)),
      },
      "Auditoria atualizada",
      detail,
    );
  };
  const saveLibraryItem = <K extends LibraryKey>(key: K, item: IsoLocalState[K][number]) =>
    commit(
      { ...state, [key]: upsertIsoItem(state[key] as { id: string }[], item) },
      "Biblioteca atualizada",
      key,
      null,
    );
  const archiveAudit = (id: string, archive: boolean) => {
    if (
      archive &&
      !state.archivedAuditIds.includes(id) &&
      state.audits.filter((a) => !state.archivedAuditIds.includes(a.id)).length <= 1
    ) {
      toast.error("Mantenha ao menos uma auditoria ativa.");
      return;
    }
    const archived = archive
      ? [...new Set([...state.archivedAuditIds, id])]
      : state.archivedAuditIds.filter((x) => x !== id);
    commit(
      {
        ...state,
        archivedAuditIds: archived,
        selectedId:
          archive && selected.id === id
            ? state.audits.find((a) => !archived.includes(a.id))!.id
            : state.selectedId,
      },
      archive ? "Auditoria arquivada" : "Auditoria restaurada",
      state.audits.find((a) => a.id === id)?.name || "",
      id,
    );
  };
  const duplicateAudit = (id: string) => {
    const original = state.audits.find((a) => a.id === id);
    if (!original) return;
    createAudit({
      ...emptyIsoAudit(),
      name: `Cópia de ${original.name}`,
      organization: original.organization,
      type: original.type,
      standards: [...original.standards],
      scope: original.scope,
      objective: original.objective,
      processes: original.processes,
      criteria: original.criteria,
      auditorRole: original.auditorRole,
      hours: original.hours,
      room: original.room,
      ppe: original.ppe,
      escort: original.escort,
      logistics: original.logistics,
      selectedQuestions: [...original.selectedQuestions],
    });
  };
  const value: IsoContextValue = {
    ...state,
    archiveRecord: (kind, id) => {
      if (kind === "nc") {
        if (selected.plans?.some((p) => p.ncId === id)) {
          toast.error(
            "Esta NC possui plano de ação vinculado. Mantenha o registro para preservar o vínculo.",
          );
          return;
        }
        const nc = selected.ncs?.find((n) => n.id === id);
        if (nc)
          updateAudit({
            ncs: selected.ncs!.filter((n) => n.id !== id),
            removedNcs: [...(selected.removedNcs || []), nc],
          });
      } else {
        const record = selected.evidenceRecords?.find((r) => r.id === id);
        if (record)
          updateAudit({
            evidenceRecords: selected.evidenceRecords!.filter((r) => r.id !== id),
            removedEvidenceRecords: [...(selected.removedEvidenceRecords || []), record],
          });
      }
    },
    restoreRecord: (auditId, kind, id) => {
      const audit = state.audits.find((a) => a.id === auditId);
      if (!audit) return;
      const patch: Partial<IsoAudit> = {};
      if (kind === "nc") {
        const item = audit.removedNcs?.find((n) => n.id === id);
        if (!item) return;
        patch.ncs = upsertIsoItem(audit.ncs || [], item);
        patch.removedNcs = audit.removedNcs!.filter((n) => n.id !== id);
      } else {
        const item = audit.removedEvidenceRecords?.find((r) => r.id === id);
        if (!item) return;
        patch.evidenceRecords = upsertIsoItem(audit.evidenceRecords || [], item);
        patch.removedEvidenceRecords = audit.removedEvidenceRecords!.filter((r) => r.id !== id);
      }
      commit(
        { ...state, audits: state.audits.map((a) => (a.id === auditId ? { ...a, ...patch } : a)) },
        "Registro restaurado",
        kind,
        auditId,
      );
    },
    remote: isoRemoteEnabled,
    syncStatus: isoRemoteEnabled ? server.status : "Salvo neste navegador",
    access: isoRemoteEnabled ? server.snapshot?.access || "" : "local",
    canWrite: !isoRemoteEnabled || (server.canWrite && !storageError),
    reloadServer: server.reloadServer,
    readFile: (id) =>
      isoRemoteEnabled && server.snapshot
        ? readIsoRemoteBlob(server.snapshot.id, id)
        : readIsoBlob(storageKey, id),
    writeFile: async (id, blob) => {
      if (isoRemoteEnabled) {
        if (!server.snapshot || !server.canWrite || storageError)
          throw new Error("Sem permissão de envio no ISO.");
        await writeIsoRemoteBlob(server.snapshot.id, id, blob);
      } else await writeIsoBlob(storageKey, id, blob);
    },
    selected,
    storageKey,
    storageError,
    loaded: loadedKey === storageKey,
    setSelectedId,
    createAudit,
    updateAudit,
    duplicateAudit,
    archiveAudit,
    saveLibraryItem,
    addQuestion: (item) => saveLibraryItem("questions", item),
    addEvidence: (item) => saveLibraryItem("evidence", item),
    toggleFavorite: (id) =>
      commit(
        {
          ...state,
          favorites: state.favorites.includes(id)
            ? state.favorites.filter((x) => x !== id)
            : [...state.favorites, id],
        },
        "Favoritos atualizados",
        id,
        null,
      ),
    archiveItem: (id, archive) =>
      commit(
        {
          ...state,
          archivedIds: archive
            ? [...new Set([...state.archivedIds, id])]
            : state.archivedIds.filter((x) => x !== id),
        },
        archive ? "Item arquivado" : "Item restaurado",
        id,
        null,
      ),
    saveFilter: (name, values) => {
      if (!name.trim()) return;
      const old = state.filters.find((f) => f.name === name.trim());
      commit(
        {
          ...state,
          filters: upsertIsoItem(state.filters, {
            id: old?.id || crypto.randomUUID(),
            name: name.trim(),
            values,
          }),
        },
        "Filtro salvo",
        name,
        null,
      );
    },
    removeFilter: (id) =>
      commit(
        { ...state, filters: state.filters.filter((f) => f.id !== id) },
        "Filtro removido",
        id,
        null,
      ),
    replaceBackup: (backup) =>
      commit(backup, "Backup restaurado", "Arquivo local validado", null, true),
    appendFiles: (auditId, files) => {
      if (latest.current.storageKey !== storageKey) {
        toast.error("A conta mudou durante o envio do anexo.");
        return;
      }
      const current = latest.current.state;
      if (!current.audits.some((a) => a.id === auditId)) return;
      commit(
        {
          ...current,
          audits: current.audits.map((a) =>
            a.id === auditId ? { ...a, files: [...(a.files || []), ...files] } : a,
          ),
        },
        "Anexos adicionados",
        `${files.length} arquivo(s)`,
        auditId,
      );
    },
    setAuditorName: (name) =>
      commit(
        { ...state, auditorName: name },
        "Perfil do auditor atualizado",
        "Nome da declaração",
        null,
      ),
    logAction: (action, detail) => commit(state, action, detail),
  };
  return (
    <Context.Provider value={value}>
      {loadedKey !== storageKey ? (
        <div className="p-8 text-sm">Carregando auditorias…</div>
      ) : (
        <>
          {storageError && (
            <div role="alert" className="border-b bg-red-50 p-4 text-sm text-red-800">
              {storageError} Os dados anteriores não foram apagados. Use a área de backup na Minha
              biblioteca para recuperar.
            </div>
          )}
          {children}
        </>
      )}
    </Context.Provider>
  );
}
export function useIsoWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("useIsoWorkspace requer IsoWorkspace");
  return value;
}
