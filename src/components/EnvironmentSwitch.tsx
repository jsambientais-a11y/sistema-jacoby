import { Link } from "@tanstack/react-router";

/** Alternância visual entre as duas áreas; a autorização continua nas rotas. */
export function EnvironmentSwitch({
  active,
  onNavigate,
  className = "",
}: {
  active: "management" | "iso";
  onNavigate?: () => void;
  className?: string;
}) {
  const itemClass = (selected: boolean) =>
    `rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
      selected
        ? "bg-white text-[#276f37] shadow-sm"
        : "text-[#607665] hover:bg-white/70 hover:text-[#244e30]"
    }`;

  return (
    <nav
      aria-label="Alternar ambiente"
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-[#d9e5d8] bg-[#f2f7f0] p-0.5 ${className}`}
    >
      <Link
        to="/dashboard"
        aria-current={active === "management" ? "page" : undefined}
        onClick={onNavigate}
        className={itemClass(active === "management")}
      >
        Gestão
      </Link>
      <Link
        to="/iso"
        aria-current={active === "iso" ? "page" : undefined}
        onClick={onNavigate}
        className={itemClass(active === "iso")}
      >
        ISO
      </Link>
    </nav>
  );
}
