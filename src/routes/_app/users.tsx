import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useClients, useProfiles } from "@/hooks/use-data";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { ChevronDown, KeyRound, Plus, ShieldCheck, User as UserIcon, UserCheck, UserX } from "lucide-react";

export const Route = createFileRoute("/_app/users")({ component: UsersPage });

const ACCESS_OPTIONS = [
  ["dashboard", "Dashboard"],
  ["tasks", "Gestão de Projetos"],
  ["clients", "Clientes"],
  ["outsourced", "Terceirizados"],
  ["reports", "Relatórios"],
  ["documents", "Documentos"],
  ["portal_units", "Portal do Cliente · Unidades e pátios"],
  ["portal_reports", "Portal do Cliente · Relatórios"],
  ["billing", "Faturamento"],
  ["movement_settings", "Configurações de movimentação"],
  ["trash", "Lixeira"],
  ["settings", "Personalizar"],
] as const;
type Role = "admin" | "collaborator" | "client";
type FormState = { fullName: string; email: string; password: string; role: Role; permissions: string[]; clientId: string };
const defaults: FormState = { fullName: "", email: "", password: "", role: "collaborator", permissions: ["dashboard", "tasks"], clientId: "" };
const roleLabel: Record<Role, string> = { admin: "Administrador", collaborator: "Colaboradores", client: "Cliente" };

function UserCategorySection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
        >
          <span className="flex items-center gap-2 font-semibold">
            {title}
            <Badge variant="secondary">{count}</Badge>
          </span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t p-4">
          {count > 0 ? children : <p className="text-sm text-muted-foreground">Nenhum usuário nesta categoria.</p>}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function AccessForm({ value, onChange, includeCredentials = false, passwordRequired = true }: { value: FormState; onChange: (next: FormState) => void; includeCredentials?: boolean; passwordRequired?: boolean }) {
  const { data: clients = [] } = useClients();
  const toggle = (permission: string) => onChange({ ...value, permissions: value.permissions.includes(permission) ? value.permissions.filter((item) => item !== permission) : [...value.permissions, permission] });
  return <div className="space-y-4">
    {includeCredentials && <><div className="space-y-2"><Label>Nome completo</Label><Input value={value.fullName} onChange={(e) => onChange({ ...value, fullName: e.target.value })} required /></div><div className="space-y-2"><Label>Login (e-mail)</Label><Input type="email" value={value.email} onChange={(e) => onChange({ ...value, email: e.target.value })} required /></div><div className="space-y-2"><Label>{passwordRequired ? "Senha provisória" : "Nova senha (opcional)"}</Label><Input type="password" minLength={6} autoComplete="new-password" value={value.password} onChange={(e) => onChange({ ...value, password: e.target.value })} required={passwordRequired} placeholder={passwordRequired ? "Mínimo de 6 caracteres" : "Deixe em branco para manter a senha atual"} />{!passwordRequired && <p className="text-xs text-muted-foreground">Por segurança, a senha anterior não é exibida. Preencha apenas se quiser substituí-la.</p>}</div></>}
    <div className="space-y-2"><Label>Categoria</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={value.role} onChange={(e) => onChange({ ...value, role: e.target.value as Role, permissions: e.target.value === "client" ? ["portal"] : value.permissions })}><option value="collaborator">Colaboradores</option><option value="client">Cliente</option><option value="admin">Administrador</option></select></div>
    {value.role === "client" && <div className="space-y-2"><Label>Cliente vinculado</Label><select required className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={value.clientId} onChange={(e) => onChange({ ...value, clientId: e.target.value })}><option value="">Selecione o cliente</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select><p className="text-xs text-muted-foreground">Este usuário verá somente as tarefas e faturas deste cliente.</p></div>}
    <div className="space-y-2"><Label>Acessos do sistema</Label><p className="text-xs text-muted-foreground">Marque somente as áreas que este colaborador poderá usar. Usuários e Arquivos do OneDrive continuam exclusivos da administradora.</p><div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">{ACCESS_OPTIONS.map(([key, label]) => <label key={key} className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={value.role === "admin" || value.permissions.includes(key)} disabled={value.role === "admin" || value.role === "client"} onCheckedChange={() => toggle(key)} />{label}</label>)}</div></div>
  </div>;
}

