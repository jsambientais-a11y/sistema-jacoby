import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Building2, CalendarClock, CheckCircle2, Download, Eye, FileText, Infinity as InfinityIcon, Loader2, MapPin, Paperclip, Pencil, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useClients } from "@/hooks/use-data";
import { supabase } from "@/integrations/supabase/client";
import { canPreviewInline, usePdfPreview } from "@/components/PdfPreviewDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_app/portal/documentos")({ component: ClientDocumentsPortal });
type Branch = { id: string; client_id: string; name: string; cnpj: string | null };
type Doc = { id: string; client_id: string; branch_id: string | null; title: string; description: string | null; file_name: string; storage_path: string; expires_at: string | null; notify_days_before: number; active: boolean };
type Status = "overdue" | "due_soon" | "ok" | "none";
type View = "all" | Status;

const day = 86_400_000;
const todayIso = () => new Date().toISOString().slice(0, 10);
const daysUntil = (date: string) => Math.round((Date.parse(`${date}T00:00:00`) - Date.parse(`${todayIso()}T00:00:00`)) / day);
const formatDate = (value: string) => value.split("-").reverse().join("/");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const statusOf = (doc: Doc): Status => {
  if (!doc.expires_at) return "none";
  const days = daysUntil(doc.expires_at);
  if (days < 0) return "overdue";
  return days <= Number(doc.notify_days_before || 0) ? "due_soon" : "ok";
};
const STATUS_ORDER: Record<Status, number> = { overdue: 0, due_soon: 1, ok: 2, none: 3 };
const STATUS: Record<Status, { label: string; className: string; tone: string }> = {
  overdue: { label: "Vencido", className: "bg-destructive/10 text-destructive", tone: "text-destructive" },
  due_soon: { label: "Vence em breve", className: "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200", tone: "text-amber-600 dark:text-amber-300" },
  ok: { label: "Em dia", className: "bg-primary/12 text-primary", tone: "text-primary" },
  none: { label: "Sem vencimento", className: "bg-muted text-muted-foreground", tone: "text-muted-foreground" },
};
const VIEWS: { id: View; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "overdue", label: "Vencidos" },
  { id: "due_soon", label: "Vencem em breve" },
  { id: "ok", label: "Em dia" },
  { id: "none", label: "Sem vencimento" },
];
const dueText = (doc: Doc) => {
  if (!doc.expires_at) return "Sem data de vencimento";
  const days = daysUntil(doc.expires_at);
  if (days < 0) return `Venceu em ${formatDate(doc.expires_at)} · há ${plural(Math.abs(days), "dia")}`;
  if (days === 0) return `Vence hoje · ${formatDate(doc.expires_at)}`;
  return `Vence em ${formatDate(doc.expires_at)} · faltam ${plural(days, "dia")}`;
};
const DOC_COLUMNS = "id,client_id,branch_id,title,description,file_name,storage_path,expires_at,notify_days_before,active";

