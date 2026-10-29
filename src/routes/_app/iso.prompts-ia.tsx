import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Copy, Star, Plus } from "lucide-react";
import { toast } from "sonner";
import { promptCatalog, type IsoPrompt } from "@/components/iso/IsoExtendedCatalog";
import { useIsoWorkspace } from "@/components/iso/IsoWorkspace";
export const Route = createFileRoute("/_app/iso/prompts-ia")({ component: Prompts });
const field = "h-10 rounded-lg border bg-white px-3 text-sm";
function Prompts() {
  const { prompts, selected, favorites, toggleFavorite, saveLibraryItem, archivedIds, logAction } =
    useIsoWorkspace();
  const [search, setSearch] = useState("");
  const [standard, setStandard] = useState("");
  const [process, setProcess] = useState("");
  const [category, setCategory] = useState("");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [limit, setLimit] = useState(18);
  const [preview, setPreview] = useState<IsoPrompt | null>(null);
  const [body, setBody] = useState("");
  const all = [...promptCatalog, ...prompts].filter((p) => !archivedIds.includes(p.id));
  const shown = useMemo(
    () =>
      all.filter(
        (p) =>
          (!standard || p.standard === standard) &&
          (!process || p.process === process) &&
          (!category || p.category === category) &&
          (!onlyFavorites || favorites.includes(p.id)) &&
          `${p.title} ${p.body} ${p.clause}`
            .toLocaleLowerCase("pt-BR")
            .includes(search.toLocaleLowerCase("pt-BR")),
      ),
    [all, standard, process, category, onlyFavorites, favorites, search],
  );
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Prompt copiado.");
      logAction("Prompt copiado", "Biblioteca de prompts");
    } catch {
      toast.error("O navegador não permitiu copiar. Abra o prompt e selecione o texto.");
    }
  };
  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-7 sm:px-7">
      <header>
        <h1 className="text-2xl font-bold">Biblioteca de Prompts de IA</h1>
        <p className="mt-1 text-sm text-[#6c7d70]">
          Modelos próprios da Jacoby para preparar entrevistas, analisar evidências e planejar
          ações.
        </p>
      </header>
      <div className="rounded-lg border-l-4 border-[#46a45c] bg-[#edf6ef] p-4 text-sm">
        Escolha um prompt, personalize os campos entre colchetes e copie para sua ferramenta de IA.
        Nenhum dado é enviado automaticamente.
      </div>
      <section className="grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-4">
        <input
          aria-label="Buscar prompts"
          className={field}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setLimit(18);
          }}
          placeholder="Buscar título, tema ou cláusula"
        />
        {(
          [
            [standard, setStandard, "Todas as normas", "standard"],
            [process, setProcess, "Todos os processos", "process"],
            [category, setCategory, "Todas as categorias", "category"],
          ] as const
        ).map(([value, set, label, key]) => (
          <select
            key={key}
            aria-label={label}
            className={field}
            value={value}
            onChange={(e) => {
              set(e.target.value);
              setLimit(18);
            }}
          >
            <option value="">{label}</option>
            {[...new Set(all.map((p) => p[key]))].sort().map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyFavorites}
            onChange={(e) => setOnlyFavorites(e.target.checked)}
          />
          Somente favoritos
        </label>
        <button
          type="button"
          className="rounded-lg border px-3 py-2 text-sm"
          onClick={() => {
            setSearch("");
            setStandard("");
            setProcess("");
            setCategory("");
            setOnlyFavorites(false);
            setLimit(18);
          }}
        >
          Limpar filtros
        </button>
        <p className="self-center text-sm text-[#6c7d70]">{shown.length} prompt(s) encontrado(s)</p>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        {shown.slice(0, limit).map((p) => (
          <article key={p.id} className="space-y-3 rounded-xl border bg-white p-5">
            <div className="flex justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#39814a]">
                  {p.standard} {p.clause} · {p.process}
                </p>
                <h2 className="mt-1 font-bold">{p.title}</h2>
              </div>
              <button
                type="button"
                aria-label={`${favorites.includes(p.id) ? "Remover favorito" : "Favoritar"}: ${p.title}`}
                onClick={() => toggleFavorite(p.id)}
              >
                <Star
                  className={`h-4 w-4 ${favorites.includes(p.id) ? "fill-amber-400 text-amber-500" : "text-[#829287]"}`}
                />
              </button>
            </div>
            <p className="line-clamp-5 whitespace-pre-wrap rounded-lg bg-[#f5f8f4] p-3 text-xs leading-relaxed">
              {p.body}
            </p>
            <p className="text-xs text-[#6c7d70]">{p.tip}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void copy(p.body)}
                className="flex items-center gap-1 rounded-lg bg-[#2c7b38] px-3 py-2 text-xs font-semibold text-white"
              >
                <Copy className="h-3 w-3" />
                Copiar prompt
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreview(p);
                  setBody(
                    p.body
                      .replaceAll("[EMPRESA]", selected.organization || "[EMPRESA]")
                      .replaceAll("[ESCOPO]", selected.scope || "[ESCOPO]"),
                  );
                }}
                className="rounded-lg border px-3 py-2 text-xs"
              >
                Personalizar
              </button>
              <button
                type="button"
                onClick={() => {
                  saveLibraryItem("prompts", {
                    ...p,
                    id: crypto.randomUUID(),
                    title: `Meu modelo — ${p.title}`,
                  });
                  toast.success("Cópia editável salva na Minha biblioteca.");
                }}
                className="flex items-center gap-1 rounded-lg border px-3 py-2 text-xs"
              >
                <Plus className="h-3 w-3" />
                Salvar como meu modelo
              </button>
            </div>
          </article>
        ))}
      </div>
      {!shown.length && (
        <p className="rounded-xl border bg-white p-8 text-center text-sm text-[#6c7d70]">
          Nenhum prompt corresponde aos filtros.
        </p>
      )}
      {shown.length > limit && (
        <button
          type="button"
          className="rounded-lg border bg-white px-4 py-2 text-sm"
          onClick={() => setLimit((v) => v + 18)}
        >
          Carregar mais 18
        </button>
      )}
      {preview && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Personalizar prompt"
            className="w-full max-w-3xl space-y-4 rounded-xl bg-white p-6"
          >
            <h2 className="text-xl font-bold">{preview.title}</h2>
            <textarea
              aria-label="Texto do prompt"
              className="min-h-72 w-full rounded-lg border p-3 text-sm"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <p className="text-xs text-[#6c7d70]">
              A personalização usa somente os dados desta auditoria. Revise antes de copiar.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="rounded-lg border px-4 py-2 text-sm"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => void copy(body)}
                className="rounded-lg bg-[#2c7b38] px-4 py-2 text-sm text-white"
              >
                Copiar texto personalizado
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
