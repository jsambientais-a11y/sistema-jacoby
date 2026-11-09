import { z } from "zod";
import { buildBillingFlowEntries } from "../lib/billing-flow-model";
import { toReceivable, summarizeReceivables } from "../lib/receivables";
import { billingAgreement } from "../lib/billing-agreement";
import { CYCLE_INVOICE_BUCKET, listCycleInvoices } from "../lib/cycle-invoices";
import { assistantActionInput, assistantActionSchema, assistantDate } from "../lib/chatgpt-actions";

const resources = {
  clientes: {
    table: "clients",
    fields: "id,name,email,phone,responsible",
    text: "name",
    client: "id",
    route: "/clients",
  },
  filiais: {
    table: "client_branches",
    fields: "id,client_id,name",
    text: "name",
    client: "client_id",
    route: "/clients",
  },
  terceirizadas: {
    table: "outsourced_companies",
    fields: "id,legal_name,trade_name",
    text: "legal_name",
    route: "/terceirizados",
  },
  residuos: {
    table: "waste_residues",
    fields:
      "id,client_id,branch_id,name,unit,active,default_rental_rate,default_exchange_rate,default_treatment_rate,jacoby_pays_client",
    text: "name",
    client: "client_id",
    branch: "branch_id",
    active: "active",
    route: "/portal/residuos?aba=configuracoes",
  },
  equipamentos: {
    table: "waste_equipment",
    fields:
      "id,client_id,branch_id,name,equipment_type,identification,monthly_rental_rate,exchange_rate,default_waste_residue_id,active",
    text: "name",
    client: "client_id",
    branch: "branch_id",
    active: "active",
    route: "/portal/residuos?aba=configuracoes",
  },
  servicos: {
    table: "waste_services",
    fields: "id,client_id,branch_id,name,default_rate,active",
    text: "name",
    client: "client_id",
    branch: "branch_id",
    active: "active",
    route: "/portal/residuos?aba=configuracoes",
  },
  tarefas: {
    table: "tasks",
    fields:
      "id,client_id,title,description,status,column_id,status_id,priority,due_date,assignee_id,completed_at,updated_at",
    text: "title",
    client: "client_id",
    deleted: "deleted_at",
    route: "/tasks/kanban",
  },
  modelos: {
    table: "task_process_templates",
    fields: "id,name,template",
    deleted: "deleted_at",
    text: "name",
    route: "/tasks/kanban",
  },
  documentos: {
    table: "client_documents",
    fields: "id,client_id,branch_id,title,description,file_name,expires_at",
    text: "title",
    client: "client_id",
    branch: "branch_id",
    route: "/portal/documentos",
  },
  contas_pagar: {
    table: "enterprise_finance_accounts",
    fields:
      "id,kind,description,counterparty,category,amount_cents,due_on,settled_on,cost_center_id,bank_account_id,credit_card_id,invoice_month,updated_at",
    text: "description",
    kind: "payable",
    deleted: "deleted_at",
    date: "due_on",
    route: "/contas-a-pagar",
  },
  contas_receber: {
    table: "enterprise_finance_accounts",
    fields:
      "id,kind,description,counterparty,category,amount_cents,due_on,settled_on,cost_center_id,bank_account_id,updated_at",
    text: "description",
    kind: "receivable",
    deleted: "deleted_at",
    date: "due_on",
    route: "/contas-a-receber",
  },
  centros_custo: {
    table: "finance_cost_centers",
    fields: "id,name,kind,active",
    text: "name",
    active: "active",
    route: "/centros-de-custo",
  },
  bancos: {
    table: "finance_bank_accounts",
    fields: "id,name,active",
    text: "name",
    active: "active",
    route: "/bancos",
  },

  cartoes: {
    table: "finance_credit_cards",
    fields: "id,name,bank_label,closing_day,due_day,limit_cents,bank_account_id,active",
    text: "name",
    active: "active",
    route: "/cartoes",
  },
  despesas_cartao: {
    table: "finance_card_purchases",
    fields:
      "id,card_id,description,merchant,category,amount_cents,purchased_on,installments,first_invoice_month,cost_center_id",
    text: "description",
    card: "card_id",
    date: "purchased_on",
    deleted: "deleted_at",
    route: "/cartoes",
  },
  recorrencias: {
    table: "finance_recurring_expenses",
    fields: "id,description,counterparty,amount_cents,frequency,start_on,end_on,active",
    text: "description",
    active: "active",
    route: "/contas-a-pagar",
  },
  comissionamento: {
    table: "outsourced_commission_settings",
    fields:
      "id,client_id,outsourced_company_id,tax_withholding_rate,rental_commission_rate,exchange_commission_rate,active",
    client: "client_id",
    company: "outsourced_company_id",
    active: "active",
    route: "/portal/residuos?aba=configuracoes",
  },
  comissionamento_padrao: {
    table: "outsourced_commission_templates",
    fields:
      "id,outsourced_company_id,tax_withholding_rate,rental_commission_rate,exchange_commission_rate,active",
    company: "outsourced_company_id",
    active: "active",
    route: "/portal/residuos?aba=configuracoes",
  },
  taxas_tratamento: {
    table: "outsourced_treatment_commission_rates",
    fields:
      "id,commission_setting_id,waste_residue_id,outsourced_treatment_rate,jacoby_treatment_rate",
    setting: "commission_setting_id",
    route: "/portal/residuos?aba=configuracoes",
  },
  taxas_tratamento_padrao: {
    table: "outsourced_treatment_commission_template_rates",
    fields:
      "id,commission_template_id,residue_name,outsourced_treatment_rate,jacoby_treatment_rate",
    text: "residue_name",
    template: "commission_template_id",
    route: "/portal/residuos?aba=configuracoes",
  },
} as const;
const resourceNames = Object.keys(resources) as [
  keyof typeof resources,
  ...(keyof typeof resources)[],
];
const page = z.number().int().min(1).max(100).default(1);
const uuid = z.string().uuid();
export const systemSchemas = {
  mapa_sistema: z.object({}).strict(),
  buscar_registros: z
    .object({
      area: z.enum(resourceNames),
      texto: z.string().trim().min(1).max(80).optional(),
      cliente_id: uuid.optional(),
      filial_id: uuid.optional(),
      empresa_id: uuid.optional(),
      cartao_id: uuid.optional(),
      configuracao_id: uuid.optional(),
      modelo_comissao_id: uuid.optional(),
      inicio: assistantDate.optional(),
      fim: assistantDate.optional(),
      id: z.string().min(1).max(150).optional(),
      incluir_desativados: z.boolean().default(false),
      pagina: page,
    })
    .strict(),
  consultar_fluxo_bm: z
    .object({
      numero: z
        .string()
        .regex(/^\d{1,10}$/)
        .optional(),
      id: uuid.optional(),
    })
    .strict()
    .refine((v) => Boolean(v.id || v.numero)),
  consultar_processo: z.object({ id: uuid, pagina: page }).strict(),
  consultar_iso: z
    .object({
      secao: z.enum(["auditorias", "nao_conformidades", "planos", "evidencias", "perguntas"]),
      auditoria_id: z.string().min(1).max(150).optional(),
      texto: z.string().trim().min(1).max(80).optional(),
      pagina: page,
    })
    .strict(),
  preparar_acao: assistantActionInput,
};
const props = {
  pagina: { type: "integer", minimum: 1, maximum: 100, default: 1 },
  texto: { type: "string", minLength: 1, maxLength: 80 },
  id: { type: "string", format: "uuid" },
};
export const systemTools: Record<
  string,
  { description: string; properties: object; required: string[] }
