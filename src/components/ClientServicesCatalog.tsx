import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { ServiceLinks } from "@/components/ServiceLinks";

type CatalogService = { id: string; name: string; branch_id: string | null; active: boolean };
type ClientRate = { waste_service_id: string; default_rate: number };
const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
export function ClientServicesCatalog({
  clientId,
  clientName,
  services,
  ownedIds,
  rates,
  branches,
  companyName,
  onEdit,
  onDelete,
  onCreate,
}: {
  clientId: string;
  clientName: string;
  services: CatalogService[];
  ownedIds: string[];
  rates: ClientRate[];
  branches: { id: string; name: string }[];
  companyName: (id: string) => string;
  onEdit: (service: CatalogService) => void;
  onDelete: (service: CatalogService) => void;
  onCreate: () => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState("client");
  const [search, setSearch] = useState("");
  const [configuring, setConfiguring] = useState<CatalogService | null>(null);
  const [value, setValue] = useState("");
  const configured = useMemo(
    () => new Set([...ownedIds, ...rates.map((r) => r.waste_service_id)]),
    [ownedIds, rates],
  );
  const clientItems = services.filter((s) => configured.has(s.id));
  const available = services.filter((s) => !configured.has(s.id));
  const visible = (tab === "client" ? clientItems : available).filter((s) =>
    `${s.name} ${companyName(s.id)} ${branches.find((b) => b.id === s.branch_id)?.name || ""}`
      .toLocaleLowerCase("pt-BR")
      .includes(search.trim().toLocaleLowerCase("pt-BR")),
  );
  const saveRate = useMutation({
    mutationFn: async () => {
      const rate = Number(value);
      if (!configuring || !clientId || !value.trim() || !Number.isFinite(rate) || rate < 0)
        throw new Error("Informe um valor válido, maior ou igual a zero.");
      const { error } = await (supabase.from("waste_client_service_rates" as any) as any).upsert(
        { client_id: clientId, waste_service_id: configuring.id, default_rate: rate },
        { onConflict: "client_id,waste_service_id" },
      );
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: ["waste-client-service-rates", clientId] }),qc.invalidateQueries({queryKey:["billing-v2-client-service-rates",clientId]})]);
      toast.success("Valor padrão configurado para este cliente.");
      setConfiguring(null);
      setTab("client");
      setSearch("");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  function configure(service: CatalogService) {
    const rate = rates.find((r) => r.waste_service_id === service.id);
    setValue(rate ? String(rate.default_rate) : "");
    setConfiguring(service);
  }
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b p-5">
        <div>
          <h2 className="text-xl font-semibold">Serviços de {clientName}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Confira o que já foi configurado para este cliente ou consulte os serviços
            compartilhados das terceirizadas.
          </p>
        </div>
        <Button variant="outline" onClick={onCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Criar novo serviço
        </Button>
      </div>
      <div className="space-y-4 p-5">
        <div
          className="flex flex-wrap gap-2"
          role="tablist"
          aria-label="Catálogo de serviços do cliente"
        >
          <Button
            role="tab"
            aria-selected={tab === "client"}
            variant={tab === "client" ? "default" : "outline"}
            onClick={() => setTab("client")}
          >
            Configurados para este cliente{" "}
            <span className="ml-2 rounded-full bg-background/20 px-2">{clientItems.length}</span>
          </Button>
          <Button
            role="tab"
            aria-selected={tab === "catalog"}
            variant={tab === "catalog" ? "default" : "outline"}
            onClick={() => setTab("catalog")}
          >
            Catálogo compartilhado{" "}
            <span className="ml-2 rounded-full bg-muted px-2 text-muted-foreground">
              {available.length}
            </span>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {tab === "client"
            ? "Serviços criados neste cliente ou com um valor padrão salvo para ele. O valor efetivamente cobrado é registrado no BM."
            : "Serviços disponíveis no catálogo, ainda sem configuração para este cliente. Configurar valor salva apenas o valor deste cliente; o cadastro compartilhado permanece o mesmo."}
        </p>
        <div className="relative max-w-lg">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            aria-label="Buscar serviços"
            placeholder="Buscar serviço, terceirizada ou filial…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      {!visible.length ? (
        <div className="border-t p-8 text-center">
          <h3 className="font-semibold">
            {search
              ? "Nenhum serviço corresponde à busca"
              : tab === "client"
                ? "Nenhum serviço configurado para este cliente"
                : "Todos os serviços disponíveis já estão configurados"}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {search
              ? "Tente outro nome ou limpe a busca."
              : tab === "client"
                ? "Abra o catálogo compartilhado para configurar um serviço existente ou crie um novo."
                : "Você pode criar um novo serviço quando precisar."}
          </p>
          {!search && tab === "client" && (
            <Button className="mt-4" onClick={() => setTab("catalog")}>
              Consultar catálogo compartilhado
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto border-t">
          <table className="w-full min-w-[850px] text-sm">
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="p-4">Serviço / quem executa</th>
                <th className="p-4">Abrangência do cadastro</th>
                <th className="p-4">Valor neste cliente</th>
                <th className="p-4">Ações</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((service) => {
                const rate = rates.find((r) => r.waste_service_id === service.id);
                const branch = branches.find((b) => b.id === service.branch_id);
                return (
                  <tr key={service.id} className="border-t align-top hover:bg-muted/20">
                    <td className="w-[34%] p-4">
                      <p className="font-semibold">{service.name}</p>
                      <p
                        className="mt-1 line-clamp-2 max-w-sm text-xs leading-relaxed text-muted-foreground"
                        title={companyName(service.id)}
                      >
                        {companyName(service.id)}
                      </p>
                    </td>
                    <td className="p-4">
                      <span className="rounded-md bg-muted px-2 py-1 text-xs">
                        {!service.branch_id
                          ? "Geral / matriz"
                          : branch?.name || "Filial do cadastro de origem"}
                      </span>
                      {service.branch_id && !branch && (
                        <p className="mt-2 max-w-40 text-xs text-muted-foreground">
                          A filial original pertence a outro cadastro.
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap p-4">
                      {rate ? (
                        <>
                          <p className="font-semibold">{money(Number(rate.default_rate))}</p>
                          {Number(rate.default_rate) === 0 && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Configurado em zero
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-muted-foreground">Não configurado</p>
                      )}
                      <Button
                        size="sm"
                        variant="link"
                        className="mt-1 h-auto px-0"
                        onClick={() => configure(service)}
                      >
                        <Settings2 className="mr-1 h-3 w-3" />
                        {rate ? "Alterar valor" : "Configurar valor"}
                      </Button>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-2">
                        <ServiceLinks serviceId={service.id} label={service.name} />
                        <Button
                          size="sm"
                          variant="outline"
                          title="Editar o cadastro base do serviço"
                          onClick={() => onEdit(service)}
                        >
                          <Pencil className="mr-1 h-3 w-3" />
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          title="Excluir o cadastro base; pode afetar outros clientes"
                          onClick={() => onDelete(service)}
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
                          Excluir
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t bg-muted/20 px-5 py-3 text-xs leading-relaxed text-muted-foreground">
        Editar e Excluir atuam no cadastro base, que pode ser compartilhado. Para mudar somente o
        valor deste cliente, use Alterar valor. Exceções por terceirizada ou filial continuam em
        Valores específicos, abaixo.
      </p>
      <Dialog
        open={!!configuring}
        onOpenChange={(open) => {
          if (!open && !saveRate.isPending) setConfiguring(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Valor padrão para {clientName}</DialogTitle>
          <DialogDescription>
            {configuring?.name} · Este valor será sugerido para novos lançamentos compatíveis. Os
            valores já registrados nos BMs são preservados.
          </DialogDescription>
          <div className="space-y-2">
            <Label htmlFor="client-service-default-rate">Valor padrão (R$)</Label>
            <Input
              id="client-service-default-rate"
              type="number"
              min="0"
              step="0.01"
              placeholder="Ex.: 300,00"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Zero é um valor válido. As regras específicas por terceirizada e filial continuam
              tendo prioridade.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={saveRate.isPending}
              onClick={() => setConfiguring(null)}
            >
              Cancelar
            </Button>
            <Button disabled={saveRate.isPending} onClick={() => saveRate.mutate()}>
              {saveRate.isPending ? "Salvando…" : "Salvar valor deste cliente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
