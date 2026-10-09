import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Archive, ArchiveRestore, FileText, Plus, Pencil, Trash2, Sparkles, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useClients, useTasks, type Client } from "@/hooks/use-data";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/clients")({
  component: Outlet,
});

export function ClientsIndexPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: clients = [], isLoading: clientsLoading } = useClients();
  const { data: tasks = [] } = useTasks();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Client | null>(null);
  const [color, setColor] = useState("#1e3a8a");
  const [desc, setDesc] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [legalName, setLegalName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [stateRegistration, setStateRegistration] = useState("");
  const [municipalRegistration, setMunicipalRegistration] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [responsible, setResponsible] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  const { data: branches = [] } = useQuery({
    queryKey: ["clients-list-branches"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("client_branches") as any).select("id,client_id,is_active");
      if (error) throw error;
      return (data ?? []) as { id: string; client_id: string; is_active: boolean }[];
    },
  });
  // Os logos ficam em bucket privado: gera todos os links de uma vez, pré-carrega as
  // imagens antes de exibir a lista e mantém em cache para as próximas visitas.
  const avatarPaths = clients.filter((client) => client.avatar_path).map((client) => [client.id, client.avatar_path!] as const);
  const { data: avatarUrls = {}, isFetched: logosFetched } = useQuery({
    queryKey: ["client-avatar-urls", avatarPaths.map(([, path]) => path).join("|")],
    enabled: !clientsLoading && avatarPaths.length > 0,
    staleTime: 50 * 60 * 1000,
    gcTime: 55 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.storage.from("task-attachments").createSignedUrls(avatarPaths.map(([, path]) => path), 3600);
      const byPath = new Map((data ?? []).map((item: { path: string | null; signedUrl: string }) => [item.path, item.signedUrl]));
      const urls: Record<string, string> = Object.fromEntries(avatarPaths.map(([id, path]) => [id, byPath.get(path) ?? ""]).filter(([, url]) => url));
      const preload = (url: string) => new Promise<void>((resolve) => {
        const image = new Image();
        image.onload = () => resolve();
        image.onerror = () => resolve();
        image.src = url;
      });
      await Promise.race([Promise.all(Object.values(urls).map(preload)), new Promise((resolve) => setTimeout(resolve, 3000))]);
      return urls;
    },
  });
  const loadingList = clientsLoading || (avatarPaths.length > 0 && !logosFetched);
  const isActive = (client: Client) => (client as Client & { is_active?: boolean }).is_active !== false;
  const filteredClients = clients.filter((client) => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? isActive(client) : !isActive(client));
    const haystack = [client.name, client.description, client.cnpj, client.legal_name, client.trade_name, client.responsible, client.email]
      .filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
    return matchesStatus && haystack.includes(term);
  });
  // Informações resumidas da linha: CNPJ, responsável e quantidade de pátios.
  const infoOf = (client: Client) => {
    const units = branches.filter((branch) => branch.client_id === client.id && branch.is_active !== false).length;
    return {
      cnpj: client.cnpj?.trim() || null,
      responsible: client.responsible?.trim() && client.responsible !== client.name ? client.responsible.trim() : null,
      units,
      fallback: client.description || "Sem informações adicionais.",
    };
  };
  const toggleActive = async (client: Client) => {
    const next = !isActive(client);
    if (!next && !confirm(`Arquivar o cliente "${client.name}"? Ele sai da lista de ativos, mas os dados, BMs e o portal continuam iguais.`)) return;
    const { error } = await (supabase.from("clients") as any).update({ is_active: next }).eq("id", client.id);
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["clients"] });
    toast.success(next ? "Cliente reativado." : "Cliente arquivado.");
  };

  const onOpen = (c: Client | null) => {
    setEdit(c);
    setColor(c?.color ?? "#1e3a8a");
    setDesc(c?.description ?? "");
    setOpen(true);
    setCnpj(c?.cnpj ?? "");
    setTradeName(c?.trade_name ?? "");
    setLegalName(c?.legal_name ?? "");
    setMunicipalRegistration(c?.municipal_registration ?? "");
    setStateRegistration(c?.state_registration ?? "");
    setPhone(c?.phone ?? "");
    setAddress(c?.address ?? "");
    setEmail(c?.email ?? "");
    setResponsible(c?.responsible ?? c?.name ?? "");
  };

  const save = async () => {
    const displayName = tradeName.trim() || legalName.trim();
    if (!displayName) {
      toast.error("Preencha o Nome fantasia ou a Razão social.");
      return;
    }
    const clientData = {
      name: displayName,
      color,
      description: desc || null,
      cnpj: cnpj || null,
      legal_name: legalName || null,
      trade_name: tradeName || null,
      state_registration: stateRegistration || null,
      municipal_registration: municipalRegistration || null,
      address: address || null,
      phone: phone || null,
      email: email || null,
      responsible: responsible || null,
    };
    if (edit) {
      await supabase
      .from("clients")
      .update(clientData)
      .eq("id", edit.id);
    } else {
      await supabase
      .from("clients")
      .insert({ ...clientData, created_by: user?.id });
    }
    qc.invalidateQueries({ queryKey: ["clients"] });
    setOpen(false);
    toast.success("Cliente salvo");
  };

  const remove = async (c: Client) => {
    if (!confirm(`Excluir cliente "${c.name}"?`)) return;
    await supabase.from("clients").delete().eq("id", c.id);
    qc.invalidateQueries({ queryKey: ["clients"] });
  };

  const statusTabs = [["all", "Todos"], ["active", "Ativos"], ["inactive", "Inativos"]] as const;
  const iconButton = "h-9 w-9 rounded-lg text-foreground/80 hover:bg-primary/10 hover:text-primary";
  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-6 lg:px-10">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="mt-1 text-sm text-muted-foreground">{clients.length} {clients.length === 1 ? "cliente cadastrado" : "clientes cadastrados"} no sistema.</p>
        </div>
        <Button asChild className="rounded-full px-5"><Link to="/clients/new"><Plus className="mr-2 h-4 w-4" />Novo cliente</Link></Button>
      </header>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou informação do cliente..." className="h-11 rounded-full border-transparent bg-muted/60 pl-11 focus-visible:bg-background" />
        </div>
        <div className="flex items-center gap-1">
          {statusTabs.map(([value, label]) => (
            <button key={value} type="button" onClick={() => setStatusFilter(value)} className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${statusFilter === value ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/80 hover:bg-muted"}`}>{label}</button>
          ))}
        </div>
        <p className="ml-auto text-sm text-muted-foreground">{loadingList ? "Carregando..." : <>{filteredClients.length} {filteredClients.length === 1 ? "resultado" : "resultados"}</>}</p>
      </div>

      <div className="overflow-x-auto border-t">
        <table className="w-full min-w-[1100px] table-fixed">
          <thead>
            <tr className="border-b text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <th className="w-[36%] px-4 py-4">Cliente</th>
              <th className="w-32 px-4 py-4 text-center">Atividades</th>
              <th className="px-4 py-4">Informações</th>
              <th className="w-60 px-4 py-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loadingList && Array.from({ length: 6 }, (_, index) => (
              <tr key={`loading-${index}`} className="border-b">
                <td className="px-4 py-4"><div className="flex items-center gap-3"><Skeleton className="h-11 w-11 rounded-full" /><div className="space-y-2"><Skeleton className="h-4 w-44" /><Skeleton className="h-3 w-20" /></div></div></td>
                <td className="px-4 py-4"><Skeleton className="mx-auto h-5 w-20" /></td>
                <td className="px-4 py-4"><Skeleton className="mx-auto h-4 w-48" /></td>
                <td className="px-4 py-4"><div className="flex justify-end gap-2">{Array.from({ length: 5 }, (_, icon) => <Skeleton key={icon} className="h-8 w-8 rounded-lg" />)}</div></td>
              </tr>
            ))}
            {!loadingList && filteredClients.map((c) => {
              const count = tasks.filter((t) => t.client_id === c.id).length;
              const active = isActive(c);
              return (
                <tr key={c.id} className="border-b transition hover:bg-primary/5">
                  <td className="px-4 py-4">
                    <Link to="/clients/$clientId/edit" params={{ clientId: c.id }} className="flex items-center gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border bg-background shadow-sm">
                        {avatarUrls[c.id]
                          ? <img src={avatarUrls[c.id]} alt={`Logo de ${c.name}`} className="h-full w-full object-cover" />
                          : <span className="grid h-full w-full place-items-center text-sm font-semibold text-white" style={{ background: c.color || "hsl(var(--primary))" }}>{c.name.trim().charAt(0).toUpperCase()}</span>}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold" title={c.name}>{c.name}</span>
                        <span className={`text-xs ${active ? "text-muted-foreground" : "text-amber-700 dark:text-amber-300"}`}>{active ? "Cliente ativo" : "Cliente inativo"}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-4 text-center"><span className="text-lg font-bold">{count}</span> <span className="text-xs text-muted-foreground">{count === 1 ? "tarefa" : "tarefas"}</span></td>
                  <td className="px-4 py-4 text-sm">{(() => {
                    const info = infoOf(c);
                    if (!info.cnpj && !info.responsible && !info.units) return <span className="text-muted-foreground">{info.fallback}</span>;
                    return <div className="space-y-0.5">
                      {info.cnpj && <p><span className="text-muted-foreground">CNPJ </span><span className="font-medium tabular-nums">{info.cnpj}</span></p>}
                      {info.responsible && <p className="truncate" title={info.responsible}><span className="text-muted-foreground">Responsável </span>{info.responsible}</p>}
                      {info.units > 0 && <p className="text-xs font-medium text-primary">{info.units} {info.units === 1 ? "pátio/filial" : "pátios/filiais"}</p>}
                    </div>;
                  })()}</td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end gap-1">
                      <Button asChild size="icon" variant="ghost" className={iconButton} title="Documentos do cliente">
                        <Link to="/clients/$clientId/edit" params={{ clientId: c.id }} search={{ aba: "documentos" } as any}><FileText className="h-4 w-4" /></Link>
                      </Button>
                      <Button asChild size="icon" variant="ghost" className={iconButton} title="Relatório IA">
                        <Link to="/client-report/$clientId" params={{ clientId: c.id }}><Sparkles className="h-4 w-4" /></Link>
                      </Button>
                      <Button asChild size="icon" variant="ghost" className={iconButton} title="Editar cliente">
                        <Link to="/clients/$clientId/edit" params={{ clientId: c.id }}><Pencil className="h-4 w-4" /></Link>
                      </Button>
                      <Button size="icon" variant="ghost" className={iconButton} title={active ? "Arquivar cliente" : "Reativar cliente"} onClick={() => void toggleActive(c)}>
                        {active ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
                      </Button>
                      <Button size="icon" variant="ghost" className="h-9 w-9 rounded-lg hover:bg-destructive/10" title="Excluir cliente" onClick={() => remove(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loadingList && !filteredClients.length && (
              <tr><td colSpan={4} className="p-12 text-center text-sm text-muted-foreground">{clients.length ? "Nenhum cliente encontrado para estes filtros." : "Nenhum cliente cadastrado. Crie um para começar."}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit ? "Editar" : "Novo"} cliente</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>CNPJ</Label>
              <Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} /></div>
            <div className="space-y-2">
                <Label>Nome fantasia</Label>
                <Input value={tradeName} onChange={(e) => setTradeName(e.target.value)} />
            </div>
            <div className="space-y-2">
                <Label>Razão social</Label>
                <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} /></div>
            <div className="space-y-2">
                <Label>Inscrição Estadual</Label>
                <Input value={stateRegistration} onChange={(e) => setStateRegistration(e.target.value)} />
            </div>
            <div className="space-y-2">
                <Label>Inscrição Municipal</Label>
                <Input value={municipalRegistration} onChange={(e) => setMunicipalRegistration(e.target.value)} />
            </div>
            <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
                <Label>E-mail</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Endereço completo</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            </div>
            <div className="space-y-2"><Label>Responsável</Label><Input value={responsible} onChange={(e) => setResponsible(e.target.value)} /></div>
            <div className="space-y-2"><Label>Descrição</Label><Input value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
            <div className="space-y-2"><Label>Cor</Label><Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10" /></div>
            <Button onClick={save} className="w-full">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
