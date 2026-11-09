import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ImageUp, LoaderCircle, Pencil, Plus, Save, Trash2, Users } from "lucide-react";
import { DndContext, PointerSensor, closestCenter, type DragEndEvent, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { type Client, type ClientDepartment, type ClientDepartmentEmployee } from "@/hooks/use-data";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClientDocumentsManager } from "@/components/ClientDocumentsManager";
import { ClientBranchesManager } from "@/components/ClientBranchesManager";
import { ClientPortalAccessPanel } from "@/components/ClientPortalAccessPanel";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/clients/$clientId/edit")({
  component: EditClientPage,
  validateSearch: (search: Record<string, unknown>): { aba?: "documentos" | "portal" } => ({
    aba: search.aba === "documentos" ? ("documentos" as const) : search.aba === "portal" ? ("portal" as const) : undefined,
  }),
});

const EMPTY_DEPARTMENTS: ClientDepartment[] = [];
const EMPTY_EMPLOYEES: ClientDepartmentEmployee[] = [];

function EditClientPage() {
  const { clientId } = Route.useParams();
  const { aba } = Route.useSearch();
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState(aba === "documentos" ? "departments" : aba === "portal" ? "portal" : "client");
  useEffect(() => {
    if (aba === "documentos") setActiveTab("departments");
    if (aba === "portal") setActiveTab("portal");
  }, [aba]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: client, isLoading } = useQuery({
    queryKey: ["clients", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .single();
      if (error) throw error;
      return data as Client;
    },
  });
  const { data: departments = EMPTY_DEPARTMENTS } = useQuery({
    queryKey: ["client-departments", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_departments")
        .select("*")
        .eq("client_id", clientId)
        .order("position")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as ClientDepartment[];
    },
  });
  const { data: employees = EMPTY_EMPLOYEES } = useQuery({
    queryKey: ["client-department-employees", clientId, departments.map((department) => department.id)],
    enabled: departments.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_department_employees")
        .select("*")
        .in("department_id", departments.map((department) => department.id))
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as ClientDepartmentEmployee[];
    },
  });
  const [saving, setSaving] = useState(false);
  const [cnpj, setCnpj] = useState("");
  const [legalName, setLegalName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [stateRegistration, setStateRegistration] = useState("");
  const [municipalRegistration, setMunicipalRegistration] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [responsible, setResponsible] = useState("");
  const [color, setColor] = useState("#1e3a8a");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [departmentFormOpen, setDepartmentFormOpen] = useState(false);
  const [departmentName, setDepartmentName] = useState("");
  const [editingDepartmentId, setEditingDepartmentId] = useState<string | null>(null);
  const [employeeFormDepartmentId, setEmployeeFormDepartmentId] = useState<string | null>(null);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [employeeName, setEmployeeName] = useState("");
  const [employeeCbo, setEmployeeCbo] = useState("");
  const [employeeRole, setEmployeeRole] = useState("");
  const [employeeSalary, setEmployeeSalary] = useState("");
  const [employeeActivities, setEmployeeActivities] = useState("");
  const [employeeAvatarFile, setEmployeeAvatarFile] = useState<File | null>(null);
  const [employeeAvatarPreview, setEmployeeAvatarPreview] = useState<string | null>(null);
  const [employeeAvatarUrls, setEmployeeAvatarUrls] = useState<Record<string, string>>({});
  const [selectedEmployee, setSelectedEmployee] = useState<ClientDepartmentEmployee | null>(null);
  const [employeeDialogPosition, setEmployeeDialogPosition] = useState({ x: 0, y: 0 });
  const stopEmployeeDialogDragRef = useRef<null | (() => void)>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    if (!client) return;
    setCnpj(client.cnpj ?? "");
    setLegalName(client.legal_name ?? "");
    setTradeName(client.trade_name ?? "");
    setStateRegistration(client.state_registration ?? "");
    setMunicipalRegistration(client.municipal_registration ?? "");
    setAddress(client.address ?? "");
    setPhone(client.phone ?? "");
    setEmail(client.email ?? "");
    setResponsible(client.responsible ?? "");
    setColor(client.color ?? "#1e3a8a");
  }, [client]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(null);
      return;
    }

    const previewUrl = URL.createObjectURL(avatarFile);
    setAvatarPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [avatarFile]);

  useEffect(() => {
    if (!employeeAvatarFile) {
      setEmployeeAvatarPreview(null);
      return;
    }
    const previewUrl = URL.createObjectURL(employeeAvatarFile);
    setEmployeeAvatarPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [employeeAvatarFile]);

  useEffect(() => {
    let cancelled = false;
    const loadEmployeeAvatars = async () => {
      const employeesWithAvatar = employees.filter((employee) => employee.avatar_path);
      if (employeesWithAvatar.length === 0) {
        if (!cancelled) setEmployeeAvatarUrls((current) => (Object.keys(current).length === 0 ? current : {}));
        return;
      }
      const entries = await Promise.all(
        employeesWithAvatar.map(async (employee) => {
          const { data } = await supabase.storage
            .from("task-attachments")
            .createSignedUrl(employee.avatar_path!, 3600);
          return [employee.id, data?.signedUrl ?? ""] as const;
        }),
      );
      if (!cancelled) setEmployeeAvatarUrls(Object.fromEntries(entries));
    };
    void loadEmployeeAvatars();
    return () => { cancelled = true; };
  }, [employees]);

  // Garante que nenhum listener de arraste fique ativo se a janela for
  // minimizada, a aba mudar ou a tela for desmontada durante um arraste.
  useEffect(() => () => stopEmployeeDialogDragRef.current?.(), []);

  const save = async () => {
    if (!client) {
      toast.error("Aguarde o cadastro do cliente carregar antes de salvar.");
      return;
    }
    const name = tradeName.trim() || legalName.trim() || client?.name;
    if (!name) {
      toast.error("Preencha o Nome fantasia ou a Razão social.");
      return;
    }

    setSaving(true);
    let avatarPath = client.avatar_path;

    if (avatarFile) {
      const extension = avatarFile.name.split(".").pop()?.toLowerCase() || "png";
      const nextAvatarPath = `clients/${clientId}/avatar-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("task-attachments")
        .upload(nextAvatarPath, avatarFile, { contentType: avatarFile.type });

      if (uploadError) {
        setSaving(false);
        toast.error(`Não foi possível enviar o logo: ${uploadError.message}`);
        return;
      }

      avatarPath = nextAvatarPath;
    }

    const { error } = await supabase
      .from("clients")
      .update({
        name,
        cnpj: cnpj || null,
        legal_name: legalName || null,
        trade_name: tradeName || null,
        state_registration: stateRegistration || null,
        municipal_registration: municipalRegistration || null,
        address: address || null,
        phone: phone || null,
        email: email || null,
        responsible: responsible || null,
        color,
        avatar_path: avatarPath,
      })
      .eq("id", clientId);

    if (error) {
      setSaving(false);
      toast.error(error.message);
      return;
    }

    if (avatarFile && client.avatar_path && client.avatar_path !== avatarPath) {
      await supabase.storage.from("task-attachments").remove([client.avatar_path]);
    }

    setSaving(false);
    queryClient.invalidateQueries({ queryKey: ["clients"] });
    toast.success("Cliente atualizado");
    navigate({ to: "/clients" });
  };

  const saveDepartment = async () => {
    if (!departmentName.trim()) {
      toast.error("Informe o nome do departamento.");
      return;
    }

    const { error } = editingDepartmentId
      ? await supabase
          .from("client_departments")
          .update({ name: departmentName.trim() })
          .eq("id", editingDepartmentId)
      : await supabase.from("client_departments").insert({
          client_id: clientId,
          name: departmentName.trim(),
          position: departments.length,
        });
    if (error) {
      toast.error(error.message);
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["client-departments", clientId] });
    setDepartmentName("");
    setDepartmentFormOpen(false);
    setEditingDepartmentId(null);
    toast.success(editingDepartmentId ? "Departamento atualizado" : "Departamento cadastrado");
  };

  const startDepartmentEdit = (department: ClientDepartment) => {
    setEditingDepartmentId(department.id);
    setDepartmentName(department.name);
    setDepartmentFormOpen(true);
  };

  const deleteDepartment = async (department: ClientDepartment) => {
    if (!confirm(`Excluir o departamento "${department.name}" e todos os seus funcionários?`)) return;

    const { error } = await supabase.from("client_departments").delete().eq("id", department.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["client-departments", clientId] });
    queryClient.invalidateQueries({ queryKey: ["client-department-employees", clientId] });
    toast.success("Departamento excluído");
  };

  const handleDepartmentDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const oldIndex = departments.findIndex((department) => department.id === active.id);
    const newIndex = departments.findIndex((department) => department.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(departments, oldIndex, newIndex);
    const results = await Promise.all(
      reordered.map((department, position) => supabase.from("client_departments").update({ position }).eq("id", department.id)),
    );
    const error = results.find((result) => result.error)?.error;
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["client-departments", clientId] });
  };

  const resetEmployeeForm = () => {
    setEmployeeFormDepartmentId(null);
    setEditingEmployeeId(null);
    setEmployeeName("");
    setEmployeeCbo("");
    setEmployeeRole("");
    setEmployeeSalary("");
    setEmployeeActivities("");
    setEmployeeAvatarFile(null);
  };

  const saveEmployee = async () => {
    if (!employeeName.trim() || !employeeFormDepartmentId) {
      toast.error("Informe o nome completo do funcionário.");
      return;
    }
    const employeeData = {
      department_id: employeeFormDepartmentId,
      full_name: employeeName.trim(),
      cbo: employeeCbo.trim() || null,
      role: employeeRole.trim() || null,
      salary: parseSalary(employeeSalary),
      activities: employeeActivities.trim() || null,
    };
    const { data: savedEmployee, error } = editingEmployeeId
      ? await supabase.from("client_department_employees").update(employeeData).eq("id", editingEmployeeId).select().single()
      : await supabase.from("client_department_employees").insert(employeeData).select().single();
    if (error) {
      toast.error(error.message);
      return;
    }
    if (employeeAvatarFile && savedEmployee) {
      const extension = employeeAvatarFile.name.split(".").pop()?.toLowerCase() || "png";
      const avatarPath = `clients/${clientId}/departments/${employeeFormDepartmentId}/employees/${savedEmployee.id}-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("task-attachments")
        .upload(avatarPath, employeeAvatarFile, { contentType: employeeAvatarFile.type });
      if (uploadError) {
        toast.error(`Funcionário salvo, mas não foi possível enviar a foto: ${uploadError.message}`);
      } else {
        const { error: avatarError } = await supabase
          .from("client_department_employees")
          .update({ avatar_path: avatarPath })
          .eq("id", savedEmployee.id);
        if (avatarError) toast.error(`Não foi possível vincular a foto: ${avatarError.message}`);
      }
    }
    queryClient.invalidateQueries({ queryKey: ["client-department-employees", clientId] });
    resetEmployeeForm();
    toast.success(editingEmployeeId ? "Funcionário atualizado" : "Funcionário cadastrado");
  };

  const startEmployeeEdit = (employee: ClientDepartmentEmployee) => {
    setEmployeeFormDepartmentId(employee.department_id);
    setEditingEmployeeId(employee.id);
    setEmployeeName(employee.full_name);
    setEmployeeCbo(employee.cbo ?? "");
    setEmployeeRole(employee.role ?? "");
    setEmployeeSalary(employee.salary === null ? "" : formatSalary(employee.salary));
    setEmployeeActivities(employee.activities ?? "");
    setEmployeeAvatarFile(null);
  };

  const deleteEmployee = async (employee: ClientDepartmentEmployee) => {
    if (!confirm(`Excluir o funcionário "${employee.full_name}"?`)) return;
    const { error } = await supabase.from("client_department_employees").delete().eq("id", employee.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["client-department-employees", clientId] });
    toast.success("Funcionário excluído");
  };

  const startEmployeeDialogDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    stopEmployeeDialogDragRef.current?.();
    const startX = event.clientX;
    const startY = event.clientY;
    const initialPosition = employeeDialogPosition;
    const onMove = (moveEvent: PointerEvent) => {
      setEmployeeDialogPosition({
        x: initialPosition.x + moveEvent.clientX - startX,
        y: initialPosition.y + moveEvent.clientY - startY,
      });
    };
    const onEnd = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("blur", onEnd);
      stopEmployeeDialogDragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("blur", onEnd, { once: true });
    stopEmployeeDialogDragRef.current = onEnd;
  };

  if (isLoading) {
    return (
      <div className="grid min-h-64 place-items-center">
        <LoaderCircle className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Cliente não encontrado.</p>
        <Button asChild className="mt-4">
          <Link to="/clients">Voltar para clientes</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="flex items-center gap-4">
        <Button asChild size="icon" variant="ghost" title="Voltar para clientes">
          <Link to="/clients">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dados do cliente</h1>
          <p className="text-sm text-muted-foreground">
            Atualize todos os dados cadastrados do cliente.
          </p>
        </div>
      </header>

      <Card className="p-6">
        <Tabs
          value={activeTab === "portal" && !isAdmin ? "client" : activeTab}
          onValueChange={(tab) => { setActiveTab(tab); navigate({ to: "/clients/$clientId/edit", params: { clientId }, search: tab === "departments" ? { aba: "documentos" } : tab === "portal" ? { aba: "portal" } : {}, replace: true }); }}
        >
          <TabsList>
            <TabsTrigger value="client">Dados do cliente</TabsTrigger>
            <TabsTrigger value="branches">Filiais e pátios</TabsTrigger>
            <TabsTrigger value="departments">Controle de documentos</TabsTrigger>
            {isAdmin && <TabsTrigger value="portal">Acesso ao portal</TabsTrigger>}
          </TabsList>

          <TabsContent value="client" className="mt-6">
            <div className="space-y-6">
              <Field label="Nome exibido pelo sistema">
                <Input value={client.name} disabled />
              </Field>

              <Field label="Logo do cliente">
                <div className="space-y-2">
                  <Label
                    htmlFor="edit-client-avatar"
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-primary/50 bg-primary/5 p-4 transition-colors hover:bg-primary/10"
                  >
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground">
                      <ImageUp className="h-5 w-5" />
                    </span>
                    <span className="flex flex-col">
                      <span className="font-medium">Alterar logo do cliente</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        PNG, JPG ou WebP
                      </span>
                    </span>
                  </Label>
                  <Input
                    id="edit-client-avatar"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)}
                  />
                  {avatarFile && avatarPreview && (
                    <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-2">
                      <img
                        src={avatarPreview}
                        alt="Prévia do logo selecionado"
                        className="h-10 w-10 rounded object-cover"
                      />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Imagem selecionada</p>
                        <p className="truncate text-sm font-medium" title={avatarFile.name}>
                          {avatarFile.name}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </Field>

              <section className="space-y-3 border-t pt-6">
                <h2 className="font-semibold">Dados cadastrais</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="CNPJ">
                    <Input value={cnpj} onChange={(event) => setCnpj(event.target.value)} />
                  </Field>
                  <Field label="Nome fantasia">
                    <Input
                      value={tradeName}
                      onChange={(event) => setTradeName(event.target.value)}
                    />
                  </Field>
                  <Field label="Razão social">
                    <Input
                      value={legalName}
                      onChange={(event) => setLegalName(event.target.value)}
                    />
                  </Field>
                  <Field label="Responsável">
                    <Input
                      value={responsible}
                      onChange={(event) => setResponsible(event.target.value)}
                    />
                  </Field>
                  <Field label="Inscrição Estadual">
                    <Input
                      value={stateRegistration}
                      onChange={(event) => setStateRegistration(event.target.value)}
                    />
                  </Field>
                  <Field label="Inscrição Municipal">
                    <Input
                      value={municipalRegistration}
                      onChange={(event) => setMunicipalRegistration(event.target.value)}
                    />
                  </Field>
                </div>
              </section>

              <section className="space-y-3 border-t pt-6">
                <h2 className="font-semibold">Contato</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Telefone">
                    <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
                  </Field>
                  <Field label="E-mail">
                    <Input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </Field>
                </div>
                <Field label="Endereço completo">
                  <Input value={address} onChange={(event) => setAddress(event.target.value)} />
                </Field>
              </section>
              <div className="border-t pt-5">
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2.5">
                  <Label className="text-sm font-medium">Cor de identificação</Label>
                  <input
                    type="color"
                    value={color}
                    onChange={(event) => setColor(event.target.value)}
                    className="h-9 w-9 cursor-pointer appearance-none rounded-full border-0 bg-transparent p-0 shadow-sm ring-1 ring-border transition hover:ring-2 hover:ring-primary/50 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 border-t pt-6">
                <Button asChild variant="outline">
                  <Link to="/clients">Cancelar</Link>
                </Button>
                <Button onClick={save} disabled={saving}>
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? "Salvando..." : "Salvar alterações"}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="departments" className="mt-6">
            <ClientDocumentsManager clientId={clientId} />
          </TabsContent>

          <TabsContent value="branches" className="mt-6">
            <ClientBranchesManager clientId={clientId} />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="portal" className="mt-6">
              <ClientPortalAccessPanel
                clientId={clientId}
                defaultName={client.responsible ?? ""}
                defaultEmail={client.email ?? ""}
              />
            </TabsContent>
          )}

          <TabsContent value="legacy-departments" className="hidden">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Departamentos</h2>
                <p className="text-sm text-muted-foreground">
                  Cadastre e organize os departamentos deste cliente.
                </p>
              </div>
              <Button onClick={() => { setEditingDepartmentId(null); setDepartmentName(""); setDepartmentFormOpen((open) => !open); }}>
                <Plus className="mr-2 h-4 w-4" />
                Cadastrar departamento
              </Button>
            </div>

            {departmentFormOpen && (
              <div className="space-y-4 rounded-lg border p-4">
                <Field label="Nome do departamento">
                  <Input
                    value={departmentName}
                    onChange={(event) => setDepartmentName(event.target.value)}
                  />
                </Field>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setDepartmentFormOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={saveDepartment}>Salvar departamento</Button>
                </div>
              </div>
            )}

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDepartmentDragEnd}>
              <SortableContext items={departments.map((department) => department.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
              {departments.map((department) => (
                <SortableDepartment key={department.id} id={department.id}>
                <Collapsible className="rounded-lg border">
                  <div className="flex items-center gap-1 p-2">
                    <CollapsibleTrigger className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-md px-2 py-2 text-left font-medium hover:bg-muted">
                      <span className="truncate">{department.name}</span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </CollapsibleTrigger>
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon" variant="ghost" title="Editar departamento" onClick={() => startDepartmentEdit(department)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" title="Excluir departamento" onClick={() => deleteDepartment(department)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </div>
                  <CollapsibleContent className="border-t p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-medium"><Users className="h-4 w-4 text-muted-foreground" />Funcionários ({employees.filter((employee) => employee.department_id === department.id).length})</div>
                      <Button size="sm" onClick={() => { resetEmployeeForm(); setEmployeeFormDepartmentId(department.id); }}><Plus className="mr-2 h-4 w-4" />Cadastrar funcionário</Button>
                    </div>

                    {employeeFormDepartmentId === department.id && (
                      <div className="mt-4 space-y-4 rounded-lg border bg-muted/20 p-4">
                        <h3 className="font-medium">{editingEmployeeId ? "Editar funcionário" : "Novo funcionário"}</h3>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="Nome Completo"><Input value={employeeName} onChange={(event) => setEmployeeName(event.target.value)} /></Field>
                          <Field label="CBO"><Input value={employeeCbo} onChange={(event) => setEmployeeCbo(event.target.value)} /></Field>
                          <Field label="Função"><Input value={employeeRole} onChange={(event) => setEmployeeRole(event.target.value)} /></Field>
                          <Field label="Salário"><Input inputMode="decimal" placeholder="0,00" value={employeeSalary} onChange={(event) => setEmployeeSalary(event.target.value)} onBlur={() => setEmployeeSalary((value) => value ? formatSalary(value) : "")} /></Field>
                        </div>
                        <Field label="Atividades"><Textarea value={employeeActivities} onChange={(event) => setEmployeeActivities(event.target.value)} placeholder="Descreva livremente as atividades do funcionário." /></Field>
                        <div className="space-y-2">
                          <Label>Foto do funcionário</Label>
                          <label htmlFor="employee-avatar" className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-primary/50 bg-primary/5 p-3 transition-colors hover:bg-primary/10">
                            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground"><ImageUp className="h-4 w-4" /></span>
                            <span><span className="block text-sm font-medium">Selecionar foto do funcionário</span><span className="block text-xs text-muted-foreground">PNG, JPG ou WebP</span></span>
                          </label>
                          <Input id="employee-avatar" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => setEmployeeAvatarFile(event.target.files?.[0] ?? null)} />
                          {employeeAvatarFile && employeeAvatarPreview && <div className="mt-2 flex items-center gap-2 rounded-md border p-2"><img src={employeeAvatarPreview} alt="Prévia" className="h-9 w-9 rounded-full object-cover" /><span className="truncate text-sm">{employeeAvatarFile.name}</span></div>}
                        </div>
                        <div className="flex justify-end gap-2"><Button variant="outline" onClick={resetEmployeeForm}>Cancelar</Button><Button onClick={saveEmployee}>Salvar funcionário</Button></div>
                      </div>
                    )}

                    <div className="mt-4 space-y-2">
                      {employees.filter((employee) => employee.department_id === department.id).map((employee) => (
                        <div key={employee.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                          <button type="button" className="flex min-w-0 flex-1 items-start gap-3 text-left" onClick={() => { setEmployeeDialogPosition({ x: 0, y: 0 }); setSelectedEmployee(employee); }}>
                            {employeeAvatarUrls[employee.id] && <img src={employeeAvatarUrls[employee.id]} alt={`Foto de ${employee.full_name}`} className="h-10 w-10 shrink-0 rounded-full object-cover" />}
                            <div className="min-w-0"><p className="font-medium">{employee.full_name}</p><p className="text-sm text-muted-foreground">{employee.role || "Sem função cadastrada"}</p></div>
                          </button>
                          <div className="flex shrink-0 items-center justify-end gap-1"><Button className="h-9" size="sm" variant="outline" onClick={() => { setEmployeeDialogPosition({ x: 0, y: 0 }); setSelectedEmployee(employee); }}>Ver dados</Button><Button className="h-9 w-9" size="icon" variant="ghost" title="Editar informações" onClick={() => startEmployeeEdit(employee)}><Pencil className="h-4 w-4" /></Button><Button className="h-9 w-9" size="icon" variant="ghost" title="Excluir funcionário" onClick={() => deleteEmployee(employee)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>
                        </div>
                      ))}
                      {employees.filter((employee) => employee.department_id === department.id).length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Nenhum funcionário cadastrado neste departamento.</p>}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
                </SortableDepartment>
              ))}
              {departments.length === 0 && (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Nenhum departamento cadastrado.
                </p>
              )}
                </div>
              </SortableContext>
            </DndContext>
          </TabsContent>
        </Tabs>
      </Card>
      <Dialog open={!!selectedEmployee} onOpenChange={(open) => !open && setSelectedEmployee(null)}>
        <DialogContent
          className="max-w-2xl"
          style={{
            left: `calc(50% + ${employeeDialogPosition.x}px)`,
            top: `calc(50% + ${employeeDialogPosition.y}px)`,
          }}
        >
          {selectedEmployee && (
            <>
              <DialogHeader
                className="cursor-grab select-none rounded-md px-1 py-1 active:cursor-grabbing"
                onPointerDown={startEmployeeDialogDrag}
                title="Arraste para mover esta janela"
              >
                <DialogTitle>Dados do funcionário</DialogTitle>
              </DialogHeader>
              <div className="overflow-hidden rounded-xl border-2 border-primary/20 bg-card shadow-sm">
                <div className="h-2 bg-gradient-to-r from-emerald-600 via-yellow-400 to-blue-700" />
                <div className="grid gap-5 p-5 sm:grid-cols-[110px_1fr]">
                  <div className="order-first">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Foto salva</p>
                    {employeeAvatarUrls[selectedEmployee.id] ? (
                      <img src={employeeAvatarUrls[selectedEmployee.id]} alt={`Foto de ${selectedEmployee.full_name}`} className="aspect-[3/4] w-[110px] rounded-md border bg-muted object-cover" />
                    ) : (
                      <div className="grid aspect-[3/4] w-[110px] place-items-center rounded-md border bg-muted text-xs text-muted-foreground">Sem foto</div>
                    )}
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Nome completo</p>
                      <p className="text-lg font-semibold">{selectedEmployee.full_name}</p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Detail label="CBO" value={selectedEmployee.cbo} />
                      <Detail label="Função" value={selectedEmployee.role} />
                      <Detail label="Salário" value={selectedEmployee.salary === null ? null : formatSalary(selectedEmployee.salary)} />
                    </div>
                    <Detail label="Atividades" value={selectedEmployee.activities} multiline />
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function SortableDepartment({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "opacity-50" : undefined}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

function parseSalary(value: string) {
  if (!value.trim()) return null;
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const salary = Number(normalized);
  return Number.isFinite(salary) ? salary : null;
}

function formatSalary(value: string | number): string {
  const salary = typeof value === "number" ? value : parseSalary(value);
  return salary === null
    ? String(value)
    : new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(salary);
}

function Detail({ label, value, multiline = false }: { label: string; value: string | number | null; multiline?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={multiline ? "mt-1 whitespace-pre-wrap text-sm" : "text-sm font-medium"}>{value || "Não informado"}</p>
    </div>
  );
}
