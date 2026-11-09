/** Administração das unidades vinculadas à empresa matriz (filiais e pátios). */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

type Branch = {
  id: string; client_id: string; name: string; legal_name: string | null; cnpj: string | null;
  address: string | null; responsible: string | null; phone: string | null; email: string | null; is_active: boolean;
};
type BranchForm = { [Key in keyof Omit<Branch, "id" | "client_id">]: NonNullable<Branch[Key]> };
const blank = (): BranchForm => ({ name: "", legal_name: "", cnpj: "", address: "", responsible: "", phone: "", email: "", is_active: true });

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1.5"><Label>{label}</Label>{children}</label>;
}

export function ClientBranchesManager({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<BranchForm>(blank);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { data: branches = [], isLoading } = useQuery({
    queryKey: ["client-branches", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("client_branches") as any).select("*").eq("client_id", clientId).eq("is_active", true).order("name");
      if (error) throw error;
      return (data ?? []) as Branch[];
    },
  });
  const update = (key: keyof BranchForm, value: string | boolean) => setForm((old) => ({ ...old, [key]: value }));
  const reset = () => { setEditingId(null); setForm(blank()); };
  const edit = (branch: Branch) => {
    setEditingId(branch.id);
    setForm({ name: branch.name, legal_name: branch.legal_name ?? "", cnpj: branch.cnpj ?? "", address: branch.address ?? "", responsible: branch.responsible ?? "", phone: branch.phone ?? "", email: branch.email ?? "", is_active: branch.is_active });
  };
  const save = async () => {
    if (!form.name.trim()) return toast.error("Informe o nome da filial ou pátio.");
    setSaving(true);
    const payload = { ...form, name: form.name.trim(), cnpj: form.cnpj.trim() || null, legal_name: form.legal_name.trim() || null, address: form.address.trim() || null, responsible: form.responsible.trim() || null, phone: form.phone.trim() || null, email: form.email.trim() || null };
    const request = editingId
      ? (supabase.from("client_branches") as any).update(payload).eq("id", editingId)
      : (supabase.from("client_branches") as any).insert({ ...payload, client_id: clientId });
    const { error } = await request;
    setSaving(false);
    if (error) return toast.error(error.message.includes("client_branches_client_cnpj_key") ? "Este CNPJ já está cadastrado para este cliente." : error.message);
    await qc.invalidateQueries({ queryKey: ["client-branches", clientId] });
    toast.success(editingId ? "Unidade atualizada." : "Unidade cadastrada.");
    reset();
  };
  const remove = async (branch: Branch) => {
    if (!confirm(`Remover a unidade “${branch.name}” das opções ativas? Os boletins antigos serão preservados.`)) return;
    const { error } = await (supabase.from("client_branches") as any).update({ is_active: false }).eq("id", branch.id);
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["client-branches", clientId] });
    toast.success("Unidade removida das opções ativas. O histórico dos boletins foi preservado.");
  };
  return <div className="space-y-6">
    <div><h2 className="text-lg font-semibold">Filiais e pátios</h2><p className="text-sm text-muted-foreground">Cadastre cada unidade pelo seu CNPJ. O mesmo login do cliente poderá visualizar todas elas no portal.</p></div>
    <Card className="p-5"><div className="mb-4 flex items-center gap-2 font-medium"><Building2 className="h-4 w-4 text-primary" />{editingId ? "Editar unidade" : "Nova unidade"}</div><div className="grid gap-4 md:grid-cols-2"><Field label="Nome da filial ou pátio *"><Input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Ex.: Pátio Campinas" /></Field><Field label="CNPJ"><Input value={form.cnpj} onChange={(e) => update("cnpj", e.target.value)} placeholder="00.000.000/0001-00" /></Field><Field label="Razão social"><Input value={form.legal_name} onChange={(e) => update("legal_name", e.target.value)} /></Field><Field label="Responsável"><Input value={form.responsible} onChange={(e) => update("responsible", e.target.value)} /></Field><Field label="Telefone"><Input value={form.phone} onChange={(e) => update("phone", e.target.value)} /></Field><Field label="E-mail"><Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} /></Field><div className="md:col-span-2"><Field label="Endereço"><Input value={form.address} onChange={(e) => update("address", e.target.value)} /></Field></div></div><div className="mt-4 flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(checked) => update("is_active", checked)} id="branch-active" /><Label htmlFor="branch-active">Unidade ativa no portal</Label></div><div className="mt-5 flex justify-end gap-2">{editingId && <Button variant="outline" onClick={reset}>Cancelar</Button>}<Button onClick={() => void save()} disabled={saving}><Plus className="mr-2 h-4 w-4" />{saving ? "Salvando..." : editingId ? "Salvar unidade" : "Cadastrar unidade"}</Button></div></Card>
    <Card className="overflow-hidden"><div className="border-b px-5 py-3 font-medium">Unidades ativas</div>{isLoading ? <p className="p-5 text-sm text-muted-foreground">Carregando...</p> : !branches.length ? <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma filial ou pátio cadastrado.</p> : <div className="divide-y">{branches.map((branch) => <div key={branch.id} className="flex flex-wrap items-center gap-3 p-4"><Building2 className="h-5 w-5 text-primary" /><div className="min-w-0 flex-1"><p className="font-medium">{branch.name}</p><p className="text-sm text-muted-foreground">{[branch.cnpj && `CNPJ ${branch.cnpj}`, branch.address, branch.responsible].filter(Boolean).join(" · ") || "Sem dados complementares"}</p></div><Button size="icon" variant="ghost" title="Editar unidade" onClick={() => edit(branch)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" title="Remover unidade" onClick={() => void remove(branch)}><Trash2 className="h-4 w-4" /></Button></div>)}</div>}</Card>
  </div>;
}