function UsersPage() {
  const { isAdmin, user, loading } = useAuth(); const qc = useQueryClient(); const { data: profiles = [] } = useProfiles();
  const [createOpen, setCreateOpen] = useState(false); const [editing, setEditing] = useState<string | null>(null); const [form, setForm] = useState<FormState>(defaults);
  const [resetTarget, setResetTarget] = useState<any | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const { data: roles = [] } = useQuery({ queryKey: ["roles"], queryFn: async () => (await supabase.from("user_roles").select("user_id, role")).data ?? [] });
  // The e-mail is intentionally read through an admin-only RPC: the regular
  // profiles query never exposes other users' addresses to collaborators.
  const { data: profileEmails = [] } = useQuery({
    queryKey: ["admin_profile_emails"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc("admin_get_profile_emails") as any);
      if (error) throw error;
      return (data ?? []) as { id: string; email: string | null }[];
    },
  });
  const { data: clientLinks = [] } = useQuery({ queryKey: ["client_user_links"], queryFn: async () => ((await (supabase.from("client_user_links" as any) as any).select("user_id, client_id")).data ?? []) as { user_id: string; client_id: string }[] });
  const { data: permissionRows = [] } = useQuery({ queryKey: ["user_permissions"], queryFn: async () => ((await (supabase.from("user_permissions") as any).select("user_id, permissions")).data ?? []) as { user_id: string; permissions: string[] }[] });
  const invokeAccessManager = async (action: "create" | "update", data: Record<string, unknown>) => {
    const { data: result, error } = await supabase.functions.invoke("admin-user-access", { body: { action, data } });
    if (error) {
      const response = (error as any).context;
      if (response && typeof response.json === "function") {
        const payload = await response.json().catch(() => null);
        if (payload?.error) throw new Error(payload.error);
      }
      throw error;
    }
    if (result?.error) throw new Error(result.error);
    return result;
  };
  const refresh = () => { qc.invalidateQueries({ queryKey: ["profiles"] }); qc.invalidateQueries({ queryKey: ["roles"] }); qc.invalidateQueries({ queryKey: ["user_permissions"] }); qc.invalidateQueries({ queryKey: ["client_user_links"] }); qc.invalidateQueries({ queryKey: ["admin_profile_emails"] }); };
  const createMutation = useMutation({ mutationFn: () => {
    if (form.role === "client" && !form.clientId) throw new Error("Selecione o cliente que será vinculado ao acesso do portal.");
    return invokeAccessManager("create", form);
  }, onSuccess: () => { refresh(); setCreateOpen(false); setForm(defaults); toast.success("Acesso criado com sucesso."); }, onError: (e: any) => toast.error(e?.message ?? "Erro ao criar acesso") });
  const updateMutation = useMutation({ mutationFn: async () => {
    if (!editing) throw new Error("Usuário inválido.");
    if (form.role === "client") {
      if (form.fullName.trim().length < 2) throw new Error("Informe o nome completo.");
      if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) throw new Error("Informe um e-mail válido.");
      const { error: nameError } = await (supabase.rpc("admin_update_client_profile_name", {
        target_user_id: editing,
        new_full_name: form.fullName.trim(),
      }) as any);
      if (nameError) throw nameError;
      const currentEmail = profileEmails.find((item) => item.id === editing)?.email ?? "";
      if (form.email.trim().toLowerCase() !== currentEmail.toLowerCase()) {
        const { error } = await (supabase.rpc("admin_update_client_email", { target_user_id: editing, new_email: form.email.trim().toLowerCase() }) as any);
        if (error) throw error;
      }
      if (form.password) {
        if (form.password.length < 6) throw new Error("A nova senha deve ter ao menos 6 caracteres.");
        const { error } = await (supabase.rpc("admin_reset_user_password", { target_user_id: editing, new_password: form.password }) as any);
        if (error) throw error;
      }
    }
    return invokeAccessManager("update", { userId: editing, role: form.role, permissions: form.permissions, clientId: form.clientId || null });
  }, onSuccess: () => { refresh(); setEditing(null); toast.success("Acesso atualizado."); }, onError: (e: any) => toast.error(e?.message ?? "Erro ao atualizar acessos") });
  const setActive = useMutation({ mutationFn: async ({ userId, active }: { userId: string; active: boolean }) => { const { error } = await (supabase.from("profiles") as any).update({ is_active: active }).eq("id", userId); if (error) throw error; }, onSuccess: () => { qc.invalidateQueries({ queryKey: ["profiles"] }); toast.success("Status atualizado"); }, onError: (e: any) => toast.error(e.message) });
  const emailFor = (profile: any) => profileEmails.find((item) => item.id === profile.id)?.email ?? profile.email ?? null;
  const resetPasswordMutation = useMutation({
    mutationFn: async () => {
      if (!resetTarget?.id) throw new Error("Usuário inválido.");
      if (newPassword.length < 6) throw new Error("A nova senha deve ter ao menos 6 caracteres.");
      const { error } = await (supabase.rpc("admin_reset_user_password", {
        target_user_id: resetTarget.id,
        new_password: newPassword,
      }) as any);
      if (error) throw error;
    },
    onSuccess: () => {
      setResetTarget(null);
      setNewPassword("");
      toast.success("Senha redefinida com sucesso.");
    },
    onError: (error: any) => toast.error(error?.message ?? "Não foi possível redefinir a senha."),
  });
  const activeProfiles = useMemo(() => profiles.filter((p) => (p as any).is_active !== false), [profiles]); const inactiveProfiles = useMemo(() => profiles.filter((p) => (p as any).is_active === false), [profiles]);
  const openEdit = async (id: string) => {
    const role = (roles.find((r: { user_id: string; role: string }) => r.user_id === id)?.role ?? "collaborator") as Role;
    const profile = profiles.find((item) => item.id === id);
    setForm({ ...defaults, fullName: profile?.full_name ?? "", email: profile ? emailFor(profile) ?? "" : "", role, permissions: permissionRows.find((p) => p.user_id === id)?.permissions ?? [], clientId: clientLinks.find((link) => link.user_id === id)?.client_id ?? "" });
    setEditing(id);
    // Busca novamente no momento da abertura: evita que o campo fique vazio
    // se a consulta protegida de e-mails ainda não terminou de carregar.
    const { data, error } = await (supabase.rpc("admin_get_profile_emails") as any);
    const savedEmail = !error ? (data as { id: string; email: string | null }[] | null)?.find((item) => item.id === id)?.email : null;
    if (savedEmail) setForm((current) => ({ ...current, email: savedEmail }));
  };
  if (loading) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>; if (!isAdmin) return <Navigate to="/dashboard" />;
  const renderProfile = (p: any) => {
    const role = (roles.find((r: { user_id: string; role: string }) => r.user_id === p.id)?.role ?? "collaborator") as Role;
    const self = p.id === user?.id;
    const email = emailFor(p);
    return <Card key={p.id} className="p-4"><div className="flex items-center gap-3"><Avatar className="h-12 w-12"><AvatarImage src={p.avatar_url || undefined} alt={p.full_name || email || "Usuário"} /><AvatarFallback>{(p.full_name || email || "?").slice(0, 2).toUpperCase()}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><h3 className="truncate font-semibold">{p.full_name || "Sem nome"}</h3><p className="truncate text-xs text-muted-foreground">E-mail: {email ?? "Não informado"}</p></div>{role === "admin" ? <ShieldCheck className="h-4 w-4 text-primary" /> : <UserIcon className="h-4 w-4 text-muted-foreground" />}</div><div className="mt-3 flex gap-1"><Badge variant={role === "admin" ? "default" : "secondary"}>{roleLabel[role]}</Badge>{self && <Badge variant="outline">Você</Badge>}</div><div className="mt-3 border-t pt-3"><Button size="sm" variant="outline" className="w-full" onClick={() => openEdit(p.id)}>{role === "client" ? "Editar acesso do portal" : "Definir categoria e acessos"}</Button>{role !== "client" && <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => { setResetTarget(p); setNewPassword(""); }}><KeyRound className="mr-1 h-3 w-3" />Redefinir senha</Button>}{!self && <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => setActive.mutate({ userId: p.id, active: false })}><UserX className="mr-1 h-3 w-3" /> Desativar acesso</Button>}</div></Card>;
  };
  const profilesByRole: Record<Role, any[]> = { admin: [], collaborator: [], client: [] };
  activeProfiles.forEach((profile) => {
    const role = (roles.find((item: { user_id: string; role: string }) => item.user_id === profile.id)?.role ?? "collaborator") as Role;
    profilesByRole[role].push(profile);
  });

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usuários</h1>
          <p className="text-sm text-muted-foreground">Crie logins e defina os acessos de cada usuário.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Novo usuário</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar acesso</DialogTitle>
              <DialogDescription>O login e a senha abaixo dão acesso ao sistema conforme as permissões escolhidas.</DialogDescription>
            </DialogHeader>
            <AccessForm value={form} onChange={setForm} includeCredentials />
            <DialogFooter><Button disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>{createMutation.isPending ? "Criando…" : "Criar acesso"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground">Usuários ativos ({activeProfiles.length})</h2>
          <p className="text-xs text-muted-foreground">Abra uma categoria para visualizar e gerenciar seus acessos.</p>
        </div>
        <UserCategorySection title="Administradores" count={profilesByRole.admin.length}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{profilesByRole.admin.map(renderProfile)}</div>
        </UserCategorySection>
        <UserCategorySection title="Colaboradores" count={profilesByRole.collaborator.length}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{profilesByRole.collaborator.map(renderProfile)}</div>
        </UserCategorySection>
        <UserCategorySection title="Clientes" count={profilesByRole.client.length}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{profilesByRole.client.map(renderProfile)}</div>
        </UserCategorySection>
      </section>

      {inactiveProfiles.length > 0 && (
        <UserCategorySection title="Acessos desativados" count={inactiveProfiles.length}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {inactiveProfiles.map((p: any) => (
              <Card key={p.id} className="border-dashed p-4 opacity-75">
                <p className="font-medium">{p.full_name || p.email}</p>
                <Button size="sm" className="mt-3 w-full" variant="outline" onClick={() => setActive.mutate({ userId: p.id, active: true })}>
                  <UserCheck className="mr-1 h-3 w-3" /> Reativar acesso
                </Button>
              </Card>
            ))}
          </div>
        </UserCategorySection>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.role === "client" ? "Editar acesso do portal" : "Definir acessos"}</DialogTitle>
            <DialogDescription>{form.role === "client" ? "Atualize os dados do responsável pelo acesso ao portal. Todas as alterações passam a valer imediatamente." : "Escolha a categoria e as áreas disponíveis no menu para este usuário."}</DialogDescription>
          </DialogHeader>
          <AccessForm value={form} onChange={setForm} includeCredentials={form.role === "client"} passwordRequired={false} />
          <DialogFooter><Button disabled={updateMutation.isPending} onClick={() => updateMutation.mutate()}>{updateMutation.isPending ? "Salvando…" : form.role === "client" ? "Salvar acesso" : "Salvar acessos"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
            <DialogDescription>Defina uma nova senha para {resetTarget?.full_name || emailFor(resetTarget || {}) || "este acesso"}. Ela passa a valer imediatamente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-password">Nova senha</Label>
            <Input id="new-password" type="password" minLength={6} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Mínimo de 6 caracteres" />
          </div>
          <DialogFooter><Button disabled={resetPasswordMutation.isPending || newPassword.length < 6} onClick={() => resetPasswordMutation.mutate()}>{resetPasswordMutation.isPending ? "Redefinindo…" : "Salvar nova senha"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
