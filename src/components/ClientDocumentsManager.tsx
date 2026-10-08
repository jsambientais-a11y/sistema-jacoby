/** Documentos separados entre matriz e cada filial/pátio do cliente. */
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Paperclip, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Branch = { id: string; name: string; cnpj: string | null };
type ClientDocument = {
  id: string; branch_id: string | null; title: string; description: string | null;
  file_name: string; storage_path: string; expires_at: string | null;
  notify_days_before: number; notify_daily_until_resolved: boolean; active: boolean;
};

const empty = { title: "", description: "", expiresAt: "", notifyDays: "30", notifyDaily: true, branchId: "matrix" };
const safeName = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120) || "documento";
const isConnectionFailure = (message?: string) => /failed to fetch|networkerror|network request failed/i.test(message ?? "");
const documentErrorMessage = (error: { message?: string } | null) =>
  isConnectionFailure(error?.message)
    ? "Não foi possível concluir o envio por instabilidade de conexão. Atualize a página, entre novamente se necessário e tente outra vez."
    : error?.message || "Não foi possível salvar o documento.";

export function ClientDocumentsManager({ clientId }: { clientId: string }) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("documents");
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClientDocument | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(empty);
  const [unitFilter, setUnitFilter] = useState("all");
  const { data: branches = [] } = useQuery({
    queryKey: ["client-branches", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("client_branches") as any).select("id,name,cnpj").eq("client_id", clientId).order("name");
      if (error) throw error;
      return (data ?? []) as Branch[];
    },
  });
  const { data: documents = [] } = useQuery({
    queryKey: ["client-documents", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("client_documents") as any).select("*").eq("client_id", clientId).order("expires_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as ClientDocument[];
    },
  });

  const close = () => { setOpen(false); setEditing(null); setFile(null); setForm(empty); };
  const create = () => { close(); setOpen(true); };
  const edit = (doc: ClientDocument) => {
    setEditing(doc); setFile(null);
    setForm({ title: doc.title, description: doc.description ?? "", expiresAt: doc.expires_at ?? "", notifyDays: String(doc.notify_days_before), notifyDaily: doc.notify_daily_until_resolved !== false, branchId: doc.branch_id ?? "matrix" });
    setOpen(true);
  };
  const unitName = (branchId: string | null) => branchId ? branches.find((branch) => branch.id === branchId)?.name ?? "Filial" : "Matriz";
  const shown = documents.filter((doc) => unitFilter === "all" || (unitFilter === "matrix" ? !doc.branch_id : doc.branch_id === unitFilter));

  const uploadFile = async (storagePath: string, selectedFile: File) => {
    const options = { contentType: selectedFile.type || "application/octet-stream" };
    let result = await supabase.storage.from("client-documents").upload(storagePath, selectedFile, options);
    if (!result.error || !isConnectionFailure(result.error.message)) return result.error;

    // Sessões que ficaram abertas por muitas horas podem falhar no primeiro
    // envio sem retornar o erro real. Renova o acesso e tenta uma única vez.
    await supabase.auth.refreshSession();
    result = await supabase.storage.from("client-documents").upload(storagePath, selectedFile, options);
    if (result.error && /already exists|resource.*exists|duplicate/i.test(result.error.message)) return null;
    return result.error;
  };

  const save = async () => {
    if (!form.title.trim()) return toast.error("Informe o nome do documento.");
    if (!editing && !file) return toast.error("Anexe o arquivo do documento.");
    setSaving(true);
    let storagePath = editing?.storage_path;
    let uploadedNewFile = false;
    try {
      let fileName = editing?.file_name;
      if (file) {
        storagePath = `${clientId}/${Date.now()}-${safeName(file.name)}`;
        const uploadError = await uploadFile(storagePath, file);
        if (uploadError) {
          console.error("Falha ao enviar documento", { stage: "storage", message: uploadError.message, size: file.size, type: file.type });
          return toast.error(documentErrorMessage(uploadError));
        }
        uploadedNewFile = true;
        fileName = file.name;
      }
      const data = {
        client_id: clientId, branch_id: form.branchId === "matrix" ? null : form.branchId,
        title: form.title.trim(), description: form.description.trim() || null,
        storage_path: storagePath, file_name: fileName, expires_at: form.expiresAt || null,
        notify_days_before: Math.max(0, Number.parseInt(form.notifyDays, 10) || 0),
        notify_daily_until_resolved: form.notifyDaily, active: true,
      };
      const result = editing
        ? await (supabase.from("client_documents") as any).update(data).eq("id", editing.id)
        : await (supabase.from("client_documents") as any).insert(data);
      if (result.error) {
        console.error("Falha ao salvar documento", { stage: "database", message: result.error.message });
        if (uploadedNewFile && storagePath) await supabase.storage.from("client-documents").remove([storagePath]);
        return toast.error(documentErrorMessage(result.error));
      }
      await (supabase.rpc("jacoby_process_document_alerts") as any);
      if (file && editing?.storage_path && editing.storage_path !== storagePath) await supabase.storage.from("client-documents").remove([editing.storage_path]);
      await qc.invalidateQueries({ queryKey: ["client-documents", clientId] });
      close();
      toast.success(editing ? "Documento atualizado." : "Documento anexado.");
    } catch (error) {
      console.error("Falha inesperada ao salvar documento", error);
      if (uploadedNewFile && storagePath) await supabase.storage.from("client-documents").remove([storagePath]);
      toast.error(documentErrorMessage(error instanceof Error ? error : null));
    } finally {
      setSaving(false);
    }
  };
  const remove = async (doc: ClientDocument) => {
    if (!confirm(`Excluir o documento “${doc.title}”?`)) return;
    const { error } = await (supabase.from("client_documents") as any).delete().eq("id", doc.id);
    if (error) return toast.error(error.message);
    await supabase.storage.from("client-documents").remove([doc.storage_path]);
    await qc.invalidateQueries({ queryKey: ["client-documents", clientId] });
    toast.success("Documento excluído.");
  };
  const today = new Date().toISOString().slice(0, 10);

  return <section className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-semibold">Controle de documentos</h2><p className="text-sm text-muted-foreground">Anexe cada documento à matriz ou à filial/pátio correto.</p></div>
      {!open && <Button onClick={create}><Plus className="mr-2 h-4 w-4" />Adicionar documento</Button>}
    </div>
    {!open && <div className="max-w-sm space-y-1.5"><Label>Consultar documentos de</Label><Select value={unitFilter} onValueChange={setUnitFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as unidades</SelectItem><SelectItem value="matrix">Matriz</SelectItem>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}{branch.cnpj ? ` · ${branch.cnpj}` : ""}</SelectItem>)}</SelectContent></Select></div>}
    {open && <Card className="space-y-4 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label>Unidade *</Label><Select value={form.branchId} onValueChange={(branchId) => setForm({ ...form, branchId })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="matrix">Matriz</SelectItem>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}{branch.cnpj ? ` · ${branch.cnpj}` : ""}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Nome do documento</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Licença ambiental" /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label>Vencimento</Label><Input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></div>
        <div className="space-y-2"><Label>Notificar antes</Label><Input type="number" min="0" value={form.notifyDays} onChange={(e) => setForm({ ...form, notifyDays: e.target.value })} /><p className="text-xs text-muted-foreground">dias antes do vencimento</p></div>
      </div>
      <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3">
        <Checkbox id="notify-daily-until-resolved" checked={form.notifyDaily} onCheckedChange={(notifyDaily) => setForm({ ...form, notifyDaily: notifyDaily === true })} />
        <div className="space-y-1"><Label htmlFor="notify-daily-until-resolved" className="cursor-pointer">Notificar todos os dias até regularizar</Label><p className="text-xs text-muted-foreground">Se desmarcado, o sistema avisa uma vez quando entrar no prazo definido. O alerta continua no Dashboard mesmo após o vencimento.</p></div>
      </div>
      <div className="space-y-2"><Label>Descrição</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Observações opcionais" /></div>
      <div className="space-y-2"><Label>Arquivo</Label><input ref={inputRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /><Button type="button" variant="outline" onClick={() => inputRef.current?.click()}><Paperclip className="mr-2 h-4 w-4" />{file ? "Trocar arquivo" : editing ? "Substituir arquivo" : "Anexar arquivo"}</Button><span className="ml-3 text-sm text-muted-foreground">{file?.name ?? editing?.file_name ?? "Todos os formatos são aceitos"}</span></div>
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={saving} onClick={close}>Cancelar</Button><Button disabled={saving} onClick={save}>{saving ? "Salvando…" : "Salvar documento"}</Button></div>
    </Card>}
    <div className="space-y-2">{shown.map((doc) => {
      const expired = !!doc.expires_at && doc.expires_at < today;
      return <Card key={doc.id} className="flex flex-wrap items-center gap-3 p-4"><FileText className={expired ? "text-destructive" : "text-primary"} /><div className="min-w-0 flex-1"><p className="font-medium">{doc.title}</p><p className="truncate text-sm text-muted-foreground">{unitName(doc.branch_id)} · {doc.file_name}{doc.expires_at ? ` · Vence em ${doc.expires_at}` : " · Sem vencimento"} · {doc.notify_daily_until_resolved !== false ? "Alerta diário" : "Alerta único"}</p></div><span className={`rounded-full px-2 py-1 text-xs font-medium ${expired ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>{expired ? "Vencido" : "Vigente"}</span>{canManage && <><Button size="icon" variant="ghost" onClick={() => edit(doc)} title="Editar documento"><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => remove(doc)} title="Excluir documento"><Trash2 className="h-4 w-4 text-destructive" /></Button></>}</Card>;
    })}{!shown.length && <Card className="border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum documento cadastrado para esta unidade.</Card>}</div>
  </section>;
}
