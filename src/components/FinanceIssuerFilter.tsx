import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { searchFinanceIssuers, type FinanceIssuer } from "@/lib/finance-issuer";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export function FinanceIssuerFilter({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: FinanceIssuer[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const matches = searchFinanceIssuers(options, query);
  const select = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-label="Quem fatura"
          aria-expanded={open}
          className="h-9 w-56 justify-between"
        >
          <span className="truncate">
            {value === "all"
              ? "Quem fatura: todos"
              : options.find((option) => option.id === value)?.name ||
                "Emissor selecionado indisponível"}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            aria-label="Pesquisar quem fatura"
            placeholder="Pesquisar terceirizada ou Jacoby…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandGroup>
              <CommandItem value="all" onSelect={() => select("all")}>
                Quem fatura: todos{value === "all" && <Check className="ml-auto h-4 w-4" />}
              </CommandItem>
              {matches.map((option) => (
                <CommandItem key={option.id} value={option.id} onSelect={() => select(option.id)}>
                  {option.name}
                  {value === option.id && <Check className="ml-auto h-4 w-4" />}
                </CommandItem>
              ))}
            </CommandGroup>
            {!matches.length && (
              <p role="status" className="px-3 py-4 text-center text-sm">
                Nenhum emissor encontrado.
              </p>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
