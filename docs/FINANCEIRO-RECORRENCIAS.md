# Repetição no lançamento de despesas

A opção **Repetir esta despesa** fica dentro de Nova/Editar conta a pagar e do lançamento de despesas no cartão. Não há uma área separada: o endereço antigo redireciona para Contas a pagar.

- Criar uma despesa recorrente ou tornar uma existente recorrente mantém o lançamento original e gera somente as próximas ocorrências. Converter um lançamento antigo não cria despesas retroativas entre ele e hoje.
- O formulário define frequência e término opcional. Contas a pagar permitem frequência semanal até anual; cartões permitem mensal até anual. Repetição de assinatura e parcelamento são fluxos distintos.
- Ao editar, é possível aplicar a alteração somente à ocorrência ou a esta e às próximas ainda não pagas. Pagamentos e ajustes individuais são preservados. Início e frequência de uma série existente ficam fixos; interrompa a repetição e crie outra despesa para mudar a frequência.
- Desmarcar a repetição mantém a despesa atual e retira as próximas ocorrências ainda não pagas, a partir de hoje. Atrasos anteriores permanecem.
- No cartão, cada ocorrência é uma compra de uma parcela. As compras compõem a fatura mensal já existente; Contas a pagar mostra o total da fatura uma única vez. Relatórios continuam detalhando despesas por centro de custo.
- A janela futura de 12 meses é renovada por `sync_finance_recurrences`, executada na consulta de contas e pelo job diário `jacoby-finance-recurring-expenses` (`15 7 * * *`, UTC). As datas operacionais usam America/Sao_Paulo.
- Chaves únicas por série e ocorrência evitam duplicações. Dias 31 usam o último dia em meses curtos sem deslocar a data dos meses seguintes.
- Exclusões individuais são preservadas. Cadastros de banco ou centro desativados não são atribuídos às novas ocorrências. Cartão desativado não recebe novas compras previstas.
- As alterações usam verificação de acesso Financeiro e controle de concorrência por `updated_at`. Contas pagas não são reescritas pela série. Nenhuma rotina realiza pagamentos bancários.

Persistência: `finance_recurring_expenses`, `finance_card_purchases` e `enterprise_finance_accounts`; RPCs `save_inline_payable` e `save_inline_card_purchase`. A regra é vinculada ao lançamento original antes da geração das próximas ocorrências.

Validação: testes de calendário em `tests/finance-recurrence.test.mjs`; testes transacionais com rollback em `supabase/tests/recurring-finance-expenses.sql` e `supabase/tests/inline-finance-recurrence.sql`, incluindo conversão sem duplicar, ajustes individuais, preservação de baixas, interrupção e bloqueio de colaborador.
