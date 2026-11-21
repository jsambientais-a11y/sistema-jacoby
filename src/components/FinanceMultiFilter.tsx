import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function FinanceMultiFilter({
  label,
  allLabel,
  options,
  value,
  onChange,
}: {
  label: string;
  allLabel: string;
  options: { id: string; name: string }[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const selected = options.filter((option) => value.includes(option.id));
  const current = selected.length ? selected.map((option) => option.name).join(", ") : allLabel;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          aria-label={`${label}: ${current}`}
          className="h-9 max-w-52 gap-2 font-normal"
        >
          <span className="truncate">{current}</span>
          <ChevronDown className="size-4 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-60 overflow-y-auto">
        <DropdownMenuItem onSelect={() => onChange([])}>{allLabel}</DropdownMenuItem>
        <DropdownMenuSeparator />
        {options.map(({ id, name }) => (
          <DropdownMenuCheckboxItem
            key={id}
            checked={value.includes(id)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) =>
              onChange(checked ? [...value, id] : value.filter((item) => item !== id))
            }
          >
            {name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
