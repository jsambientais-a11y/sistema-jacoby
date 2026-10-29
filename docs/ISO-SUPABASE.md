# ISO compartilhado — implementação e homologação (29/10/2026)

## Alvo confirmado

- Repositório: `jsambientais-a11y/sistema-jacoby`.
- Projeto Supabase: `ikdmfungulmgwvknramd`, mesmo host do `.env.local` da Jacoby e do vínculo da CLI.
- Login da CLI confirmado na conta JS. O projeto financeiro não foi utilizado.
- Migrações aplicadas isoladamente: `20261029180000_iso_shared_workspace.sql`, `20261029181500_iso_storage_guard.sql` e `20261029183000_iso_validate_unknown_fields.sql`. Registradas no histórico do Supabase. Nenhuma outra migração pendente foi executada.
- A interface ainda não foi publicada. O Vite local foi configurado para usar o servidor real.

## Funcionamento

O ISO possui um espaço interno compartilhado da Jacoby. O documento validado no banco contém auditorias, checklists, planejamento, respostas, NCs, PAC, relatórios, cadastros próprios, favoritos, filtros e histórico funcional. A seleção de auditoria é mantida por aba. Não é um serviço multitenant nem uma réplica do backend privado do produto de referência.

Cada gravação exige a revisão que o usuário leu. O banco bloqueia revisões antigas com `ISO_REVISION_CONFLICT`. A aplicação serializa envios e consolida alterações intermediárias; mostra separadamente “Salvando no servidor” e “Salvo no servidor”. Outras sessões são consultadas a cada 10 segundos. Em conflito ou falha, a edição para; nenhuma mesclagem automática sobrescreve o trabalho de outra pessoa. A cópia local pendente permanece disponível para exportação. Recarregar o servidor preserva uma cópia adicional, baixável pela Minha biblioteca.

O cache de sincronização é separado dos dados da versão local anterior. Migrar dados de uma prévia anterior requer exportar seu ZIP em modo local e importá-lo na Minha biblioteca do modo compartilhado. A tela de importação informa que a restauração substitui o ambiente; exportar o ambiente atual antes é necessário. Não houve importação automática de dados antigos.

## Permissões e anexos

- Administradoras da Jacoby: acesso completo e gestão das autorizações.
- Outras contas internas: somente após autorização explícita, como `viewer` (consulta) ou `editor` (alteração).
- Contas categorizadas como cliente: bloqueadas mesmo se houvesse registro de membro.
- Anônimos: sem acesso ao documento ou aos arquivos ISO.
- A Minha biblioteca contém a gestão de acesso por e-mail de conta interna existente. Não cria contas nem altera papéis globais.
- O frontend usa a sessão normal do usuário e a chave pública do Supabase. Não usa service-role para contornar RLS.
- O bucket `iso-private` é privado e aceita até 20 MB por arquivo, de qualquer formato. O caminho contém o UUID do espaço e uma identidade de arquivo gerada pelo app. Não há URLs públicas de anexos.
- O banco só aceita vínculos para objetos já enviados nesse espaço. Arquivos são imutáveis: não existe sobrescrita ou exclusão pelo cliente; restaurações geram novas identidades. Upload que falha antes de vincular pode deixar um objeto órfão, a ser tratado em manutenção administrativa.
- Políticas restritivas adicionais impedem que regras permissivas antigas do Storage exponham o ISO ou permitam edição/exclusão dos seus objetos.
- `iso_server_log` é um registro independente com identidade, revisão e horário definidos pelo servidor. O histórico funcional incluído no documento não substitui esse registro.

## Modelo e limites operacionais

- Documento JSONB único, limite de 10 MB, com validação de estrutura no servidor, IDs únicos de auditorias/NCs/PAC e vínculo de PAC na mesma auditoria. Não contém os bytes dos anexos.
- A validação SQL foi derivada do esquema Zod do cliente; `scripts/generate-iso-db-schema.mjs` auxilia a regeneração, que exige migração nova ao mudar o contrato persistido.
- Alterações concorrentes em auditorias diferentes também podem conflitar, pois a revisão é do espaço inteiro. Isso é deliberado: impede perda silenciosa. Para equipes com grande volume de edição simultânea, o próximo passo é granularizar por auditoria/registro.
- Favoritos, filtros e nome de declaração atualmente pertencem ao espaço compartilhado; a auditoria selecionada fica na aba. A equipe deve revisar o nome antes de emitir uma declaração.
- Não há execução automática de IA: a biblioteca oferece prompts próprios para copiar e personalizar.
- Os catálogos próprios não são uma reprodução integral dos catálogos comerciais da referência. A equivalência funcional não comprova igualdade total de conteúdo, backend ou certificação.

## Configuração do frontend

`VITE_ISO_STORAGE=supabase` ativa o modo compartilhado. `VITE_ISO_STORAGE=local` força a prévia isolada. Em produção, havendo `VITE_SUPABASE_URL` e sem forçar `local`, o padrão é o modo Supabase.

A publicação precisa usar o host e a chave pública deste mesmo projeto. O login de desenvolvimento sem autenticação foi removido para o modo compartilhado. Testar localmente com o banco real não publica o frontend.

## Evidências de homologação

- 22 testes de domínio, compatibilidade, ZIP/anexos, PDF, anonimização e fila de sincronização passaram.
- SQL exato executado em Postgres 16 isolado: permissões, vínculo de anexos, schema inválido, IDs repetidos, revisão antiga e log do servidor.
- Os mesmos testes de permissões/revisão foram executados no Supabase real dentro de uma transação revertida; as autorizações temporárias e objetos de teste não permaneceram.
- Teste adicional com política legada de Storage excessivamente permissiva no banco isolado: os guardas continuaram bloqueando os acessos indevidos.
- Chamada HTTP anônima para `iso_open_workspace`: HTTP 401.
- Pela interface autenticada, foi criada a auditoria fictícia `Homologação ISO — banco e anexos — 29/10/2026`, na `EMPRESA TESTE — demonstração técnica`.
- Após navegar/recarregar, a auditoria reapareceu com a sessão normal. Banco confirmou revisão 1, duas auditorias (uma inicial vazia e a de teste) e um evento de gravação.
- Pela interface, foi enviado `jacoby-iso-storage-test.txt`. Banco confirmou revisão 2, um objeto no bucket privado e um vínculo na auditoria. O arquivo foi baixado pela CLI e os bytes foram comparados com o original: idênticos.
- Antes/depois das migrações: 40 clientes, 22 tarefas, 104 BMs/ciclos. Registros existentes dessas áreas não foram modificados.
- O TypeScript global possui falhas anteriores em outros módulos. A verificação dirigida não apontou falhas nos arquivos ISO alterados. Build de produção local executado; a última execução deve ser conferida no log de entrega.

## Antes da publicação

Revisar o ambiente autenticado com a equipe, as regras de acesso desejadas e os catálogos. Manter o registro fictício de homologação identificado ou arquivá-lo pela própria interface. Conferir as variáveis do deploy, publicar mediante autorização e repetir o teste do domínio real com contas de administração, edição e leitura. A aprovação dos testes acima não é uma promessa de clonagem perfeita ou ausência de defeitos.
