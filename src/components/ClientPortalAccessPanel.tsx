/** Aba "Acesso ao portal": logins da empresa, bloqueio, senha e anotação interna. */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  LogIn,
  Pencil,
  Plus,
  Save,
  UserCheck,
  UserX,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createPortalLogin,
  listPortalLogins,
  portalAccessKey,
  resetPortalPassword,
  savePortalPasswordNote,
  setPortalAccessEnabled,
  updatePortalLogin,
  type PortalLogin,
} from "@/lib/client-portal-access";
import { startClientImpersonation } from "@/lib/client-impersonation";
import {
  emptyPortalLogin,
  generatePortalPassword,
  portalLoginError,
  type PortalLoginDraft,
} from "@/lib/client-portal-rules";

export function PortalPasswordInput({
  id,
  value,
  onChange,
  placeholder = "Mínimo de 6 caracteres",
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="pr-10"
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground"
          title={visible ? "Ocultar senha" : "Mostrar senha"}
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          onChange(generatePortalPassword());
          setVisible(true);
        }}
      >
        <Wand2 className="mr-2 h-4 w-4" />
        Gerar
      </Button>
    </div>
  );
}

function KeepNoteCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm">
      <Checkbox checked={checked} onCheckedChange={(next) => onChange(next === true)} />
      <span>
        Guardar esta senha na anotação interna
        <span className="block text-xs text-muted-foreground">
          Somente administradores conseguem ver a anotação.
        </span>
      </span>
    </label>
  );
}

