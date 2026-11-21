import { useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { useFinanceSuppliers } from "@/hooks/use-finance-suppliers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

const supplierKey = (name: string) => name.trim().toLocaleLowerCase("pt-BR");
const searchKey = (name: string) => supplierKey(name).normalize("NFD").replace(/\p{M}/gu, "");

export function PayableSupplierField({
  value,
  onChange,
}: {
  value: string;
  onChange: (name: string) => void;
}) {
  const suppliers = useFinanceSuppliers();
  const [open, setOpen] = useState(false);
  const name = value.trim();
  const saved = suppliers.data?.some(
    (supplier) => supplierKey(supplier.name) === supplierKey(name),
  );
  const save = async () => {
    try {
      const result = await suppliers.save.mutateAsync(name);
      toast.success(
        result === "existing"
          ? "Este fornecedor já está salvo."
          : "Fornecedor salvo para outros lançamentos.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o fornecedor.");
    }
  };
  return (
    <div className="space-y-1.5">
      <Label htmlFor="finance-party">Fornecedor / favorecido</Label>
      <Input
        id="finance-party"
        maxLength={500}
        value={value}
        placeholder="Digite o nome ou selecione um salvo"
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" size="sm" variant="outline">
              Fornecedores salvos <ChevronDown className="ml-1 size-3.5" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] p-0">
            <Command
              filter={(option, search) => Number(searchKey(option).includes(searchKey(search)))}
            >
              <CommandInput aria-label="Pesquisar fornecedor" placeholder="Pesquisar fornecedor…" />
              <CommandList>
                <CommandEmpty>
                  {suppliers.error
                    ? "Não foi possível carregar os fornecedores."
                    : suppliers.isLoading
                      ? "Carregando fornecedores…"
                      : "Nenhum fornecedor encontrado."}
                </CommandEmpty>
                {suppliers.data?.map((supplier) => (
                  <CommandItem
                    key={supplier.id}
                    value={supplier.name}
                    onSelect={() => {
                      onChange(supplier.name);
                      setOpen(false);
                    }}
                  >
                    <span className="min-w-0 break-words">{supplier.name}</span>
                    {supplierKey(supplier.name) === supplierKey(name) && (
                      <Check className="ml-auto size-4 shrink-0" aria-hidden="true" />
                    )}
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {!!name && !saved && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={suppliers.isLoading || suppliers.save.isPending}
            onClick={() => void save()}
          >
            <Plus className="mr-1 size-3.5" aria-hidden="true" />
            {suppliers.save.isPending ? "Salvando…" : "Salvar fornecedor"}
          </Button>
        )}
      </div>
    </div>
  );
}
