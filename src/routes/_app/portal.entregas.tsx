import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Download, FileText, Paperclip, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { type Task, useClients, useTasks } from "@/hooks/use-data";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/portal/entregas")({ component: ClientDeliveriesPage });

function ClientDeliveriesPage() {
  const { data: clients = [] } = useClients();
  const { isClient, clientId: linkedClientId, user } = useAuth();
  const { data: tasks = [] } = useTasks();
  const [clientId, setClientId] = useState("");
  const [month, setMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [requestFiles, setRequestFiles] = useState<{ id: string; file_name: string; storage_path: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    if (isClient) setClientId(linkedClientId ?? "");
    else if (!clientId && clients[0]) setClientId(clients[0].id);
  }, [clientId, clients, isClient, linkedClientId]);

  const selectDate = (value: string) => {
    setSelectedDate(value);
    if (value) setMonth(new Date(`${value}T12:00:00`));
  };

  useEffect(() => {
    if (!selectedTask) { setRequestFiles([]); return; }
    void supabase.from("attachments").select("id,file_name,storage_path").eq("task_id", selectedTask.id).order("created_at").then(({ data, error }: { data: { id: string; file_name: string; storage_path: string }[] | null; error: { message: string } | null }) => {
      if (error) return toast.error(error.message);
      setRequestFiles((data ?? []) as { id: string; file_name: string; storage_path: string }[]);
    });
  }, [selectedTask]);

  const uploadResponse = async (file?: File) => {
    if (!file || !selectedTask || !user) return;
    setUploading(true);
    const path = `${selectedTask.id}/cliente-${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("task-attachments").upload(path, file);
    if (uploadError) { setUploading(false); return toast.error(uploadError.message); }
    const { data, error } = await supabase.from("attachments").insert({
      task_id: selectedTask.id, file_name: file.name, storage_path: path,
      mime_type: file.type || null, size_bytes: file.size, uploaded_by: user.id,
    }).select("id,file_name,storage_path").single();
    setUploading(false);
    if (error) return toast.error(error.message);
    setRequestFiles((current) => [...current, data as { id: string; file_name: string; storage_path: string }]);
    toast.success("Documento enviado para a equipe Jacoby.");
  };

  const downloadResponse = async (file: { file_name: string; storage_path: string }) => {
    const { data, error } = await supabase.storage.from("task-attachments").createSignedUrl(file.storage_path, 600, { download: file.file_name });
    if (error || !data?.signedUrl) return toast.error(error?.message || "Não foi possível baixar o arquivo.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const client = clients.find((item) => item.id === clientId);
  const deliveries = useMemo(() => tasks.filter((task) => task.client_id === clientId && task.client_portal_visible && task.client_document_request), [clientId, tasks]);
  const dueState = (dueDate: string | null) => {
    if (!dueDate) return { label: "Sem prazo", cls: "bg-muted text-muted-foreground" };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate); due.setHours(0, 0, 0, 0);
    const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
    if (days < 0) return { label: `Vencido há ${Math.abs(days)} dia${Math.abs(days) === 1 ? "" : "s"}`, cls: "bg-destructive text-destructive-foreground" };
    if (days === 0) return { label: "Vence hoje", cls: "bg-destructive/90 text-destructive-foreground" };
    if (days === 1) return { label: "Vence amanhã", cls: "bg-amber-500 text-amber-950" };
    if (days <= 7) return { label: `Vence em ${days} dias`, cls: "bg-amber-500/90 text-amber-950" };
    return { label: `Prazo: ${format(due, "dd/MM/yyyy")}`, cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300" };
  };
  const deliveriesByDay = useMemo(() => {
    const map = new Map<string, typeof deliveries>();
    deliveries.forEach((task) => {
      const key = format(new Date(task.due_date!), "yyyy-MM-dd");
      map.set(key, [...(map.get(key) ?? []), task]);
    });
    return map;
  }, [deliveries]);
  const days = useMemo(() => eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) }), [month]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header><p className="text-sm font-medium text-primary">Portal do Cliente</p><h1 className="text-2xl font-bold">Solicitações de documentos</h1><p className="text-sm text-muted-foreground">Veja somente os documentos solicitados pela equipe Jacoby e seus respectivos prazos.</p></header>
      {isClient ? <Card className="p-4"><p className="text-sm text-muted-foreground">Cliente vinculado</p><p className="mt-1 font-semibold">{client?.name ?? "Cliente não vinculado"}</p></Card> : <Card className="p-4"><p className="mb-2 text-sm font-medium">Cliente</p><Select value={clientId} onValueChange={setClientId}><SelectTrigger className="max-w-md"><SelectValue placeholder="Selecione o cliente" /></SelectTrigger><SelectContent>{clients.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></Card>}
      {!clientId ? <Empty text="Cadastre ou selecione um cliente para ver as solicitações." /> : <Card className="overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">Documentos solicitados para {client?.name}</h2><p className="text-sm capitalize text-muted-foreground">{format(month, "MMMM 'de' yyyy", { locale: ptBR })}</p></div><div className="flex flex-wrap items-center gap-1"><label className="sr-only" htmlFor="delivery-date">Escolher data</label><Input id="delivery-date" type="date" value={selectedDate} onChange={(event) => selectDate(event.target.value)} className="h-9 w-[150px]" /><Button size="icon" variant="outline" aria-label="Mês anterior" onClick={() => setMonth((current) => subMonths(current, 1))}><ChevronLeft className="h-4 w-4" /></Button><Button size="sm" variant="outline" onClick={() => { const today = new Date(); setMonth(today); setSelectedDate(format(today, "yyyy-MM-dd")); }}>Hoje</Button><Button size="icon" variant="outline" aria-label="Próximo mês" onClick={() => setMonth((current) => addMonths(current, 1))}><ChevronRight className="h-4 w-4" /></Button></div></div><div className="divide-y">{deliveries.length ? [...deliveries].sort((a,b) => (a.due_date || "").localeCompare(b.due_date || "")).map((task) => { const deadline = dueState(task.due_date); return <button key={task.id} onClick={() => setSelectedTask(task)} className="flex w-full items-start gap-3 p-4 text-left hover:bg-muted/40"><FileText className="mt-0.5 h-5 w-5 text-primary" /><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="font-medium">{task.title}</span><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${deadline.cls}`}>{deadline.label}</span></span><span className="mt-1 block text-sm text-muted-foreground">{task.description || "Abra para ver os detalhes da solicitação."}</span></span></button>; }) : <Empty text="Nenhum documento foi solicitado no momento." />}</div></Card>}
      <Dialog open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTask(null)}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{selectedTask?.title}</DialogTitle></DialogHeader>{selectedTask?.description && <div className="text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: selectedTask.description }} />}{selectedTask?.due_date && <p className="text-sm text-muted-foreground">Prazo: {format(new Date(selectedTask.due_date), "dd/MM/yyyy")}</p>}<div className="space-y-3 border-t pt-4"><div><p className="font-medium">Arquivos da solicitação e resposta</p><p className="text-sm text-muted-foreground">Envie os documentos solicitados por aqui. Eles ficam disponíveis para a equipe Jacoby na mesma tarefa.</p></div>{requestFiles.length > 0 && <div className="space-y-2">{requestFiles.map((file) => <div key={file.id} className="flex items-center gap-2 rounded border p-2 text-sm"><Paperclip className="h-4 w-4 text-primary" /><span className="min-w-0 flex-1 truncate">{file.file_name}</span><Button size="sm" variant="outline" onClick={() => void downloadResponse(file)}><Download className="mr-1 h-3.5 w-3.5" />Baixar</Button></div>)}</div>}<label className="inline-flex cursor-pointer items-center gap-2"><Button type="button" variant="outline" disabled={uploading} asChild><span><Upload className="mr-2 h-4 w-4" />{uploading ? "Enviando..." : "Enviar documento"}</span></Button><input className="sr-only" type="file" disabled={uploading} onChange={(event) => { void uploadResponse(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label></div></DialogContent></Dialog>
    </div>
  );
}
function Empty({ text }: { text: string }) { return <Card className="p-10 text-center text-sm text-muted-foreground">{text}</Card>; }
