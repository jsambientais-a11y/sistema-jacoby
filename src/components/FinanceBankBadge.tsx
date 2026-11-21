import { bankAccountUsage, type BankAccountUsage } from "@/lib/enterprise-finance";

const styles = {
  personal:
    "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-100",
  business:
    "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100",
  neutral: "border-border bg-muted text-muted-foreground",
};

export function FinanceBankBadge({
  bank,
}: {
  bank: { name: string; account_usage?: BankAccountUsage | null };
}) {
  const usage = bankAccountUsage(bank);
  const label = usage === "personal" ? "Pessoal" : usage === "business" ? "Empresarial" : "";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${styles[usage || "neutral"]}`}
    >
      {bank.name}
      {label && <span className="opacity-80">· {label}</span>}
    </span>
  );
}
