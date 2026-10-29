import { createFileRoute, Link } from "@tanstack/react-router";
import { useIsoWorkspace } from "@/components/iso/IsoWorkspace";
import { useState } from "react";
export const Route = createFileRoute("/_app/iso/manual")({ component: Manual });
const guides = [
  {
    title: "1. Preparar a auditoria",
    to: "/iso",
    body: "Crie a auditoria com nome, empresa, tipo, data e normas. No Kit Pré-Auditoria, marque os itens como pendentes, em andamento ou concluídos. O percentual representa a preparação, e não uma aprovação da empresa.",
  },
  {
    title: "2. Montar o plano",
    to: "/iso/plano",
    body: "Informe objetivo, escopo, critérios, processos, papel do auditor e horas. Acrescente cronograma, pessoas convocadas e logística. Gere o plano em PDF para revisar antes de compartilhar.",
  },
  {
    title: "3. Selecionar entrevistas",
    to: "/iso/roteiros",
    body: "Filtre norma, cláusula e processo. Selecione perguntas para a auditoria ativa, consulte objetivo, evidências esperadas e alertas. Salve um conjunto de filtros para retomar depois. Perguntas próprias podem ser cadastradas na Minha biblioteca.",
  },
  {
    title: "4. Auditar e guardar evidências",
    to: "/iso/evidencias",
    body: "Registre a resposta observada, a evidência objetiva e o resultado de cada pergunta. Use referências que identifiquem documento, data e amostra. Anexe arquivos à entrevista. A biblioteca de evidências orienta a coleta, mas a avaliação é feita pelo auditor.",
  },
  {
    title: "5. Formalizar as constatações",
    to: "/iso/nao-conformidades",
    body: "Revise as respostas marcadas como parcial ou não conforme. Formalize uma NC com fato, requisito e evidência. Os modelos de NC são pontos de partida: substitua os campos e confirme a cláusula aplicável. Edite, acompanhe o status e vincule um plano de ação.",
  },
  {
    title: "6. Tratar com PAC",
    to: "/iso/pac",
    body: "Crie o plano a partir da NC para reaproveitar seus dados. Defina causa, ação, responsável, prazo e evidência de fechamento. Use quadro ou lista e filtre os atrasados. Concluir um plano exige evidência e não encerra automaticamente a NC.",
  },
  {
    title: "7. Revisar e entregar",
    to: "/iso/relatorio",
    body: "Confira dados, entrevistas, evidências, NCs e planos. Redija pontos fortes e conclusão. O relatório não inventa conclusão positiva. As pendências são mostradas na revisão e o PDF é identificado como rascunho quando necessário.",
  },
  {
    title: "8. Personalizar a biblioteca",
    to: "/iso/biblioteca",
    body: "Cadastre processos, critérios, perguntas, evidências, modelos de NC e prompts. Itens próprios aparecem nas respectivas telas. Arquivar mantém o histórico das auditorias que já os utilizaram. Os favoritos ficam disponíveis na Minha biblioteca.",
  },
  {
    title: "9. Utilizar os prompts",
    to: "/iso/prompts-ia",
    body: "Filtre o catálogo de prompts e personalize o contexto com os dados da auditoria. Copie o texto para sua ferramenta de IA. O sistema não envia dados automaticamente e não simula uma resposta de IA.",
  },
  {
    title: "10. Log e experiência",
    to: "/iso/log-auditor",
    body: "Consulte atividades registradas e a experiência informada em auditorias. Gere a declaração PDF com organizações anonimizadas quando desejar. Revise as horas e períodos no planejamento antes de emitir.",
  },
  {
    title: "11. Guardar e restaurar os dados",
    to: "/iso/biblioteca",
    body: "Exporte regularmente o backup ZIP completo da Minha biblioteca, incluindo arquivos. Para restaurar, selecione um ZIP ou JSON compatível, confira as quantidades e confirme. O arquivo é validado antes de substituir os dados deste ambiente. JSON sem anexos continua aceito; arquivos exigem o ZIP completo.",
  },
  {
    title: "12. Manter auditorias separadas",
    to: "/iso/dashboard",
    body: "O seletor no cabeçalho troca a auditoria ativa. Checklist, respostas, NCs, planos e arquivos pertencem à auditoria selecionada. A biblioteca própria é reutilizável. Duplicar uma auditoria reaproveita o planejamento e roteiro, sem copiar conclusões, respostas ou anexos.",
  },
] as const;
function Manual() {
  const { remote } = useIsoWorkspace();
  const [search, setSearch] = useState("");
  const shown = guides.filter((g) =>
    `${g.title} ${g.body}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")),
  );
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-7 sm:px-7">
      <header>
        <h1 className="text-2xl font-bold">Manual de Uso</h1>
        <p className="mt-1 text-sm text-[#6c7d70]">
          Do planejamento à entrega: como usar o ambiente ISO da Jacoby.
        </p>
      </header>
      <input
        aria-label="Buscar no manual"
        className="h-11 w-full rounded-lg border bg-white px-4 text-sm"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar etapa, dúvida ou função"
      />
      {shown.map((g) => (
        <details key={g.title} open={Boolean(search)} className="rounded-xl border bg-white p-5">
          <summary className="cursor-pointer font-bold">{g.title}</summary>
          <p className="mt-3 text-sm leading-relaxed text-[#5e7565]">{g.body}</p>
          <Link
            to={g.to}
            className="mt-3 inline-block text-sm font-semibold text-[#28713a] underline"
          >
            Abrir esta tela →
          </Link>
        </details>
      ))}
      {!shown.length && (
        <p className="rounded-xl border bg-white p-6 text-sm">Nenhum tópico encontrado.</p>
      )}
      <aside className="rounded-xl border bg-[#edf6ef] p-5 text-sm">
        <b>Onde os dados ficam?</b>
        <p className="mt-2">
          {remote
            ? "Os dados ficam no Supabase da Jacoby, compartilhados somente com contas autorizadas. Os arquivos ficam em um bucket privado. As alterações de outras sessões são consultadas a cada 10 segundos. Salvo no servidor confirma a gravação; em caso de conflito ou falha a edição é bloqueada e a cópia local é preservada para exportação. A administração concede leitura ou edição na Minha biblioteca."
            : "Na prévia local, os dados e anexos ficam neste navegador. Use o backup completo para transportar o ambiente."}
        </p>
        <p className="mt-2">
          Os catálogos são material de apoio editável da Jacoby. Confirme a norma, edição, cláusula,
          requisito e evidência aplicáveis antes de formalizar um achado.
        </p>
      </aside>
    </div>
  );
}
