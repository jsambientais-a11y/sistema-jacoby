# Continuação local do módulo ISO — 29/10/2026

> Registro da primeira etapa local. A integração posterior com o banco real, permissões e armazenamento privado está em [ISO-SUPABASE.md](ISO-SUPABASE.md). Os limites locais descritos abaixo correspondem àquela etapa.

A referência encontrada no navegador foi o AuditExpert SGI, em `https://kitauditor.integrasgi.com`.
Esta etapa reconstrói localmente o fluxo de auditoria e todas as áreas de apoio do menu de referência na interface da Jacoby.
Não é uma cópia integral do produto de referência.

## Evidências e limites

- Inspeção visual do menu e dos formulários de `/pac` e `/relatorio`, sem salvar dados no sistema externo.
- REA `analyze_javascript_application` aplicado aos artefatos JavaScript publicados, obtidos a partir do script observado na página e dos chunks que ele referencia. Os arquivos foram lidos como texto, sem executar o código capturado.
- Análise inicial: `ev_bab030357a1d31762804df54f6bd0259e373f219d49d0198147de5a229de1b7c`.
- Análise dirigida aos chunks de PAC, relatório, auditoria ativa, cadeia de NC e dashboard: `ev_98a470d7e50530e4882d29649ec77c0a2c593ea349ca782b83333186ae3ce9cb`.
- Identidade SHA-256 da coleção da análise dirigida: `8f3da7fbed7d5c9ff9f15fdc5f005712bb1e41e98f6fe165a0184a42dd3568b7`.
- A análise estática tem cobertura parcial e relações dinâmicas desconhecidas. Não comprova comportamento completo, equivalência de código ou funcionamento do backend externo.
- A tentativa de rastrear literalmente `planos_acao` no grafo não encontrou um nó correspondente; não foi tratada como prova de ausência. Os nomes de campos e estados foram conferidos no artefato e na interface.
- Os bundles temporários ficaram em `/tmp/jacoby-iso-reference-20261029`, fora do repositório. Não foram copiados catálogos completos, credenciais, tokens nem dados particulares do sistema externo.

## Fluxo implementado

1. Dashboard em `/iso/dashboard`, com contagens da auditoria selecionada e atalhos.
2. PAC em `/iso/pac`: plano independente ou vinculado a uma NC da mesma auditoria; título, norma, cláusula, constatação, causa, ação, responsável, prazo, status, evidência de fechamento e eficácia.
3. Quadro e lista, busca, filtros por norma/situação e identificação de atraso pelo dia local.
4. Conclusão exige evidência de fechamento e registra a data. Reabrir limpa a data. Concluir um plano não encerra a NC automaticamente.
5. Relatório em `/iso/relatorio`: dados, entrevistas/evidências, NCs, planos e encerramento. Campos de texto permanecem editáveis e a conclusão é escrita pelo auditor.
6. Revisão orientativa antes de exportar. Pendências aparecem no PDF como rascunho; não são inventados resultados positivos.
7. PDF gerado localmente com paginação e identificação da auditoria; inclui o checklist de preparação registrado.

## Persistência e compatibilidade

Os campos `plans` e `report` são opcionais em cada auditoria dentro da chave existente `jacoby-iso-workspace-v2:<usuário>`.
Auditorias antigas continuam carregando sem migração de banco ou substituição dos registros originais.
A aplicação ISO permanece com armazenamento local no navegador, sem sincronização entre usuários.
Não houve commit, push, publicação ou migração do Supabase nesta etapa.

## Verificação

- Testes de domínio: vínculo de NC, isolamento, conclusão/reabertura, atraso, datas inválidas, revisão e compatibilidade com dados antigos.
- Teste de PDF com texto longo e múltiplas páginas.
- Na interface local foi criada somente a auditoria fictícia `Demonstração local — fluxo ISO`, em perfil de navegador de teste: criar NC, gerar plano a partir dela, definir responsável/prazo/status, salvar, recarregar, trocar de auditoria e conferir o relatório.
- O botão Gerar PDF produziu o arquivo de demonstração em Downloads, com a NC, responsável, prazo e indicação de rascunho conferidos no arquivo.

## Áreas de apoio e catálogos

- Manual de Uso com busca e orientação de cada etapa.
- Minha biblioteca: processos, critérios, perguntas, evidências, modelos de NC e prompts editáveis; favoritos, filtros salvos e arquivamento reversível. Processos e critérios ativos propagam para o planejamento e os roteiros.
- Log do Auditor: histórico de alterações, horas e normas; declaração de experiência em PDF com opção de anonimizar organizações e nomes de auditorias.
- Prompts: busca, filtros, favoritos, personalização e cópias editáveis. São textos de apoio; não há envio automático a um provedor de IA.
- Catálogo próprio: 168 perguntas, 89 evidências, 82 modelos de NC e 234 prompts, cobrindo sete normas e 18 processos. Não equivale ao catálogo integral do produto original. Cláusulas são referências de apoio e devem ser conferidas na edição aplicável da norma.
- Anexos locais de qualquer formato, até 20 MB cada, guardados no IndexedDB. Entrevistas, evidências, NCs e relatório podem receber anexos. O PDF lista os anexos; o ZIP guarda os arquivos reais.
- Backup ZIP completo com dados e anexos, revisão antes de restaurar, validação de estrutura, vínculos e tamanho; restauração em outro navegador usa novas identidades para os arquivos. JSON sem os anexos exigidos é rejeitado.
- Auditorias podem ser duplicadas apenas com planejamento/roteiro ou arquivadas e restauradas. NCs e registros de evidência têm lixeira recuperável; NC ligada a PAC não é removida sem resolver o vínculo.
- Dados antigos inválidos não são sobrescritos silenciosamente. Falhas de armazenamento são explícitas. Abas da mesma origem recebem as alterações locais.

## Evidência adicional REA

Análise das oito unidades de apoio publicadas (146.180 bytes, nenhuma falha de parse): `ev_bf1056ef6002fc8f64743215c7aacd056f8467f9856e41647ff0c6e0295ff0a1`; resumo `ev_0417fd65c23955ee99c1a3b1d286fed044bda4edd5f1aff62afc9d968c9312bd`. Cobertura estática parcial, complementada por inspeção da interface. O código externo não foi incorporado ao repositório.

## Verificação adicional

Testes automatizados de compatibilidade, validação de backups, proteção de vínculos, anonimização, catálogo e ZIP com arquivo real. Build de produção local executado. O TypeScript global já apresenta erros em outros módulos; nenhuma falha dos arquivos ISO alterados foi identificada na conferência dirigida.

Na interface local: cadastro de processo e pergunta próprios, propagação para o roteiro, inclusão na auditoria e upload de um TXT fictício. O ZIP baixado foi inspecionado e continha o arquivo real. A restauração foi executada com sucesso em `127.0.0.1:8080`, uma origem de teste separada do `localhost:8080`, recuperando duas auditorias, processo, pergunta e anexo. Os dados da origem localhost não foram substituídos.

## Antes de publicar para uso compartilhado

A reconstrução funcional local não reproduz o backend original, licenças, cobrança ou serviços privados. A sincronização de equipes, permissões ISO no servidor, armazenamento remoto de anexos e migração dos dados locais ainda precisam de implementação e validação antes de um lançamento com múltiplos usuários. Não houve commit, push, deploy ou alteração de Supabase.
