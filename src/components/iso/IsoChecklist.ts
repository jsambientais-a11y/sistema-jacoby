export const isoChecklistStages = [
  {
    title: "90 dias antes",
    items: [
      ["scope", "Confirmar escopo, unidades e normas aplicáveis", "Coordenação SGI"],
      ["certifier", "Alinhar datas e requisitos com o organismo certificador", "Coordenação SGI"],
      ["program", "Revisar o programa de auditorias internas", "Equipe de auditoria"],
      ["manual", "Revisar política, manual e procedimentos vigentes do SGI", "Coordenação SGI"],
      ["legal", "Atualizar requisitos legais e outros requisitos", "Meio ambiente / SSO"],
      [
        "changes",
        "Levantar mudanças em processos, instalações e produtos desde a última auditoria",
        "Gestores dos processos",
      ],
      [
        "initial-review",
        "Iniciar análise dos indicadores, riscos e resultados recentes",
        "Alta direção",
      ],
      [
        "internal-program",
        "Planejar auditorias internas para todo o escopo",
        "Equipe de auditoria",
      ],
    ],
  },
  {
    title: "30 dias antes",
    items: [
      ["internal", "Concluir auditorias internas do escopo", "Equipe de auditoria"],
      ["indicators", "Consolidar indicadores dos processos", "Gestores dos processos"],
      ["risks", "Revisar riscos, aspectos ambientais e perigos ocupacionais", "Coordenação SGI"],
      ["nc-review", "Revisar não conformidades e ações corretivas abertas", "Coordenação SGI"],
      ["environment", "Revisar a matriz de aspectos e impactos ambientais", "Meio ambiente"],
      ["sso", "Conferir a avaliação de perigos e riscos ocupacionais", "SSO"],
      ["practice", "Simular entrevistas com os donos dos processos", "Coordenação SGI"],
      ["training", "Conferir treinamentos obrigatórios e calibrações", "RH / Manutenção"],
      [
        "legal-check",
        "Verificar a avaliação periódica dos requisitos legais",
        "Meio ambiente / SSO",
      ],
    ],
  },
  {
    title: "15 dias antes",
    items: [
      [
        "nc-close",
        "Fechar pendências críticas e guardar evidências de eficácia",
        "Responsáveis pelos processos",
      ],
      ["documents", "Organizar documentos e registros por processo", "Coordenação SGI"],
      ["interviews", "Confirmar disponibilidade dos entrevistados", "Gestores dos processos"],
      ["opening", "Preparar apresentação de abertura e dados do SGI", "Alta direção"],
      ["evidence-folder", "Consolidar evidências por norma e cláusula", "Coordenação SGI"],
      ["digital-files", "Organizar pastas digitais e acessos de consulta", "Coordenação SGI"],
      ["licenses", "Verificar vigência de licenças e documentos ambientais", "Meio ambiente"],
    ],
  },
  {
    title: "1 semana antes",
    items: [
      ["review", "Realizar a análise crítica da direção", "Alta direção"],
      ["communicate", "Comunicar o plano de auditoria aos envolvidos", "Coordenação SGI"],
      ["briefing", "Orientar os auditados sobre o fluxo da auditoria", "Coordenação SGI"],
      ["logistics", "Conferir sala, acessos e EPIs necessários", "Administrativo / SESMT"],
      ["critical-questions", "Repassar perguntas críticas com gestores", "Coordenação SGI"],
      ["opening-final", "Validar a apresentação de abertura", "Alta direção"],
      ["system-access", "Testar acesso de leitura aos sistemas necessários", "TI"],
      [
        "visitor",
        "Preparar crachá, intérprete e recursos para visitantes",
        "Administrativo / SESMT",
      ],
    ],
  },
  {
    title: "Dia da auditoria",
    items: [
      ["host", "Designar responsável para acompanhar o auditor", "Coordenação SGI"],
      ["evidence", "Manter evidências e equipe de apoio disponíveis", "Gestores dos processos"],
      ["record", "Registrar solicitações e achados da auditoria", "Equipe de auditoria"],
      ["room", "Disponibilizar sala, sistemas e organograma", "Administrativo / RH"],
      ["field-guide", "Acompanhar o auditor nas visitas de campo", "Coordenação SGI"],
      ["scribe", "Registrar em tempo real os pontos levantados", "Equipe de auditoria"],
      ["evidence-kit", "Manter o kit digital de evidências acessível", "Coordenação SGI"],
      [
        "daily-close",
        "Alinhar os achados em reunião de fechamento do dia",
        "Coordenação SGI / Alta direção",
      ],
    ],
  },
];
export const isoChecklist = isoChecklistStages.flatMap((stage) =>
  stage.items.map(([id, title]) => ({ id, title })),
);
