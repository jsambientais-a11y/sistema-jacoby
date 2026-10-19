import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";

export type IsoStatus = "pending" | "in_progress" | "done";
export type IsoQuestion = { id: string; process: string; standard: string; clause: string; question: string; objective: string; expected: string; alert: string; custom?: boolean };
export type IsoSchedule = { id: string; start: string; end: string; process: string; auditee: string; location: string };
export type IsoAuditee = { id: string; name: string; role: string; email: string };
export type IsoAnswer = { status: "pending" | "conforme" | "parcial" | "nao_conforme"; observation: string; evidence: string };
export type IsoEvidence = { id: string; standard: string; clause: string; title: string; type: string; risk: string; description: string; example: string; custom?: boolean };
export type IsoEvidenceRecord = { id: string; evidenceId: string; standard: string; clause: string; title: string; process: string; status: string; reference: string; observation: string };
export type IsoNc = { id: string; standard: string; clause: string; title: string; finding: string; evidence: string; classification: string; cause: string; action: string; closingEvidence: string; status: string; questionId?: string };
export type IsoAudit = {
  id: string; name: string; organization: string; scheduledFor: string; type: string;
  standards: string[]; scope: string; objective: string; processes: string;
  statuses: Record<string, IsoStatus>; criteria: string; auditorRole: string; hours: string;
  schedule: IsoSchedule[]; auditees: IsoAuditee[];
  room: string; ppe: string; escort: string; logistics: string;
  selectedQuestions: string[]; notes: Record<string, string>;
  answers?: Record<string, IsoAnswer>; evidenceRecords?: IsoEvidenceRecord[]; ncs?: IsoNc[];
};

const emptyAudit = (): IsoAudit => ({ id: crypto.randomUUID(), name: "Nova auditoria", organization: "", scheduledFor: "", type: "Interna", standards: [], scope: "", objective: "", processes: "", statuses: {}, criteria: "", auditorRole: "Auditor líder", hours: "8", schedule: [], auditees: [], room: "", ppe: "", escort: "", logistics: "", selectedQuestions: [], notes: {}, answers: {}, evidenceRecords: [], ncs: [] });

type IsoContextValue = {
  audits: IsoAudit[]; selected: IsoAudit; selectedId: string; setSelectedId: (id: string) => void;
  createAudit: (audit: Partial<IsoAudit>) => void; updateAudit: (patch: Partial<IsoAudit>) => void;
  questions: IsoQuestion[]; addQuestion: (question: IsoQuestion) => void;
  evidence: IsoEvidence[]; addEvidence: (item: IsoEvidence) => void;
};
const IsoContext = createContext<IsoContextValue | null>(null);

export function IsoWorkspace({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const key = `jacoby-iso-workspace-v2:${user?.id || "preview"}`;
  const [audits, setAudits] = useState<IsoAudit[]>([{ ...emptyAudit(), id: "preview" }]);
  const [selectedId, setSelectedId] = useState("preview");
  const [questions, setQuestions] = useState<IsoQuestion[]>([]);
  const [evidence, setEvidence] = useState<IsoEvidence[]>([]);
  const [loadedKey, setLoadedKey] = useState("");
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      if (saved && Array.isArray(saved.audits) && saved.audits.length) {
        setAudits(saved.audits); setSelectedId(saved.selectedId || saved.audits[0].id);
        setQuestions(Array.isArray(saved.questions) ? saved.questions : []);
        setEvidence(Array.isArray(saved.evidence) ? saved.evidence : []);
      } else {
        const legacy = JSON.parse(localStorage.getItem(`jacoby-iso-checklist-v1:${user?.id || "preview"}`) || "null");
        if (Array.isArray(legacy) && legacy.length) {
          const migrated = legacy.map((item: Partial<IsoAudit>) => ({ ...emptyAudit(), ...item }));
          setAudits(migrated); setSelectedId(migrated[0].id);
        } else { const first = emptyAudit(); setAudits([first]); setSelectedId(first.id); }
      }
    } catch { const first = emptyAudit(); setAudits([first]); setSelectedId(first.id); }
    setLoadedKey(key);
  }, [key, user?.id]);
  useEffect(() => { if (loadedKey === key) localStorage.setItem(key, JSON.stringify({ audits, selectedId, questions, evidence })); }, [audits, selectedId, questions, evidence, loadedKey, key]);
  const selected = audits.find((audit) => audit.id === selectedId) || audits[0];
  const createAudit = (patch: Partial<IsoAudit>) => { const audit = { ...emptyAudit(), ...patch }; setAudits((old) => [...old, audit]); setSelectedId(audit.id); };
  const updateAudit = (patch: Partial<IsoAudit>) => setAudits((old) => old.map((audit) => audit.id === selected.id ? { ...audit, ...patch } : audit));
  const addQuestion = (question: IsoQuestion) => setQuestions((old) => [...old, question]);
  const addEvidence = (item: IsoEvidence) => setEvidence((old) => [...old, item]);
  return <IsoContext.Provider value={{ audits, selected, selectedId, setSelectedId, createAudit, updateAudit, questions, addQuestion, evidence, addEvidence }}>{children}</IsoContext.Provider>;
}

export function useIsoWorkspace() {
  const value = useContext(IsoContext);
  if (!value) throw new Error("useIsoWorkspace requer IsoWorkspace");
  return value;
}