> = {
  mapa_sistema: {
    description:
      "Mostra o mapa de módulos, conexões entre telas, fontes de dados e ferramentas disponíveis. Consulte antes de explicar o sistema inteiro. Não é acesso irrestrito nem inspeção de código em tempo real.",
    properties: {},
    required: [],
  },
  buscar_registros: {
    description:
      "Busca registros reais nas áreas do sistema. Dados paginados, ativos por padrão. Contas a receber aqui são MANUAIS: para recebíveis derivados do BM use consultar_fluxo_bm; nunca some as duas fontes como duplicatas. Não lê o conteúdo de anexos. Filtros não suportados são recusados.",
    properties: {
      area: { type: "string", enum: resourceNames },
      texto: props.texto,
      id: { type: "string", minLength: 1, maxLength: 150 },
      cliente_id: props.id,
      filial_id: props.id,
      empresa_id: props.id,
      cartao_id: props.id,
      configuracao_id: props.id,
      modelo_comissao_id: props.id,
      inicio: { type: "string", format: "date" },
      fim: { type: "string", format: "date" },
      incluir_desativados: { type: "boolean", default: false },
      pagina: props.pagina,
    },
    required: ["area"],
  },
  consultar_fluxo_bm: {
    description:
      "Cruza um BM com cliente, filial, locações, movimentações, serviços, notas anexadas, comissões, conferência do Faturamento e Contas a Receber derivadas. Usa a mesma função de cálculo das telas. Diferencia finalizado, nota informada, estimativa e recebimento. Informe número ou UUID; se ambíguo, peça escolha. Não presume vínculos de contas manuais por texto.",
    properties: { numero: { type: "string", pattern: "^[0-9]{1,10}$" }, id: props.id },
    required: [],
  },
  consultar_processo: {
    description:
      "Consulta uma tarefa e suas subtarefas, responsável e status. Use para entender o andamento real antes de propor alteração.",
    properties: { id: props.id, pagina: props.pagina },
    required: ["id"],
  },
  consultar_iso: {
    description:
      "Consulta a área ISO compartilhada com a permissão atual. Lista auditorias e consulta não conformidades, planos, evidências e perguntas por auditoria. Não lê arquivos nem modifica o workspace.",
    properties: {
      secao: {
        type: "string",
        enum: ["auditorias", "nao_conformidades", "planos", "evidencias", "perguntas"],
      },
      auditoria_id: { type: "string", maxLength: 150 },
      texto: props.texto,
      pagina: props.pagina,
    },
    required: ["secao"],
  },
  preparar_acao: {
    description:
      "Prepara alteração de título/prazo/prioridade de tarefa ou criação de conta manual a pagar/receber. Retorna prévia e link de confirmação na Jacoby, NÃO executa nem salva. Valores em CENTAVOS inteiros; nunca infira valor, data ou natureza ausentes. Não cria baixa/pagamento, não altera BM nem permissões. A proposta expira em 20 minutos.",
    properties: {
      tipo: { type: "string", enum: ["editar_tarefa", "criar_conta"] },
      id: props.id,
      titulo: { type: "string", maxLength: 200 },
      prazo: { type: ["string", "null"], format: "date" },
      prioridade: { type: "string", enum: ["low", "medium", "high", "urgent"] },
      natureza: { type: "string", enum: ["payable", "receivable"] },
      descricao: { type: "string", maxLength: 500 },
      valor_centavos: { type: "integer", minimum: 1, maximum: 1_000_000_000_000 },
      vencimento: { type: "string", format: "date" },
      favorecido: { type: "string", maxLength: 500 },
      categoria: { type: "string", maxLength: 200 },
    },
    required: ["tipo"],
  },
};
function checked(r: any): any[] {
  if (r.error) throw new Error("query_failed");
  return r.data || [];
}
const like = (s: string) => `%${s.replace(/[\\%_]/g, "\\$&")}%`;
const paged = (rows: any[], pagina: number) => ({
  registros: rows.slice(0, 25),
  pagina,
  temMais: rows.length > 25,
});
const todayBr = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export async function runSystemTool(
  name: string,
  args: any,
  db: any,
  origin: string,
): Promise<unknown> {
  if (name === "mapa_sistema")
    return {
      modulos: Object.entries(resources).map(([area, r]) => ({
        area,
        tela: origin + r.route,
        fonte: r.table,
        filtros: Object.entries(r)
          .filter(([key]) =>
            ["client", "branch", "company", "card", "setting", "template", "date", "text"].includes(
              key,
            ),
          )
          .flatMap(
            ([key]) =>
              ({
                client: ["cliente_id"],
                branch: ["filial_id"],
                company: ["empresa_id"],
                card: ["cartao_id"],
                setting: ["configuracao_id"],
                template: ["modelo_comissao_id"],
                date: ["inicio", "fim"],
                text: ["texto"],
              })[key] || [],
          ),
      })),
      conexoes: [
        "Cliente → filiais → resíduos, equipamentos e serviços configurados por cliente/pátio → BM.",
        "BM em edição → locações/movimentações/serviços → finalização → publicação e envio são etapas independentes.",
        "BM finalizado → faturamento por categoria e empresa → conferência da nota e comissão → previsão → baixa do recebimento.",
        "Contas a receber inclui o Faturamento derivado e receitas manuais independentes. Não duplique a mesma receita.",
        "Contas a pagar inclui lançamentos manuais e faturas de cartão. Centro de custo e banco classificam o lançamento.",
        "Tarefas → subtarefas/responsáveis/prazos; modelo reutiliza etapas. Vincular tarefa ao recebível não confirma pagamento.",
        "ISO é um workspace separado, com auditorias, evidências, não conformidades e planos. Permissões próprias.",
      ],
      consultas_especializadas: ["consultar_fluxo_bm", "consultar_processo", "consultar_iso"],
      acoes_com_confirmacao: ["preparar_tarefa", "preparar_acao: editar_tarefa ou criar_conta"],
      limites:
        "Não há SQL livre, mudança de permissão, exclusão, pagamento bancário ou leitura automática do conteúdo de anexos. Explicações de regras vêm deste mapa e dos módulos compartilhados, não de inspeção dinâmica de todo o código.",
    };
  if (name === "buscar_registros") {
    const r: any = resources[args.area as keyof typeof resources];
    if (args.cliente_id && !r.client)
      return {
        erro: "Esta área não possui vínculo direto por cliente. Use id/texto ou consultar_fluxo_bm para o faturamento do BM.",
      };
    if (args.texto && !r.text)
      return { erro: "Esta área deve ser consultada pelos identificadores, sem busca por texto." };
    const scopes = [
      ["filial_id", "branch"],
      ["empresa_id", "company"],
      ["cartao_id", "card"],
      ["configuracao_id", "setting"],
      ["modelo_comissao_id", "template"],
    ];
    if (
      scopes.some(([param, field]) => args[param] && !r[field]) ||
      ((args.inicio || args.fim) && !r.date)
    )
      return {
        erro: "Filtro incompatível com esta área. Consulte mapa_sistema para os filtros aceitos.",
      };
    if (args.inicio && args.fim && args.inicio > args.fim)
      return { erro: "Período inválido: início depois do fim." };
    let q = db.from(r.table).select(r.fields);
    for (const [param, field] of scopes) if (args[param]) q = q.eq(r[field], args[param]);
    if (args.inicio) q = q.gte(r.date, args.inicio);
    if (args.fim) q = q.lte(r.date, args.fim);
    if (r.deleted) q = q.is(r.deleted, null);
    if (r.kind) q = q.eq("kind", r.kind);
    if (r.active && !args.incluir_desativados) q = q.eq(r.active, true);
    if (args.texto) q = q.ilike(r.text, like(args.texto));
    if (args.id) q = q.eq("id", args.id);
    if (args.cliente_id) q = q.eq(r.client, args.cliente_id);
    const rows = checked(
      await q
        .order(r.date || r.text || "id")
        .order("id")
        .range((args.pagina - 1) * 25, (args.pagina - 1) * 25 + 25),
    );
    return {
      ...paged(rows, args.pagina),
      area: args.area,
      tela: origin + r.route,
      ...(r.kind
        ? {
            fonte:
              "Contas manuais; não inclui recebíveis derivados do faturamento. amount_cents em centavos. Nenhuma recorrência foi gerada por esta consulta.",
          }
        : {}),
    };
  }
  if (name === "consultar_processo") {
    const tasks = checked(
      await db
        .from("tasks")
        .select(
          "id,client_id,title,description,status,column_id,status_id,priority,due_date,assignee_id,completed_at,updated_at",
        )
        .eq("id", args.id)
        .is("deleted_at", null)
        .limit(1),
    );
    if (!tasks.length) return { encontrado: false };
    const [subs, columns, statuses, profiles] = await Promise.all([
      db
        .from("subtasks")
        .select("id,task_id,title,done,due_date,assignee_id")
        .eq("task_id", args.id)
        .order("id")
        .range((args.pagina - 1) * 25, (args.pagina - 1) * 25 + 25),
      tasks[0].column_id
        ? db.from("kanban_columns").select("id,name").eq("id", tasks[0].column_id).limit(1)
        : Promise.resolve({ data: [] }),
      tasks[0].status_id
        ? db.from("task_statuses").select("id,name").eq("id", tasks[0].status_id).limit(1)
        : Promise.resolve({ data: [] }),
      tasks[0].assignee_id
        ? db.from("profiles").select("id,full_name").eq("id", tasks[0].assignee_id).limit(1)
        : Promise.resolve({ data: [] }),
    ]);
    return {
      tarefa: tasks[0],
      coluna: checked(columns),
      status: checked(statuses),
      responsavel: checked(profiles),
      subtarefas: paged(checked(subs), args.pagina),
      tela: origin + "/tasks/kanban",
    };
  }
  if (name === "consultar_iso") {
    const r = await db.rpc("iso_open_workspace");
    if (r.error)
      return {
        erro: "Não foi possível consultar o ISO com a permissão atual. Nenhum dado foi alterado.",
      };
    const state = r.data?.state;
    if (!state) return { registros: [], pagina: args.pagina, temMais: false };
    let rows: any[];
    if (args.secao === "auditorias")
      rows = (state.audits || []).map((a: any) => ({
        id: a.id,
        name: a.name,
        organization: a.organization,
        scheduledFor: a.scheduledFor,
        standards: a.standards,
      }));
    else {
      const audit = (state.audits || []).find(
        (a: any) => a.id === (args.auditoria_id || state.selectedId),
      );
      if (!audit)
        return { erro: "Auditoria não encontrada. Consulte auditorias e escolha o identificador." };
      rows =
        args.secao === "planos"
          ? audit.plans || []
          : args.secao === "nao_conformidades"
            ? audit.ncs || []
            : args.secao === "evidencias"
              ? audit.evidenceRecords || []
              : (state.questions || []).filter((q: any) =>
                  (audit.selectedQuestions || []).includes(q.id),
                );
    }
    if (args.texto)
      rows = rows.filter((v: any) =>
        JSON.stringify(v)
          .toLocaleLowerCase("pt-BR")
          .includes(args.texto.toLocaleLowerCase("pt-BR")),
      );
    const start = (args.pagina - 1) * 25;
    return {
      ...paged(rows.slice(start, start + 26), args.pagina),
      revisao: r.data.revision,
      tela: origin + "/iso",
      auditoria_id: args.auditoria_id || state.selectedId,
    };
  }
  if (name === "preparar_acao") {
    let anterior;
    if (args.tipo === "editar_tarefa") {
      const rows = checked(
        await db
          .from("tasks")
          .select("id,title,due_date,priority,updated_at")
          .eq("id", args.id)
          .is("deleted_at", null)
          .limit(1),
      );
      if (!rows.length) return { erro: "Tarefa não encontrada." };
      const { title, due_date, priority, updated_at } = rows[0];
      anterior = { title, due_date, priority, updated_at };
    }
    const action = assistantActionSchema.parse({
      version: 1,
      requestId: crypto.randomUUID(),
      expiresAt: Date.now() + 20 * 60_000,
      pedido: args,
      ...(anterior ? { anterior } : {}),
    });
    return {
      salvo: false,
      proposta: action,
      revisarEm: `${origin}/integracoes-chatgpt?acao=${encodeURIComponent(JSON.stringify(action))}`,
      instrucao:
        "Abra na Jacoby, confira os campos e confirme. A proposta não executa pagamentos nem altera registros antes da confirmação.",
    };
  }
  if (name === "consultar_fluxo_bm") return loadBulletinFlow(args, db, origin);
  throw new Error("unknown_tool");
}