function ClientDocumentsPortal() {
  const { data: clients = [] } = useClients();
  const { isClient, hasPermission } = useAuth();
  const qc = useQueryClient();
  const { openPdfPreview, pdfPreviewDialog } = usePdfPreview();
  const editInputRef = useRef<HTMLInputElement>(null);
  const [clientFilter, setClientFilter] = useState("all");
  const [view, setView] = useState<View>("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Doc | null>(null);
  const [editFile, setEditFile] = useState<File | null>(null);
  const [savingDoc, setSavingDoc] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", description: "", branchId: "matrix", expiresAt: "", notifyDays: "30" });
  const manageDocs = hasPermission("documents") && !isClient;

  // Uma única consulta traz tudo que o usuário pode ver; para clientes, o RLS limita à própria empresa e filiais.
  const { data: documents = [], isLoading } = useQuery({ queryKey: ["portal-client-documents"], queryFn: async () => { const { data, error } = await (supabase.from("client_documents") as any).select(DOC_COLUMNS).eq("active", true); if (error) throw error; return (data ?? []) as Doc[]; } });
  const { data: branches = [] } = useQuery({ queryKey: ["document-branches"], queryFn: async () => { const { data, error } = await (supabase.from("client_branches") as any).select("id,client_id,name,cnpj").eq("is_active", true).order("name"); if (error) throw error; return (data ?? []) as Branch[]; } });

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const branchById = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);
  const clientName = (id: string) => clientById.get(id)?.name ?? "Cliente";
  const unitLabel = (id: string | null) => (id ? branchById.get(id)?.name ?? "Filial" : "Matriz");

  const scoped = useMemo(() => (isClient || clientFilter === "all" ? documents : documents.filter((doc) => doc.client_id === clientFilter)), [documents, clientFilter, isClient]);
  const counts = useMemo(() => {
    const result: Record<View, number> = { all: scoped.length, overdue: 0, due_soon: 0, ok: 0, none: 0 };
    for (const doc of scoped) result[statusOf(doc)] += 1;
    return result;
  }, [scoped]);

  // Empresa → unidade (Matriz primeiro) → documentos; empresas com pendências sobem para o topo.
  const { visibleCount, groups } = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const nameOf = (id: string) => clientById.get(id)?.name ?? "Cliente";
    const unitOf = (id: string | null) => (id ? branchById.get(id)?.name ?? "Filial" : "Matriz");
    const visible = scoped.filter((doc) => {
      if (view !== "all" && statusOf(doc) !== view) return false;
      if (!term) return true;
      return [doc.title, doc.file_name, doc.description ?? "", nameOf(doc.client_id), unitOf(doc.branch_id)].some((text) => text.toLocaleLowerCase("pt-BR").includes(term));
    });
    const byClient = new Map<string, Map<string, Doc[]>>();
    for (const doc of visible) {
      const units = byClient.get(doc.client_id) ?? new Map<string, Doc[]>();
      const key = doc.branch_id ?? "matrix";
      units.set(key, [...(units.get(key) ?? []), doc]);
      byClient.set(doc.client_id, units);
    }
    const sortDocs = (list: Doc[]) => [...list].sort((a, b) => STATUS_ORDER[statusOf(a)] - STATUS_ORDER[statusOf(b)] || (a.expires_at ?? "9999").localeCompare(b.expires_at ?? "9999") || a.title.localeCompare(b.title, "pt-BR"));
    const list = [...byClient.entries()].map(([clientId, units]) => {
      const unitList = [...units.entries()]
        .map(([key, docs]) => ({ key, name: key === "matrix" ? "Matriz" : unitOf(key), cnpj: key === "matrix" ? clientById.get(clientId)?.cnpj ?? null : branchById.get(key)?.cnpj ?? null, docs: sortDocs(docs) }))
        .sort((a, b) => (a.key === "matrix" ? -1 : b.key === "matrix" ? 1 : a.name.localeCompare(b.name, "pt-BR")));
      const all = unitList.flatMap((u) => u.docs);
      return { clientId, name: nameOf(clientId), units: unitList, total: all.length, overdue: all.filter((d) => statusOf(d) === "overdue").length, dueSoon: all.filter((d) => statusOf(d) === "due_soon").length };
    }).sort((a, b) => (b.overdue - a.overdue) || (b.dueSoon - a.dueSoon) || a.name.localeCompare(b.name, "pt-BR"));
    return { visibleCount: visible.length, groups: list };
  }, [scoped, view, search, clientById, branchById]);

  const signedUrl = async (doc: Doc, download?: boolean) => {
    const { data, error } = await supabase.storage.from("client-documents").createSignedUrl(doc.storage_path, 600, download ? { download: doc.file_name } : undefined);
    if (error || !data?.signedUrl) throw new Error(error?.message || "Não foi possível acessar o documento.");
    return data.signedUrl;
  };
  const download = async (doc: Doc) => {
    try {
      const link = document.createElement("a");
      link.href = await signedUrl(doc, true);
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível baixar o documento."); }
  };
  const previewDocument = async (doc: Doc) => {
    if (!canPreviewInline(doc.file_name)) { toast.info("Esse tipo de arquivo não abre no navegador. Baixando…"); return download(doc); }
    setBusyId(doc.id);
    try {
      openPdfPreview({ title: doc.title, subtitle: `${clientName(doc.client_id)} · ${unitLabel(doc.branch_id)} · ${doc.file_name}`, fileName: doc.file_name, url: await signedUrl(doc) });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível visualizar o documento."); } finally { setBusyId(null); }
  };

  const invalidateDocs = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["portal-client-documents"] }),
      qc.invalidateQueries({ queryKey: ["document-alerts"] }),
      qc.invalidateQueries({ queryKey: ["client-documents"] }),
    ]);
  };
  const startEdit = (doc: Doc) => {
    setEditing(doc);
    setEditFile(null);
    setEditForm({ title: doc.title, description: doc.description ?? "", branchId: doc.branch_id ?? "matrix", expiresAt: doc.expires_at ?? "", notifyDays: String(doc.notify_days_before ?? 30) });
  };
  const closeEdit = () => { if (savingDoc) return; setEditing(null); setEditFile(null); };
  const saveEdit = async () => {
    if (!editing) return;
    if (!editForm.title.trim()) return toast.error("Informe o nome do documento.");
    if (savingDoc) return;
    setSavingDoc(true);
    try {
      let storagePath = editing.storage_path;
      let fileName = editing.file_name;
      if (editFile) {
        const safe = editFile.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120) || "documento";
        storagePath = `${editing.client_id}/${Date.now()}-${safe}`;
        const { error } = await supabase.storage.from("client-documents").upload(storagePath, editFile, { contentType: editFile.type || "application/octet-stream" });
        if (error) { toast.error(error.message); return; }
        fileName = editFile.name;
      }
      const { error } = await (supabase.from("client_documents") as any).update({
        branch_id: editForm.branchId === "matrix" ? null : editForm.branchId,
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
        storage_path: storagePath,
        file_name: fileName,
        expires_at: editForm.expiresAt || null,
        notify_days_before: Math.max(0, Number.parseInt(editForm.notifyDays, 10) || 0),
      }).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      await (supabase.rpc("jacoby_process_document_alerts") as any);
      if (editFile && editing.storage_path && editing.storage_path !== storagePath) await supabase.storage.from("client-documents").remove([editing.storage_path]);
      await invalidateDocs();
      setEditing(null);
      setEditFile(null);
      toast.success("Documento atualizado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o documento.");
    } finally {
      setSavingDoc(false);
    }
  };
  const removeDoc = async (doc: Doc) => {
    if (!confirm(`Excluir o documento "${doc.title}"?`)) return;
    const { error } = await (supabase.from("client_documents") as any).delete().eq("id", doc.id);
    if (error) return toast.error(error.message);
    await supabase.storage.from("client-documents").remove([doc.storage_path]);
    await invalidateDocs();
    toast.success("Documento excluído.");
  };

  const toggleView = (next: Status) => setView(view === next ? "all" : next);
  const editBranches = editing ? branches.filter((b) => b.client_id === editing.client_id) : [];
  const filtersActive = view !== "all" || !!search.trim() || (!isClient && clientFilter !== "all");
  const clearFilters = () => { setView("all"); setSearch(""); setClientFilter("all"); };

  return <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
    <header>
      <h1 className="text-2xl font-bold">Documentos</h1>
      <p className="text-sm text-muted-foreground">{isClient ? "Todos os documentos da sua empresa e filiais, com os vencimentos em destaque." : "Documentos de todas as empresas e unidades, com os vencimentos em destaque."}</p>
    </header>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Metric icon={AlertTriangle} label="Vencidos" value={counts.overdue} hint="Precisam ser renovados" tone={STATUS.overdue.tone} urgent={counts.overdue > 0} onClick={() => toggleView("overdue")} active={view === "overdue"} />
      <Metric icon={CalendarClock} label="Vencem em breve" value={counts.due_soon} hint="Dentro do prazo de aviso" tone={STATUS.due_soon.tone} onClick={() => toggleView("due_soon")} active={view === "due_soon"} />
      <Metric icon={CheckCircle2} label="Em dia" value={counts.ok} hint="Vigentes, sem alerta" tone={STATUS.ok.tone} onClick={() => toggleView("ok")} active={view === "ok"} />
      <Metric icon={InfinityIcon} label="Sem vencimento" value={counts.none} hint="Não têm data de validade" tone={STATUS.none.tone} onClick={() => toggleView("none")} active={view === "none"} />
    </div>

    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={isClient ? "Buscar por documento, arquivo ou unidade" : "Buscar por documento, arquivo, empresa ou unidade"} className="pl-9" aria-label="Buscar documentos" />
        </div>
        {!isClient && <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-full sm:w-64" aria-label="Filtrar por empresa"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todas as empresas</SelectItem>{clients.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
        </Select>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Situação">
          {VIEWS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={view === item.id} onClick={() => setView(item.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${view === item.id ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:bg-card/60 hover:text-foreground"}`}>
            {item.label} <span className="tabular-nums opacity-70">{counts[item.id]}</span>
          </button>)}
        </div>
        <p className="text-sm text-muted-foreground">Exibindo <strong className="tabular-nums text-foreground">{visibleCount}</strong> de <span className="tabular-nums">{counts.all}</span></p>
      </div>

      {isLoading ? <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando documentos…</div>
        : !groups.length ? <div className="flex flex-col items-center gap-3 p-12 text-center">
          <FileText className="h-8 w-8 text-muted-foreground/60" />
          <div>
            <p className="font-medium">{filtersActive ? "Nenhum documento com esses filtros" : "Nenhum documento cadastrado ainda"}</p>
            <p className="text-sm text-muted-foreground">{filtersActive ? "Tente outra situação ou limpe a busca." : isClient ? "Quando a Jacoby enviar documentos, eles aparecem aqui." : "Cadastre documentos pela ficha do cliente."}</p>
          </div>
          {filtersActive && <Button variant="outline" size="sm" onClick={clearFilters}>Limpar filtros</Button>}
        </div>
        : <div className="divide-y">
          {groups.map((group) => <div key={group.clientId}>
            {(!isClient || groups.length > 1) && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-muted/20 px-4 py-3">
              <Building2 className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">{group.name}</h2>
              <span className="text-xs tabular-nums text-muted-foreground">{plural(group.total, "documento")}</span>
              {group.overdue > 0 && <span className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${STATUS.overdue.className}`}>{group.overdue} vencido{group.overdue === 1 ? "" : "s"}</span>}
              {group.dueSoon > 0 && <span className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${STATUS.due_soon.className}`}>{group.dueSoon} vence{group.dueSoon === 1 ? "" : "m"} em breve</span>}
            </div>}
            {group.units.map((unit) => <div key={unit.key}>
              <div className="flex items-center gap-2 px-4 pb-1 pt-3 text-xs font-medium text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" /><span>{unit.name}</span>{unit.cnpj && <span className="tabular-nums opacity-80">· {unit.cnpj}</span>}
              </div>
              <ul className="pb-2">
                {unit.docs.map((doc) => <DocRow key={doc.id} doc={doc} busy={busyId === doc.id} manage={manageDocs} onPreview={() => void previewDocument(doc)} onDownload={() => void download(doc)} onEdit={() => startEdit(doc)} onRemove={() => void removeDoc(doc)} />)}
              </ul>
            </div>)}
          </div>)}
        </div>}
    </section>

    {pdfPreviewDialog}

    <Dialog open={!!editing && manageDocs} onOpenChange={(open) => !open && closeEdit()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar documento</DialogTitle>
          <DialogDescription>{editing ? `${clientName(editing.client_id)} · ${unitLabel(editing.branch_id)}` : ""}</DialogDescription>
        </DialogHeader>
        {editing && <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Nome do documento</Label><Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} placeholder="Ex.: Licença ambiental" /></div>
            <div className="space-y-2"><Label>Unidade</Label><Select value={editForm.branchId} onValueChange={(value) => setEditForm({ ...editForm, branchId: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="matrix">Matriz</SelectItem>{editBranches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}{branch.cnpj ? ` · ${branch.cnpj}` : ""}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Vencimento</Label><Input type="date" value={editForm.expiresAt} onChange={(e) => setEditForm({ ...editForm, expiresAt: e.target.value })} /></div>
            <div className="space-y-2"><Label>Avisar com antecedência de</Label><div className="flex items-center gap-2"><Input type="number" min="0" value={editForm.notifyDays} onChange={(e) => setEditForm({ ...editForm, notifyDays: e.target.value })} className="w-28" /><span className="text-sm text-muted-foreground">dias</span></div></div>
          </div>
          <div className="space-y-2"><Label>Descrição</Label><Textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} placeholder="Observações opcionais" /></div>
          <div className="space-y-2"><Label>Arquivo</Label><div className="flex flex-wrap items-center gap-3"><input ref={editInputRef} type="file" className="hidden" onChange={(e) => setEditFile(e.target.files?.[0] ?? null)} /><Button type="button" variant="outline" onClick={() => editInputRef.current?.click()}><Paperclip className="mr-2 h-4 w-4" />{editFile ? "Trocar arquivo" : "Substituir arquivo"}</Button><span className="min-w-0 truncate text-sm text-muted-foreground">{editFile?.name ?? editing.file_name}</span></div></div>
        </div>}
        <DialogFooter>
          <Button variant="outline" disabled={savingDoc} onClick={closeEdit}>Cancelar</Button>
          <Button disabled={savingDoc} onClick={() => void saveEdit()}>{savingDoc && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{savingDoc ? "Salvando…" : "Salvar documento"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

function DocRow({ doc, busy, manage, onPreview, onDownload, onEdit, onRemove }: { doc: Doc; busy: boolean; manage: boolean; onPreview: () => void; onDownload: () => void; onEdit: () => void; onRemove: () => void }) {
  const status = statusOf(doc);
  const tone = STATUS[status];
  return <li className="group mx-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/40">
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tone.className}`}><FileText className="h-4 w-4" /></span>
    <button type="button" onClick={onPreview} className="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title="Visualizar documento">
      <span className="block truncate font-medium group-hover:text-primary">{doc.title}</span>
      <span className="block truncate text-sm text-muted-foreground">{doc.description || doc.file_name}</span>
    </button>
    <div className="flex min-w-[220px] flex-col items-start gap-1 sm:items-end">
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone.className}`}>{tone.label}</span>
      <span className={`text-xs tabular-nums ${status === "overdue" ? "text-destructive" : "text-muted-foreground"}`}>{dueText(doc)}</span>
    </div>
    <div className="flex items-center gap-1">
      <Button size="sm" variant="outline" onClick={onPreview} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}<span className="hidden md:inline">Visualizar</span></Button>
      <Button size="sm" variant="outline" onClick={onDownload} title="Baixar"><Download className="h-4 w-4" /><span className="hidden md:inline">Baixar</span></Button>
      {manage && <>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit} title="Editar documento" aria-label="Editar documento"><Pencil className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onRemove} title="Excluir documento" aria-label="Excluir documento"><Trash2 className="h-4 w-4 text-destructive" /></Button>
      </>}
    </div>
  </li>;
}

function Metric({ icon: Icon, label, value, hint, tone, onClick, active, urgent }: { icon: typeof FileText; label: string; value: number; hint: string; tone: string; onClick: () => void; active: boolean; urgent?: boolean }) {
  // O cartão inteiro filtra a lista; clicar de novo volta para "Todos".
  return <button type="button" onClick={onClick} aria-pressed={active}
    className={`rounded-xl border bg-card p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[var(--shadow-lift)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "border-primary/50 ring-2 ring-primary/15" : urgent ? "border-destructive/40" : ""}`}>
    <span className="flex items-start justify-between gap-2">
      <span>
        <span className="block text-sm text-muted-foreground">{label}</span>
        <span className={`mt-1 block text-2xl font-bold tabular-nums ${tone}`}>{value}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Icon className={`h-5 w-5 ${tone}`} />
    </span>
  </button>;
}