export function PortalLoginFields({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: PortalLoginDraft;
  onChange: (next: PortalLoginDraft) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-name`}>Nome do responsável</Label>
          <Input
            id={`${idPrefix}-name`}
            value={value.fullName}
            onChange={(event) => onChange({ ...value, fullName: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-email`}>Login (e-mail)</Label>
          <Input
            id={`${idPrefix}-email`}
            type="email"
            autoComplete="off"
            value={value.email}
            onChange={(event) => onChange({ ...value, email: event.target.value })}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-password`}>Senha de acesso</Label>
        <PortalPasswordInput
          id={`${idPrefix}-password`}
          value={value.password}
          onChange={(password) => onChange({ ...value, password })}
        />
      </div>
      <KeepNoteCheckbox
        checked={value.keepPasswordNote}
        onChange={(keepPasswordNote) => onChange({ ...value, keepPasswordNote })}
      />
    </div>
  );
}

function PasswordNote({ login, onSaved }: { login: PortalLogin; onSaved: () => void }) {
  const saved = login.password_note ?? "";
  const [note, setNote] = useState(saved);
  const [visible, setVisible] = useState(false);
  useEffect(() => setNote(saved), [saved]);

  const save = useMutation({
    mutationFn: () => savePortalPasswordNote(login.user_id, note),
    onSuccess: () => {
      onSaved();
      toast.success("Anotação salva.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const copy = async () => {
    await navigator.clipboard.writeText(note);
    toast.success("Anotação copiada.");
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={`note-${login.user_id}`}>Anotação da senha</Label>
      <div className="flex flex-wrap gap-2">
        <Input
          id={`note-${login.user_id}`}
          className="min-w-48 flex-1"
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Nenhuma senha anotada"
        />
        <Button
          type="button"
          size="icon"
          variant="outline"
          title={visible ? "Ocultar anotação" : "Mostrar anotação"}
          aria-label={visible ? "Ocultar anotação" : "Mostrar anotação"}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
        <Button
          type="button"
          size="icon"
          variant="outline"
          title="Copiar anotação"
          aria-label="Copiar anotação"
          disabled={!note}
          onClick={() => void copy()}
        >
          <Copy className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={note === saved || save.isPending}
          onClick={() => save.mutate()}
        >
          <Save className="mr-2 h-4 w-4" />
          Salvar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Serve só para controle interno. Se o cliente trocar a senha em Minha conta, esta anotação
        não muda.
      </p>
    </div>
  );
}

export function ClientPortalAccessPanel({
  clientId,
  defaultName,
  defaultEmail,
}: {
  clientId: string;
  defaultName: string;
  defaultEmail: string;
}) {
  const queryClient = useQueryClient();
  const {
    data: logins = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: portalAccessKey(clientId),
    queryFn: () => listPortalLogins(clientId),
  });
  const [createDraft, setCreateDraft] = useState<PortalLoginDraft | null>(null);
  const [editTarget, setEditTarget] = useState<PortalLogin | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [resetTarget, setResetTarget] = useState<PortalLogin | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [keepNote, setKeepNote] = useState(true);
  const [disableTarget, setDisableTarget] = useState<PortalLogin | null>(null);

  // A tela de Usuários mostra estes mesmos logins em consultas próprias.
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: portalAccessKey(clientId) });
    queryClient.invalidateQueries({ queryKey: ["profiles"] });
    queryClient.invalidateQueries({ queryKey: ["roles"] });
    queryClient.invalidateQueries({ queryKey: ["client_user_links"] });
    queryClient.invalidateQueries({ queryKey: ["admin_profile_emails"] });
  };
  const showError = (mutationError: Error) => toast.error(mutationError.message);

  const createLogin = useMutation({
    mutationFn: async () => {
      if (!createDraft) return;
      const problem = portalLoginError(createDraft);
      if (problem) throw new Error(problem);
      await createPortalLogin(clientId, createDraft);
    },
    onSuccess: () => {
      refresh();
      setCreateDraft(null);
      toast.success("Acesso ao portal criado.");
    },
    onError: showError,
  });
  const editLogin = useMutation({
    mutationFn: async () => {
      if (!editTarget) return;
      const problem = portalLoginError(
        { ...emptyPortalLogin, fullName: editName, email: editEmail },
        false,
      );
      if (problem) throw new Error(problem);
      await updatePortalLogin(editTarget, editName, editEmail);
    },
    onSuccess: () => {
      refresh();
      setEditTarget(null);
      toast.success("Dados do acesso atualizados.");
    },
    onError: showError,
  });
  const resetPassword = useMutation({
    mutationFn: async () => {
      if (resetTarget) await resetPortalPassword(resetTarget.user_id, newPassword, keepNote);
    },
    onSuccess: () => {
      refresh();
      setResetTarget(null);
      toast.success("Senha redefinida. Ela já vale no próximo login.");
    },
    onError: showError,
  });
  const toggleAccess = useMutation({
    mutationFn: ({ userId, enabled }: { userId: string; enabled: boolean }) =>
      setPortalAccessEnabled(userId, enabled),
    onSuccess: (_result, { enabled }) => {
      refresh();
      setDisableTarget(null);
      toast.success(enabled ? "Acesso reativado." : "Acesso desativado.");
    },
    onError: showError,
  });

  const copyEmail = async (email: string) => {
    await navigator.clipboard.writeText(email);
    toast.success("E-mail copiado.");
  };
  const enterAsClient = useMutation({
    mutationFn: startClientImpersonation,
    onError: showError,
  });
  const openCreate = () =>
    setCreateDraft({
      ...emptyPortalLogin,
      fullName: logins.length === 0 ? defaultName : "",
      email: logins.length === 0 ? defaultEmail : "",
    });
  const openEdit = (login: PortalLogin) => {
    setEditName(login.full_name ?? "");
    setEditEmail(login.email ?? "");
    setEditTarget(login);
  };
  const openReset = (login: PortalLogin) => {
    setNewPassword("");
    setKeepNote(true);
    setResetTarget(login);
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando acessos…</p>;
  if (error) {
    // PGRST202: a função não existe no banco, ou seja, a migration ainda não foi aplicada.
    const migrationMissing = (error as { code?: string }).code === "PGRST202";
    return (
      <p className="text-sm text-destructive">
        {migrationMissing
          ? "Esta aba precisa da atualização do banco de dados, que ainda não foi aplicada."
          : `Não foi possível carregar os acessos: ${(error as Error).message}`}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Acesso ao Portal do Cliente</h2>
          <p className="text-sm text-muted-foreground">
            {logins.length === 0
              ? "Esta empresa ainda não tem login no portal."
              : "Logins que esta empresa usa para entrar no portal."}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          {logins.length === 0 ? "Liberar acesso" : "Adicionar login"}
        </Button>
      </div>

      {logins.map((login) => (
        <Card key={login.user_id} className="space-y-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate font-semibold">{login.full_name || "Sem nome"}</h3>
                <Badge variant={login.access_enabled ? "default" : "secondary"}>
                  {login.access_enabled ? "Ativo" : "Desativado"}
                </Badge>
              </div>
              <div className="flex min-w-0 items-center gap-1">
                <p className="truncate text-sm text-muted-foreground">{login.email}</p>
                {login.email && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    title="Copiar e-mail de login"
                    aria-label="Copiar e-mail de login"
                    onClick={() => void copyEmail(login.email!)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {login.last_sign_in_at
                  ? `Último acesso: ${new Date(login.last_sign_in_at).toLocaleString("pt-BR")}`
                  : "Ainda não entrou no portal"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!login.access_enabled || enterAsClient.isPending}
                title={login.access_enabled ? undefined : "Reative o acesso para entrar"}
                onClick={() => enterAsClient.mutate(login.user_id)}
              >
                <LogIn className="mr-2 h-3 w-3" />
                Entrar como cliente
              </Button>
              <Button size="sm" variant="outline" onClick={() => openEdit(login)}>
                <Pencil className="mr-2 h-3 w-3" />
                Editar dados
              </Button>
              <Button size="sm" variant="outline" onClick={() => openReset(login)}>
                <KeyRound className="mr-2 h-3 w-3" />
                Redefinir senha
              </Button>
              {login.access_enabled ? (
                <Button size="sm" variant="outline" onClick={() => setDisableTarget(login)}>
                  <UserX className="mr-2 h-3 w-3" />
                  Desativar acesso
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={toggleAccess.isPending}
                  onClick={() => toggleAccess.mutate({ userId: login.user_id, enabled: true })}
                >
                  <UserCheck className="mr-2 h-3 w-3" />
                  Reativar acesso
                </Button>
              )}
            </div>
          </div>
          <PasswordNote login={login} onSaved={refresh} />
        </Card>
      ))}

      <Dialog open={!!createDraft} onOpenChange={(open) => !open && setCreateDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Liberar acesso ao portal</DialogTitle>
            <DialogDescription>
              O cliente entra com este login e vê somente os dados desta empresa.
            </DialogDescription>
          </DialogHeader>
          {createDraft && (
            <PortalLoginFields
              idPrefix="portal-create"
              value={createDraft}
              onChange={setCreateDraft}
            />
          )}
          <DialogFooter>
            <Button disabled={createLogin.isPending} onClick={() => createLogin.mutate()}>
              {createLogin.isPending ? "Criando…" : "Criar acesso"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar dados do acesso</DialogTitle>
            <DialogDescription>
              Se o e-mail mudar, o cliente passa a entrar com o novo login na hora.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="portal-edit-name">Nome do responsável</Label>
              <Input
                id="portal-edit-name"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="portal-edit-email">Login (e-mail)</Label>
              <Input
                id="portal-edit-email"
                type="email"
                value={editEmail}
                onChange={(event) => setEditEmail(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button disabled={editLogin.isPending} onClick={() => editLogin.mutate()}>
              {editLogin.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
            <DialogDescription>
              A senha de {resetTarget?.full_name || resetTarget?.email} será substituída, sem envio
              de e-mail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="portal-new-password">Nova senha</Label>
              <PortalPasswordInput
                id="portal-new-password"
                value={newPassword}
                onChange={setNewPassword}
              />
            </div>
            <KeepNoteCheckbox checked={keepNote} onChange={setKeepNote} />
          </div>
          <DialogFooter>
            <Button
              disabled={resetPassword.isPending || newPassword.length < 6}
              onClick={() => resetPassword.mutate()}
            >
              {resetPassword.isPending ? "Redefinindo…" : "Salvar nova senha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!disableTarget} onOpenChange={(open) => !open && setDisableTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar este acesso?</AlertDialogTitle>
            <AlertDialogDescription>
              {disableTarget?.email} não conseguirá mais entrar no portal. Os dados da empresa não
              são apagados e você pode reativar quando quiser.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                disableTarget &&
                toggleAccess.mutate({ userId: disableTarget.user_id, enabled: false })
              }
            >
              Desativar acesso
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
