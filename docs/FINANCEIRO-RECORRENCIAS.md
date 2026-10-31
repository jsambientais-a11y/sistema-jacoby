# Despesas recorrentes

A área Financeiro → Despesas recorrentes cria obrigações em `enterprise_finance_accounts`. As mesmas contas alimentam o contas a pagar, saldos bancários, alerta de atrasos e relatórios; não há uma segunda soma da série.

- Uma série mantém descrição, valor por ocorrência, frequência, primeiro vencimento, término opcional, centro de custo e conta bancária prevista.
- A janela inclui o histórico a partir do início e os próximos 12 meses. `sync_finance_recurrences` é executada ao consultar contas e pelo job diário `jacoby-finance-recurring-expenses` (`15 7 * * *`, UTC). As datas operacionais usam America/Sao_Paulo.
- A chave única `(recurrence_id, occurrence_on)` torna a geração repetível sem duplicação. Mensalidades com dia 31 usam o último dia em meses curtos, sem deslocar o dia dos meses seguintes.
- Editar uma ocorrência marca `recurrence_overridden`; alterações da série preservam essa personalização. Registrar somente a baixa não cria uma personalização.
- Editar a série aplica os valores às ocorrências em aberto não personalizadas, a partir da data informada (entre hoje e 12 meses). Contas pagas são preservadas. Início e frequência ficam fixos após criar a série; para mudar a estrutura, encerre a anterior e crie outra.
- Pausar ou antecipar o término retira somente ocorrências de hoje em diante ainda não pagas. Atrasos anteriores continuam no contas a pagar. `recurrence_suppressed` distingue a retirada pela regra da exclusão individual.
- Reativar restaura apenas o que foi retirado pela regra, preservando valores individuais e exclusões manuais.
- Se centro ou conta forem desativados, novas ocorrências ficam sem esse vínculo; a série sinaliza o cadastro desativado. Valores e ocorrências históricas permanecem.
- Nenhuma rotina executa pagamentos bancários.

A autorização usa a mesma restrição Financeiro (Juliana/Reinan). A tabela tem somente leitura autenticada; alterações e geração passam por funções com verificação de acesso. O job usa a conexão interna do PostgreSQL, sem tokens externos.

Validação: `tests/finance-recurrence.test.mjs` verifica calendário e término. `supabase/tests/recurring-finance-expenses.sql` usa transação com rollback para geração, deduplicação, personalizações, baixa, pausa/reativação/término e bloqueio de colaborador.
