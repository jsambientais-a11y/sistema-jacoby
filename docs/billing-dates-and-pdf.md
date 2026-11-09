# Datas operacionais e prazo padrão do faturamento

Implementação para todos os BMs e clientes, sem regra por número de boletim.

- Faturado agrupa os recebíveis por UUID do BM, preservando detalhamento e baixas individuais.
- PDF compartilhado entre equipe e Portal do Cliente inclui DATA: início da locação, movimentação da troca/resíduo e execução do serviço. Agrupamentos de resíduos respeitam o dia e a taxa; o total financeiro não muda. Datas ausentes aparecem como hífen, sem substituir pela emissão ou pelo período.
- As novas opções `issue_15` e `due_15` calculam 15 dias corridos após a emissão ou vencimento da NF. São opt-in: o padrão atual não muda. As regras legadas `issue`/`due` (dia 10 do mês seguinte) permanecem disponíveis e selecionadas para registros que já as usam. `manual` é preservada.
- Emissão e vencimento da NF permanecem como campos editados pela usuária, sem sugestão que altere automaticamente essas datas.
- Faturamento mostra as datas operacionais reais e permite copiar a mais recente para a previsão manual. Sucata com valor fixo pode ficar sem número e datas de NF. Previsão não implica baixa; recebimento depende de confirmação explícita.

## Banco e publicação

A migração `20261108190000_billing_fifteen_day_forecast.sql` amplia o CHECK de `expected_basis`, preserva o default atual e substitui o trigger preservando validação de emissor/origem/BM finalizado. Não contém UPDATE dos lançamentos existentes. O trigger mantém a previsão salva quando a regra e sua data de referência não mudaram.

O dry-run de `supabase db push` encontrou quatro migrações históricas locais fora da ordem do histórico remoto. Não usar `--include-all` para publicar esta mudança. Aplicar somente a migração nova, em transação, registrar sua versão e verificar as regras/default e integridade dos lançamentos antes/depois. Projeto alvo: `ikdmfungulmgwvknramd`. Publicar o frontend depois da migração, para que `issue_15` já seja aceito. Um frontend antigo continua podendo usar `issue`/`due`.

## Verificação

- Testes de calendário e preservação de previsão, agrupamento e totais do BM, PDF por data, recebíveis, comissões e ferramentas do assistente.
- Migração executada em PostgreSQL isolado em memória (PGlite), com inserts/updates: opções de 15 dias, default anterior preservado, virada de mês/ano, registros antigos, operação manual sem NF e bloqueios de emissor/BM não finalizado.
- PDFs de prévia com dados fictícios gerados pelo renderer real, em uma e quatro páginas, renderizados via PDFKit e inspecionados visualmente.
- Formulário local conferido com dados reais apenas em leitura: datas anteriores e recebimento preservados, referência operacional visível e novas regras disponíveis. Nenhuma conferência real foi salva no teste.

## Orientação final da usuária em 08/11/2026

Aplicar somente a ampliação de opções no banco; não publicar nem fazer push. Não mudar o padrão atual nem datas/valores/registros que a Juliana já ajustou. Ela escolherá as novas opções conforme trabalhar nos próximos lançamentos. As alterações de tela e PDF ficam locais.

## Estado validado após a aplicação

Migração `20261108190000` aplicada isoladamente no projeto autorizado e registrada no histórico. CHECK ampliado com `issue_15` e `due_15`; default anterior `'issue'::text` confirmado e mantido. A comparação do conteúdo integral dos 174 registros de `billing_receivable_tracking` antes/depois retornou o mesmo hash, incluindo datas, valores, baixas e `updated_at`. Nenhum registro financeiro existente foi atualizado. As quatro migrações históricas fora de ordem não foram reaplicadas. Frontend/PDF/código permanecem locais, sem commit/push/deploy nesta etapa.
