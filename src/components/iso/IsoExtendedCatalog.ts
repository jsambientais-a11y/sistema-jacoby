import topics from "./iso-topics.json";
import type { IsoEvidence, IsoNc, IsoQuestion } from "./IsoWorkspace";
export const isoStandards = [
  "ISO 9001",
  "ISO 14001",
  "ISO 45001",
  "ISO 27001",
  "ISO 28000",
  "ISO 31000",
  "IATF 16949",
  "SGI",
];
export const isoProcesses = [
  "Comercial",
  "Produção",
  "RH",
  "Compras",
  "Qualidade",
  "Manutenção",
  "Logística",
  "Meio Ambiente",
  "SSO",
  "Alta Direção",
  "Projeto e Desenvolvimento",
  "Assistência Técnica",
  "TI e Segurança da Informação",
  "Contratadas e Terceiros",
  "Planejamento da Qualidade",
  "Gestão de Fornecedores",
  "Metrologia e Laboratório",
  "Inspeção e Ensaios",
];
export const extendedQuestions: IsoQuestion[] = topics.flatMap((t) => [
  {
    id: `${t.id}-method`,
    standard: t.standard,
    clause: t.clause,
    process: t.process,
    question: `Como o processo controla ${t.focus}?`,
    objective: `Conhecer a sistemática de ${t.title.toLocaleLowerCase("pt-BR")} e sua aplicação.`,
    expected: t.expected,
    alert: "Método não definido, responsabilidade incerta ou prática diferente do procedimento.",
  },
  {
    id: `${t.id}-sample`,
    standard: t.standard,
    clause: t.clause,
    process: t.process,
    question: `Apresente uma amostra recente de ${t.title.toLocaleLowerCase("pt-BR")} e explique o resultado e as pendências encontradas.`,
    objective:
      "Comparar o método descrito com registros e observações de uma amostra identificada.",
    expected: `Amostra datada e rastreável que demonstre ${t.expected}.`,
    alert: "Registro sem referência, amostra fora do escopo ou desvios sem tratamento.",
  },
]);
export const extendedEvidence: IsoEvidence[] = topics.map((t) => ({
  id: `${t.id}-evidence`,
  standard: t.standard,
  clause: t.clause,
  title: t.title,
  type: "Registro",
  risk: "Médio",
  description: `Verifique ${t.expected}. Identifique a amostra, o período e a pessoa que apresentou a evidência.`,
  example: `Registro de ${t.title.toLocaleLowerCase("pt-BR")} da unidade [UNIDADE], período [PERÍODO], com referência [DOCUMENTO/AMOSTRA].`,
}));
export const extendedNc: Omit<IsoNc, "id" | "status">[] = topics.map((t) => ({
  standard: t.standard,
  clause: t.clause,
  title: `Lacuna em ${t.title.toLocaleLowerCase("pt-BR")}`,
  finding: `Na amostra [REFERÊNCIA], do processo [PROCESSO], não foi demonstrado o controle de ${t.focus}. Confirmar o requisito aplicável e descrever o fato específico antes de registrar.`,
  evidence: "[Documento, registro, data, local e amostra verificados pelo auditor.]",
  classification: t.standard === "ISO 31000" ? "OFI — Oportunidade de melhoria" : "NC Menor",
  cause: "[Registrar a causa somente após investigação.]",
  action: `[Definir a ação a partir da causa confirmada para ${t.title.toLocaleLowerCase("pt-BR")}.]`,
  closingEvidence: `[Referência que demonstre a execução da ação e avaliação da eficácia.]`,
}));
export type IsoPrompt = {
  id: string;
  title: string;
  standard: string;
  clause: string;
  process: string;
  category: string;
  body: string;
  tip: string;
};
const promptTypes = [
  {
    id: "interview",
    category: "Preparação da auditoria",
    instruction:
      "Prepare perguntas abertas para uma entrevista de auditoria, indique a evidência a solicitar e as perguntas de aprofundamento. Não conclua conformidade sem amostra.",
  },
  {
    id: "analysis",
    category: "Análise de evidências",
    instruction:
      "Organize os fatos fornecidos em evidência observada, informação ausente e hipóteses a confirmar. Separe observação de conclusão e não invente documentos.",
  },
  {
    id: "action",
    category: "Plano de ação",
    instruction:
      "Proponha um roteiro para investigar causas e um plano 5W2H. Diferencie correção imediata de ação corretiva. Inclua responsável, prazo, recurso e verificação de eficácia, todos a validar pela equipe.",
  },
];
export const promptCatalog: IsoPrompt[] = topics.flatMap((t) =>
  promptTypes.map((kind) => ({
    id: `${t.id}-prompt-${kind.id}`,
    title: `${t.title} · ${kind.category}`,
    standard: t.standard,
    clause: t.clause,
    process: t.process,
    category: kind.category,
    body: `Contexto: auditoria de ${t.standard}, tema ${t.title}, processo ${t.process}. A referência de cláusula ${t.clause} deve ser conferida na edição aplicável.\nEmpresa: [EMPRESA]\nEscopo e unidade: [ESCOPO]\nFatos e documentos disponíveis: [FATOS]\n\n${kind.instruction}\nConsidere o controle de ${t.focus}. Sinalize incertezas e informações que precisam ser confirmadas pelo auditor.`,
    tip: "Substitua os campos entre colchetes. Use dados autorizados e revise o resultado antes de utilizá-lo na auditoria.",
  })),
);