async function boundedRows(query: any) {
  const data: any[] = [];
  for (let offset = 0; offset <= 1000; offset += 500) {
    const end = Math.min(offset + 499, 1000);
    const r = await query.range(offset, end);
    if (r.error) return r;
    data.push(...(r.data || []));
    if ((r.data || []).length < end - offset + 1) break;
  }
  return { data, error: null };
}

async function loadBulletinFlow(args: any, db: any, origin: string) {
  let q = db
    .from("billing_v2_cycles")
    .select(
      "id,client_id,branch_id,bulletin_number,issuer_type,outsourced_company_id,status,period_start,period_end,finalized_at,updated_at",
    )
    .eq("is_demo", false);
  if (args.id) q = q.eq("id", args.id);
  if (args.numero) q = q.eq("bulletin_number", args.numero);
  const cycles = checked(await q.order("id").limit(26));
  if (!cycles.length) return { encontrado: false };
  if (cycles.length > 1)
    return {
      ambiguo: true,
      candidatos: cycles.slice(0, 25),
      temMais: cycles.length > 25,
      instrucao: "Escolha um BM pelo UUID e consulte novamente. Nenhum valor foi somado.",
    };
  const cycle = cycles[0];
  const scope = (table: string, fields: string) =>
    boundedRows(db.from(table).select(fields).eq("cycle_id", cycle.id).order("id"));
  // Complete bounded datasets. If a source fails or truncates, never present a financial total as complete.
  const requests = {
    placements: scope(
      "billing_v2_placements",
      "id,cycle_id,quantity,monthly_rental_rate,equipment_id,started_on",
    ),
    movements: scope(
      "billing_v2_movements",
      "id,cycle_id,confirmed,removed_quantity,weight_kg,exchange_rate,treatment_rate,waste_residue_id,occurred_on,service_order",
    ),
    services: scope(
      "billing_v2_cycle_services",
      "id,cycle_id,waste_service_id,outsourced_company_id,amount,execution_date,net_invoice_amount,commission_rate,invoice_number,invoice_issued_on,invoice_due_date,commission_due_date,received_on,invoice_pdf_path,invoice_pdf_name",
    ),
    commissions: scope(
      "outsourced_movement_commissions",
      "id,cycle_id,client_id,outsourced_company_id,source_type,waste_residue_id,execution_date,base_amount,commission_rate,gross_commission_amount,tax_withheld_amount,net_commission_amount,payment_status,received_on",
    ),
    tracking: scope(
      "billing_receivable_tracking",
      "id,cycle_id,category,outsourced_company_id,source_key,rule_type,rule_value,base_amount_snapshot,net_invoice_amount,commission_amount,invoice_number,invoice_issued_on,invoice_due_on,expected_basis,expected_on,received_on,notes,updated_at",
    ),
    receipts: boundedRows(
      db
        .from("finance_receipt_details")
        .select("entry_id,cycle_id,cost_center_id,bank_account_id")
        .eq("cycle_id", cycle.id)
        .order("entry_id"),
    ),
    clients: db.from("clients").select("id,name").eq("id", cycle.client_id).limit(1),
    branches: boundedRows(
      db.from("client_branches").select("id,name").eq("client_id", cycle.client_id).order("id"),
    ),
    residues: boundedRows(
      db
        .from("waste_residues")
        .select("id,name,jacoby_pays_client")
        .eq("client_id", cycle.client_id)
        .order("id"),
    ),
    catalog: boundedRows(
      db.from("waste_services").select("id,name").eq("client_id", cycle.client_id).order("id"),
    ),
  };
  const data: Record<string, any[]> = {};
  const failures: string[] = [];
  const results = await Promise.allSettled(Object.values(requests));
  Object.keys(requests).forEach((key, i) => {
    const r = results[i];
    if (r.status === "rejected" || r.value.error || r.value.data?.length > 1000) failures.push(key);
    else data[key] = r.value.data || [];
  });
  const hash = new URLSearchParams({
    cliente: cycle.client_id,
    boletim: cycle.id,
    patio: cycle.branch_id || "__matriz__",
    inicio: cycle.period_start,
    fim: cycle.period_end,
    subaba: "boletim",
    residuo: "all",
  });
  const telas = {
    boletim: `${origin}/portal/residuos?aba=faturamento2#${hash}`,
    faturamento: `${origin}/financeiro`,
    receber: `${origin}/contas-a-receber`,
  };
  if (failures.length)
    return {
      boletim: cycle,
      completo: false,
      fontes_indisponiveis_ou_limitadas: failures,
      telas,
      aviso:
        "Não foi possível completar o cruzamento. Não conclua situação financeira nem some valores parciais.",
    };
  const companyIds = [
    ...new Set(
      [
        cycle.outsourced_company_id,
        ...data.services.map((s) => s.outsourced_company_id),
        ...data.commissions.map((s) => s.outsourced_company_id),
      ].filter(Boolean),
    ),
  ];
  if (companyIds.length > 1000)
    return {
      boletim: cycle,
      completo: false,
      aviso: "Muitas empresas vinculadas; refine a consulta na tela.",
      telas,
    };
  const companies = companyIds.length
    ? checked(
        await db
          .from("outsourced_companies")
          .select("id,legal_name,trade_name")
          .in("id", companyIds)
          .order("id")
          .limit(1001),
      )
    : [];
  if (companies.length > 1000)
    return {
      boletim: cycle,
      completo: false,
      aviso: "Catálogo de empresas limitado; consulte a tela.",
      telas,
    };
  let notes;
  try {
    notes = (await listCycleInvoices(db.storage.from(CYCLE_INVOICE_BUCKET), cycle.id)).map((n) => ({
      ...n,
      cycleId: cycle.id,
    }));
  } catch {
    return {
      boletim: cycle,
      completo: false,
      fontes_indisponiveis_ou_limitadas: ["anexos"],
      telas,
      aviso: "Não foi possível listar as notas do BM. O cruzamento financeiro ficou incompleto.",
    };
  }
  const entries = buildBillingFlowEntries({
    cycles,
    clients: data.clients,
    branches: data.branches,
    residues: data.residues,
    catalog: data.catalog,
    companies,
    services: data.services,
    commissions: data.commissions,
    placements: data.placements,
    movements: data.movements,
    directServices: data.services,
    tracking: data.tracking,
    links: data.services,
    notes,
  });
  const today = todayBr();
  const receivables = entries.map((e) =>
    toReceivable(e, today, billingAgreement(e).requiresAgreement),
  );
  return {
    encontrado: true,
    completo: true,
    consultadoEm: new Date().toISOString(),
    dataReferencia: today,
    moeda: "BRL",
    boletim: cycle,
    cliente: data.clients[0],
    filial: data.branches.find((b) => b.id === cycle.branch_id) || { name: "Matriz" },
    locacoes: data.placements,
    movimentacoes: data.movements,
    servicos: data.services,
    faturamento: entries.map((e) => ({
      id: e.id,
      categoria: e.category,
      empresa: e.company,
      descricao: e.description,
      datasOperacionais: e.operationDates || [],
      baseBM: e.baseAmount,
      conferencia: e.tracking || null,
      notaInformada: Boolean(e.tracking?.invoice_number || e.legacyInvoiceNumber),
      anexos: (e.serviceNotes || []).map((n) => ({ nome: n.name })),
      servicoPendente: Boolean(e.pendingService),
      regra: billingAgreement(e).message,
    })),
    contasReceber: receivables.map((r) => ({
      id: r.id,
      categoria: r.entry.category,
      empresa: r.entry.company,
      valor: r.amount,
      conferido: r.confirmed,
      status: r.status,
      previsao: r.expectedOn,
      nota: r.invoiceNumber,
      vencimentoNota: r.invoiceDueOn,
      recebidoEm: r.receivedOn,
      classificacao: data.receipts.find((d) => d.entry_id === r.id) || null,
    })),
    resumo: summarizeReceivables(receivables, today),
    resumoTemEstimativas: receivables.some((r) => !r.confirmed),
    conferenciasSemLancamento: data.tracking.filter(
      (t) => !entries.some((e) => e.id === `${t.cycle_id}:${t.category}:${t.source_key}`),
    ),
    telas,
    aviso:
      "Fechamento, nota informada e recebimento são estados distintos. Valores não conferidos são estimativas. Contas manuais não têm chave de BM e não foram vinculadas por semelhança de texto. Consultas foram feitas em instantes próximos, sem snapshot transacional. Anexos listados pelo nome, sem leitura do conteúdo.",
  };
}
