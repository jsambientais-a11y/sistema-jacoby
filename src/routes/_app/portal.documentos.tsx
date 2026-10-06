import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Download, Eye, FileText, Paperclip, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useClients } from "@/hooks/use-data";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_app/portal/documentos")({ component: ClientDocumentsPortal });
type Branch = { id: string; name: string; cnpj: string | null };
type Doc = { id: string; client_id: string; branch_id: string | null; title: string; description: string | null; file_name: string; storage_path: string; expires_at: string | null; notify_days_before: number; active: boolean };
const day = 86_400_000;
const daysUntil = (date: string) => Math.round((Date.parse(`${date}T00:00:00`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00`)) / day);

function ClientDocumentsPortal() {
  const { data: clients = [] } = useClients();
  const { isClient, clientId: linkedClientId, hasPermission } = useAuth();
  const qc = useQueryClient();
  const editInputRef = useRef<HTMLInputElement>(null);
  const [clientId, setClientId] = useState("");
  const [branchId, setBranchId] = useState("matrix");
  const [preview, setPreview] = useState<{ doc: Doc; url: string } | null>(null);
  const [editing, setEditing] = useState<Doc | null>(null);
  const [editFile, setEditFile] = useState<File | null>(null);
  const [savingDoc, setSavingDoc] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", description: "", branchId: "matrix", expiresAt: "", notifyDays: "30" });
  const startEdit = (doc: Doc) => {
    setEditing(doc);
    setEditFile(null);
    setPreview(null);
    setEditForm({ title: doc.title, description: doc.description ?? "", branchId: doc.branch_id ?? "matrix", expiresAt: doc.expires_at ?? "", notifyDays: String(doc.notify_days_before ?? 30) });
  };
  const invalidateDocs = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["portal-client-documents"] }),
      qc.invalidateQueries({ queryKey: ["document-alerts"] }),
      qc.invalidateQueries({ queryKey: ["client-documents"] }),
    ]);
  };
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
  useEffect(() => { if (isClient) setClientId(linkedClientId ?? ""); else if (!clientId && clients[0]) setClientId(clients[0].id); }, [clientId, clients, isClient, linkedClientId]);
  useEffect(() => { setBranchId("matrix"); setPreview(null); }, [clientId]);
  const { data: branches = [] } = useQuery({ queryKey: ["client-branches", clientId], enabled: !!clientId, queryFn: async () => { const { data, error } = await (supabase.from("client_branches") as any).select("id,name,cnpj").eq("client_id", clientId).eq("is_active", true).order("name"); if (error) throw error; return (data ?? []) as Branch[]; } });
  const { data: alertBranches = [] } = useQuery({ queryKey: ["document-alert-branches"], queryFn: async () => { const { data, error } = await (supabase.from("client_branches") as any).select("id,name,cnpj").eq("is_active", true); if (error) throw error; return (data ?? []) as Branch[]; } });
  const { data: alertDocuments = [] } = useQuery({ queryKey: ["document-alerts"], queryFn: async () => { const { data, error } = await (supabase.from("client_documents") as any).select("id,client_id,branch_id,title,description,file_name,storage_path,expires_at,notify_days_before,active").eq("active", true).not("expires_at", "is", null).order("expires_at", { ascending: true }); if (error) throw error; return (data ?? []) as Doc[]; } });
  const { data: documents = [] } = useQuery({ queryKey: ["portal-client-documents", clientId, branchId], enabled: !!clientId, queryFn: async () => { let request = (supabase.from("client_documents") as any).select("id,client_id,branch_id,title,description,file_name,storage_path,expires_at,notify_days_before,active").eq("client_id", clientId).eq("active", true); request = branchId === "matrix" ? request.is("branch_id", null) : request.eq("branch_id", branchId); const { data, error } = await request.order("expires_at", { ascending: true, nullsFirst: false }); if (error) throw error; return (data ?? []) as Doc[]; } });
  const today = new Date().toISOString().slice(0, 10);
  const activeDocs = useMemo(() => documents.filter((doc) => !doc.expires_at || doc.expires_at >= today), [documents, today]);
  const manageDocs = hasPermission("documents") && !isClient;
  const displayDocs = manageDocs ? documents : activeDocs;
  const alerts = useMemo(() => alertDocuments.filter((doc) => { const days = daysUntil(doc.expires_at!); return days < 0 || days <= Number(doc.notify_days_before || 0); }), [alertDocuments]);
  const previewDocument = async (doc: Doc) => { const { data, error } = await supabase.storage.from("client-documents").createSignedUrl(doc.storage_path, 600); if (error || !data?.signedUrl) return toast.error(error?.message || "Não foi possível visualizar o documento."); setPreview({ doc, url: data.signedUrl }); };
  const download = async (doc: Doc) => { const { data, error } = await supabase.storage.from("client-documents").createSignedUrl(doc.storage_path, 600, { download: doc.file_name }); if (error || !data?.signedUrl) return toast.error(error?.message || "Não foi possível baixar o documento."); window.open(data.signedUrl, "_blank", "noopener,noreferrer"); };
  const client = clients.find((item) => item.id === clientId);
  const selectedBranch = branches.find((item) => item.id === branchId);
  const clientName = (id: string) => clients.find((item) => item.id === id)?.name ?? "Cliente";
  const unitName = (id: string | null) => id ? alertBranches.find((item) => item.id === id)?.name ?? "Filial" : "Matriz";

  return <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
    <header><p className="text-sm font-medium text-primary">Portal do Cliente</p><h1 className="text-2xl font-bold">Documentos</h1><p className="text-sm text-muted-foreground">Veja primeiro os documentos que exigem atenção e, depois, consulte uma empresa ou unidade.</p></header>
    {alerts.length > 0 && <Card className="border-destructive/40 bg-destructive/5 p-5"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" /><div className="min-w-0 flex-1"><h2 className="font-semibold text-destructive">Documentos em alerta ({alerts.length})</h2><p className="mt-1 text-sm text-muted-foreground">Vencidos ou dentro do prazo de aviso configurado.</p><div className="mt-3 space-y-2">{alerts.slice(0, 8).map((doc) => { const days = daysUntil(doc.expires_at!); const state = days < 0 ? `Vencido há ${Math.abs(days)} dia${Math.abs(days) === 1 ? "" : "s"}` : days === 0 ? "Vence hoje" : `Vence em ${days} dia${days === 1 ? "" : "s"}`; return <div key={doc.id} className="flex flex-wrap items-center gap-3 rounded-md bg-background/80 p-3"><FileText className="h-5 w-5 text-destructive" /><div className="min-w-0 flex-1"><p className="font-medium">{doc.title}</p><p className="text-sm text-muted-foreground">{clientName(doc.client_id)} · {unitName(doc.branch_id)} · {state}</p></div><Button size="sm" variant="outline" onClick={() => void previewDocument(doc)}><Eye className="mr-2 h-4 w-4" />Visualizar</Button></div>; })}{alerts.length > 8 && <p className="text-sm text-muted-foreground">E mais {alerts.length - 8} documento(s) em alerta.</p>}</div></div></div></Card>}
    <Card className="grid gap-4 p-4 sm:grid-cols-2">{!isClient && <div className="space-y-1.5"><Label>Cliente</Label><Select value={clientId} onValueChange={setClientId}><SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger><SelectContent>{clients.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>}<div className="space-y-1.5"><Label>Unidade / CNPJ</Label><Select value={branchId} onValueChange={setBranchId} disabled={!clientId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="matrix">Matriz{client?.cnpj ? ` · ${client.cnpj}` : ""}</SelectItem>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}{branch.cnpj ? ` · ${branch.cnpj}` : ""}</SelectItem>)}</SelectContent></Select></div></Card>
    {editing && manageDocs && <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between"><h2 className="font-semibold">Editar documento</h2><Button variant="ghost" size="icon" onClick={() => { setEditing(null); setEditFile(null); }} title="Fechar"><X className="h-4 w-4" /></Button></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label>Unidade *</Label><Select value={editForm.branchId} onValueChange={(value) => setEditForm({ ...editForm, branchId: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="matrix">Matriz</SelectItem>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}{branch.cnpj ? ` · ${branch.cnpj}` : ""}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Nome do documento</Label><Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} placeholder="Ex.: Licença ambiental" /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label>Vencimento</Label><Input type="date" value={editForm.expiresAt} onChange={(e) => setEditForm({ ...editForm, expiresAt: e.target.value })} /></div>
        <div className="space-y-2"><Label>Notificar antes</Label><Input type="number" min="0" value={editForm.notifyDays} onChange={(e) => setEditForm({ ...editForm, notifyDays: e.target.value })} /><p className="text-xs text-muted-foreground">dias antes do vencimento</p></div>
      </div>
      <div className="space-y-2"><Label>Descrição</Label><Textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} placeholder="Observações opcionais" /></div>
      <div className="space-y-2"><Label>Arquivo</Label><input ref={editInputRef} type="file" className="hidden" onChange={(e) => setEditFile(e.target.files?.[0] ?? null)} /><Button type="button" variant="outline" onClick={() => editInputRef.current?.click()}><Paperclip className="mr-2 h-4 w-4" />{editFile ? "Trocar arquivo" : "Substituir arquivo"}</Button><span className="ml-3 text-sm text-muted-foreground">{editFile?.name ?? editing.file_name}</span></div>
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={savingDoc} onClick={() => { setEditing(null); setEditFile(null); }}>Cancelar</Button><Button disabled={savingDoc} onClick={() => void saveEdit()}>{savingDoc ? "Salvando…" : "Salvar documento"}</Button></div>
    </Card>}
    <section className="space-y-3"><h2 className="text-lg font-semibold">{branchId === "matrix" ? client?.name ?? "Matriz" : selectedBranch?.name ?? "Filial"}</h2>{displayDocs.map((doc) => <Card key={doc.id} className="flex flex-wrap items-center gap-3 p-4"><FileText className={doc.expires_at && doc.expires_at < today ? "text-destructive" : "text-primary"} /><div className="min-w-0 flex-1"><p className="font-medium">{doc.title}</p><p className="text-sm text-muted-foreground">{doc.description || doc.file_name}{doc.expires_at ? (doc.expires_at < today ? ` · Vencido em ${doc.expires_at}` : ` · Vigente até ${doc.expires_at}`) : ""}</p></div><Button variant="outline" onClick={() => void previewDocument(doc)}><Eye className="mr-2 h-4 w-4" />Visualizar</Button><Button variant="outline" onClick={() => void download(doc)}><Download className="mr-2 h-4 w-4" />Baixar</Button>{manageDocs && <><Button size="icon" variant="ghost" onClick={() => startEdit(doc)} title="Editar documento"><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => void removeDoc(doc)} title="Excluir documento"><Trash2 className="h-4 w-4 text-destructive" /></Button></>}</Card>)}{clientId && !displayDocs.length && <Card className="p-10 text-center text-sm text-muted-foreground">Nenhum documento cadastrado para esta unidade.</Card>}</section>
    {preview && <Card className="overflow-hidden"><div className="flex items-center justify-between border-b p-3"><div className="min-w-0"><p className="truncate font-medium">{preview.doc.title}</p><p className="truncate text-sm text-muted-foreground">{preview.doc.file_name}</p></div><Button variant="ghost" size="icon" onClick={() => setPreview(null)} title="Fechar visualização"><X className="h-4 w-4" /></Button></div><iframe title={`Visualização de ${preview.doc.title}`} src={preview.url} className="h-[72vh] w-full bg-white" /><div className="border-t p-3"><Button variant="outline" onClick={() => void download(preview.doc)}><Download className="mr-2 h-4 w-4" />Baixar documento</Button></div></Card>}
  </div>;
}
