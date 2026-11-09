# Correção dos 183 erros de TypeScript — 08/11/2026

## Resultado final

- `npm run typecheck`: aprovado, **zero erros**, sem mudar o `tsconfig.json`, desativar o modo estrito ou acrescentar supressões de erros.
- `npm test`: **195 testes aprovados**.
- `NITRO_PRESET=vercel npm run build`: aprovado.
- Nenhuma publicação, migração, mudança de credenciais ou alteração de dados reais nesta correção.

Este resultado substitui a pendência de 183 erros descrita no relatório anterior de revisão do faturamento.

## Causas corrigidas

1. **Retornos incorretos nos hooks de tarefas e faturas.** `useTasks` devolvia uma lista tipada como preferências de ordenação em caso de erro; `useClientInvoices` fazia o mesmo com preferências de colunas. Isso contaminava a inferência de tipos em Kanban, lista, calendário, relatórios, clientes e portal. As consultas agora têm tipos explícitos de tarefas/faturas e propagam falhas pelo React Query em vez de tratá-las como uma lista vazia bem-sucedida.
2. **Formulários com campos anuláveis.** O formulário de filiais agora representa texto digitável como string, mantendo a conversão para `null` no payload do banco. A edição do cliente verifica se o cadastro carregou antes de acessar o logo ou salvar. A formatação salarial sempre retorna string para os campos de entrada.
3. **Parâmetros de navegação.** A aba de edição do cliente é opcional. Os valores válidos de `aba` de Boletim de Medição/Configurações foram declarados no validador da rota, mantendo os controles de acesso do módulo.
4. **Contexto de autenticação inconsistente.** Sem configuração do Supabase, o middleware retornava contexto com usuário nulo e um cliente incompleto. Agora interrompe a chamada sem executar o handler protegido. Com configuração e token válidos, mantém o cliente vinculado ao bearer token e à RLS original.
5. **Callbacks sem tipos e erros desconhecidos.** Foram tipados os dados efetivamente selecionados para anexos, interrupções, permissões e cópia de subtarefas/comentários/etiquetas. A tela de erro valida `instanceof Error` antes de acessar a mensagem.

## Distribuição original

| Arquivo | Diagnósticos |
| --- | ---: |
| tasks.kanban.tsx | 83 |
| reports.tsx | 23 |
| portal.financeiro.tsx | 18 |
| portal.entregas.tsx | 13 |
| ClientBranchesManager.tsx | 12 |
| tasks.list.tsx | 8 |
| clients.$clientId.edit.tsx | 7 |
| tasks.calendar.tsx | 6 |
| AppShell.tsx | 5 |
| clients.tsx | 3 |
| client-report.functions.ts | 2 |
| TaskDialog.tsx | 1 |
| auth-middleware.ts | 1 |
| __root.tsx | 1 |
| **Total** | **183** |

Vários arquivos dessa tabela não precisaram de edição: seus erros desapareceram ao corrigir os tipos na origem.

## Proteção contra regressões

Adicionados os comandos `npm run typecheck` e `npm test` ao projeto. Testes novos exercitam as consultas de tarefas/faturas com sucesso, resultado vazio e falha; a autenticação sem configuração, sem bearer, com claims inválidas e com usuário válido. Todos usam dependências simuladas, sem chamadas ao banco real.

O lint global é uma checagem separada e não foi declarado limpo. A validação de TypeScript não substitui homologação dos fluxos publicados ou teste de gravação com as permissões reais.
