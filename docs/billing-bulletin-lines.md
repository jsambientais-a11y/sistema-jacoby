# Conferência de faturamento em linhas

Implementação local, sem publicação ou migração adicional.

- Clicar na linha do BM abre a conferência em linhas, por emissor. Os atalhos das categorias e links do mapa continuam abrindo a visão individual, que mantém os anexos existentes.
- Locação, Troca, Tratamento e Serviços têm regra e valor próprios. Juliana informa manualmente o líquido de cada categoria quando a regra for percentual; o total de uma NF nunca é copiado automaticamente para todas as bases.
- Número, emissão, vencimento, previsão, recebimento e observações são editados em uma seção comum para as linhas marcadas do mesmo BM/emissor.
- Campos antigos diferentes são indicados e mantidos por categoria enquanto o usuário não editar expressamente o campo comum. Previsões antigas não são recalculadas ao alterar somente a comissão.
- Categorias ausentes ou sem cobrança não geram alerta de NF. Em registros conferidos, comissão e líquido explicitamente zerados são respeitados mesmo quando há base operacional no BM. Notas anexadas aguardando serviço/valor continuam a conferir.
- As linhas sem cobrança começam desmarcadas. A gravação só inclui linhas selecionadas e alteradas; usa um único upsert para o grupo, com rollback conjunto se alguma linha for rejeitada. Não há baixa automática, autosave ou alteração retroativa dos dados existentes.
- Filtro/indicador de NF no Faturamento e Dashboard usam a mesma regra por lançamento e contam somente BMs emitidos. Outros lançamentos com cobrança no mesmo BM continuam pendentes quando não têm emissão de NF.

Validação: 40 testes de cálculo, navegação, preservação e preparação de payload; build concluído; tela local conferida. Gravação em lote e rollback testados com a função SQL em banco PGlite isolado em memória. Nenhum lançamento real foi gravado durante a validação. A persistência em produção não foi exercitada.
