/**
 * Símbolo compacto da Jacoby (folhas + borboleta), para espaços onde o logo
 * completo fica ilegível: menu recolhido e cabeçalho do celular.
 * O símbolo balança de leve quando um ancestral com a classe `group` recebe hover.
 */
import jacobySymbol from "@/assets/jacoby-symbol.svg";

export function JacobyMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span className={`jacoby-mark grid place-items-center rounded-xl bg-white p-0.5 shadow-sm ring-1 ring-border ${className}`}>
      <img src={jacobySymbol} alt="Jacoby Soluções" className="h-full w-full object-contain" />
    </span>
  );
}
