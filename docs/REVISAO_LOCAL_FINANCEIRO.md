# Revisão local — pedidos de Juliana (14/11/2026)

Alterações locais sobre `b8c77fb`. Nenhuma publicação, envio real de email ou migration remota.

## Executar sem dados reais

```sh
VITE_LOCAL_REVIEW=true VITE_GITHUB_PAGES= npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

O modo explícito de revisão ignora credenciais do `.env.local`, usa autenticação e dados apenas no armazenamento deste navegador e desativa funções remotas, emails e acesso ao storage remoto. O servidor não usa a base real. O acesso inicial pode solicitar criar uma conta local. Os BMs de produção não são copiados; os testes automatizados usam exemplos fictícios. Sem a flag, o aplicativo mantém sua configuração normal.

## Comportamento para revisar

1. **Conferência:** notas anexadas sem um serviço operacional permanecem visíveis e pendentes, mas não podem ser selecionadas para gravação. Assim, não rejeitam a gravação das categorias válidas. Cadastre o serviço no BM para conferir a receita desta categoria. A validação financeira do banco foi mantida. Notas/datas diferentes permanecem por linha quando o campo comum não é editado. Regras de recorrência não foram alteradas.
2. **Faturado:** o filtro `Quem fatura` já estava presente no HEAD inicial. Foi mantido e testado por UUID da empresa, em conjunto com cliente. Os filtros localizam BMs; o total e a ação por BM incluem sua composição completa, mesmo se outro emissor não corresponder ao filtro. A confirmação informa esse alcance.
3. **Baixa por BM:** `Dar baixa no BM` abre confirmação com saldo e data. A gravação inclui somente categorias com saldo ainda não recebido. Valores zerados e anexos sem serviço ficam para conferência. Acordos pendentes bloqueiam a baixa e orientam conferir o Faturamento. Recebimentos anteriores, notas e datas são preservados. Uma única operação upsert grava o lote; falha de validação do banco reverte o lote. A trava local compartilhada impede concorrência entre ação por BM e ação individual na mesma tela até atualizar os dados.
4. **Email:** o envio central acrescenta `js.js.ambientais@gmail.com` em CC em cada aviso ao cliente, incluindo fila, reenvio e emissão por resíduo. Se Juliana já for a destinatária principal, o CC fica vazio para não duplicar destinatários na mesma mensagem. Publicar sem selecionar envio continua sem disparar aviso. Nenhum email foi enviado nos testes.

## Verificações

```sh
npm test
npm run typecheck
npm run build
npm run build:pages
npm run lint
```

Os testes incluem BM165, baixa parcial, duplicidade de linhas, dupla ação concorrente, datas inválidas/futuras, acordo pendente, seleção antiga de Serviços sem origem, filtro por emissor e cliente, e os quatro caminhos de email com provedor simulado. O teste de revisão local fornece credenciais fictícias e falha caso tente instanciar o cliente remoto.

A semântica de triggers, RLS e transação do PostgreSQL do fluxo de recebíveis não foi exercitada em um banco local. Nenhuma migration foi necessária para os quatro primeiros ajustes financeiros/email. As novas migrations de gestão e anexação, descritas abaixo, foram exercitadas em PostgreSQL descartável local com fixture mínima. A proteção de dupla ação é da tela; não implementa um lock entre navegadores ou usuários diferentes.

## Resultado desta revisão

- 242 testes passaram após os itens adicionais de gestão e a reprodução do seletor (HEAD inicial: 208).
- Typecheck, build padrão e build:pages passaram. Builds avisam sobre bundles grandes; o build padrão também aponta APIs antigas de inputValidator em arquivos não alterados.
- O lint não está limpo no HEAD original: 8.260 erros e 69 avisos. Executado sobre os fontes, excluindo somente `.gh-pages-dist`, `.tanstack` e `.vercel`, o resultado final foi 8.106 erros e 69 avisos. Nos arquivos de implementação alterados, a comparação isolada caiu de 140 para 124 erros, mantendo 23 avisos; as novas funções de baixa e cópia de email não apresentam diagnósticos. Não foi feita uma reformatação global do projeto.
- Servidor iniciado em http://127.0.0.1:5174/ com VITE_LOCAL_REVIEW=true. A tela de autenticação local foi verificada no navegador. Não foi realizado teste visual com os BMs reais.
- VS Code aberto no checkout. Sem commit, push, deploy, publicação, emails reais ou escrita no banco remoto.

## Revisão adicional: prévia fiel e múltiplas cópias

A prévia agora mostra **Para** e **CC por mensagem**, conserva a identificação da terceirizada emissora e consome o `cc` retornado pelo servidor. A lista de cópias é derivada do mesmo helper usado no envio. Se Juliana for o único TO, a resposta da prévia tem CC vazio; se estiver junto de outros destinatários, sua própria mensagem não tem CC e as outras mantêm sua cópia. Sem destinatários, não há CC anunciado. Uma resposta de servidor sem informação de CC é identificada como não informada, sem inventar uma cópia.

O alcance é **deduplicação dentro de cada mensagem**, não deduplicação por BM. Exemplo: cliente + terceirizada + Juliana como destinatários produzem três mensagens independentes; Juliana recebe duas como CC e uma como TO. A interface avisa que várias cópias do mesmo BM podem chegar e que retries mantêm o CC. Os destinatários principais continuam separados; não foram agrupados TOs nem criadas listas compartilhadas entre clientes.

A fila vigente já identifica entregas por destinatário (incluindo terceiros) e por BM ou emissão por resíduo. Entregas concluídas não entram novamente na seleção; cada pendência tem seu próprio claim, contador e agendamento de retry. Não foi alterada essa semântica. Os testes simulam três destinatários, falha temporária da terceirizada e retry só dessa entrega: as entregas concluídas não são repetidas e o retry mantém o CC.

**Decisão pendente se a intenção for receber somente uma mensagem por BM:** escolher entre (1) Juliana em cópia de cada email individual, como implementado, ou (2) aviso independente único por BM. A segunda opção muda o significado de cópia e precisa definir se cada emissão por resíduo, republicação ou nova versão também gera um novo aviso. Exige registro persistente com chave única adequada, fila/claim próprios e idempotência no provedor para lidar com aceitação seguida de timeout ou falha ao gravar o resultado. A base atual não registra separadamente a entrega do CC. Eleger a primeira entrega, consultar apenas entregas já enviadas ou manter um Set em memória pode perder a cópia em falhas, concorrência ou reinício; essas alternativas não foram implementadas. Mesmo no fluxo atual, uma resposta incerta do provedor pode resultar em mensagem repetida numa nova tentativa; não há garantia nova de exatamente uma entrega.

Nenhuma migration, mudança de automação, envio real ou alteração remota foi realizada nessa revisão adicional.

Validação adicional: 225/225 testes passaram; typecheck e build:pages passaram; ESLint do componente novo, helper de destinatários e teste novo passou. A prévia foi testada renderizando o componente React real e exercitando o handler com fila/provedor simulados. Não houve teste visual do modal com BMs reais nem teste de concorrência no PostgreSQL remoto.


## Demais itens da coluna Dev — revisão local

Escopo recebido de Reinan: implementar os pedidos claros dos cartões de Juliana, **excluindo a seleção de pátio correspondente ao processo**. Nenhum campo de pátio foi adicionado. As duas subtarefas idênticas sobre modelos foram tratadas como um mesmo pedido de funcionalidade; nenhuma foi excluída ou alterada no sistema remoto. Não existem `.agents/skills` nem instruções AGENTS aplicáveis neste checkout/ancestrais consultados.

| Item | Resultado local | Dependência/limite |
| --- | --- | --- |
| Selecionar cliente e avisar documento pendente | Cliente e opções de solicitação já existiam. Nova migration cria aviso no sino dos logins ativos do cliente quando uma solicitação pendente fica visível; clique abre a solicitação em Portal › Entregas. Trocar cliente no formulário exige marcar novamente a solicitação, evitando compartilhar por engano. | É aviso no portal, sem email. Requer implantação autorizada da migration e cliente com login ativo vinculado. Não foi criado acesso nem enviado aviso real. |
| Angela anexar NF ao BM | Preparada permissão específica `billing_append_finalized_invoice`, junto de `billing`. Se o usuário tem bloqueio de BM finalizado, a exceção permite **somente inserir um novo arquivo** em `movement-documents/cycle-invoices/<BM>/<uuid>--<nome>`. A tela e a política de INSERT aplicam a mesma restrição. | Não é uma liberação já aplicada à Angela. É necessário confirmar sua conta/permissões, implantar a migration e habilitar somente essa capacidade, sem remover `billing_lock_finalized`. Não foram alterados usuários reais. Substituir/remover arquivos, editar serviços/valores, reabrir/publicar/enviar ou acessar Financeiro não são liberados. |
| Editar modelo de projeto (dois itens iguais) | A biblioteca já permite editar nome/título/etapas e ordem, preservando processos existentes. Testados os handlers reais de cancelar, editar e reordenar; adicionada trava síncrona contra dupla gravação (inclui excluir/restaurar). | Não foi encontrado outro defeito definido. Alterar conteúdo/campos adicionais do modelo depende de detalhes que os cartões não fornecem. Não foram inventados requisitos nem removidas as subtarefas duplicadas. |
| Pesquisa terceirizados × comissão | O filtro por emissor e os recebíveis de comissão já existiam. `Quem fatura` passou a ser uma lista pesquisável; busca geral indica que aceita terceirizada. Cliente e emissor continuam combináveis por UUID. | Filtros localizam BMs; total/composição e baixa do BM continuam completos. Os valores são os recebíveis/comissões da Jacoby, preservando a regra anterior. |
| Imagens na gestão de projetos | Upload compartilhado para tarefa, subtarefa e resposta do cliente: caminhos ASCII seguros para nomes acentuados/com símbolos, UUID único, nome original conservado, validação de vazio/10 MB, sessão validada no TaskDialog, prevenção de dupla ação e tratamento de falhas. Arquivo possivelmente referenciado não é apagado em resultado incerto. | Não foi reproduzido o arquivo/erro exato de Juliana em produção; configurações efetivas do bucket/RLS/session dela continuam sem verificação remota. Não foram ampliadas políticas de `task-attachments`. |

### Avisos e cancelamento

A migration `20261115120000_task_document_request_notifications.sql` usa uma chave única por tarefa/login e não reavisa ao salvar os mesmos campos. Ao mudar título/prazo ou reativar a solicitação, substitui o aviso atual e marca-o não lido. Concluir, ocultar, remover a solicitação ou mover a tarefa à lixeira remove o aviso; trocar de cliente remove os avisos do cliente anterior. A política de leitura impede que um login desvinculado continue vendo um aviso antigo. Tarefas de demonstração não geram avisos.

Anexar um arquivo ou adicionar uma subtarefa a uma tarefa ainda não salva pode criar um rascunho interno, como no fluxo existente. Esse rascunho agora fica sem publicação/solicitação ao cliente; somente **Salvar** explicitamente ativa os campos escolhidos. Cancelar um seletor de arquivo não faz upload. Cancelar o formulário não publica a solicitação pendente do rascunho.

A migration `20261115121000_allow_scoped_finalized_invoice_append.sql` não contém concessão de permissão a usuários. Ela altera somente a política restritiva de INSERT do Storage; as políticas de UPDATE/DELETE e os triggers de bloqueio de BM finalizado permanecem. Exige permissão explícita, billing, conta ativa, usuário interno e BM real finalizado; não cobre anexos de serviços, movimentos ou outros buckets.

### Evidência e reprodução

- `npm test`: 235 testes passaram, preservando regressões financeiras, recorrência e email.
- `npm run typecheck`: passou.
- `npm run build` e `npm run build:pages`: passaram, com avisos preexistentes sobre bundles grandes/APIs antigas/diretivas de dependências.
- Lint dos novos helpers (`task-attachments`, `billing-invoice-access`, `local-review-storage`), biblioteca de modelos, Faturado e testes novos: passou. O lint global continua com problemas de legado; não foi feita formatação global.
- `npm run test:dev-items:sql`: passou. O script cria **um cluster novo** de PostgreSQL, sem TCP, em diretório temporário privado; não recebe URL de banco. Executa as duas migrations novas e a restrição antiga de BM sobre uma fixture mínima com IDs/usuários/clientes fictícios. Ao terminar, desliga e remove o cluster. Requer `initdb`, `pg_ctl` e `psql` locais.
- A integração SQL cobre aviso somente para logins ativos, repetição sem duplicar nem alterar leitura, prazo, troca de cliente, cancelamento, conclusão/reabertura/lixeira/demo, bloqueio após desvincular cliente e matriz de permissão de anexos (inserir permitido, substituir/excluir/reabrir e acesso financeiro negados).
- No navegador, com `VITE_LOCAL_REVIEW=true`, foi verificado o IndexedDB real: gravação, listagem, leitura dos bytes e rejeição de sobrescrita de um arquivo fictício. O arquivo de QA foi removido no `finally`. Nenhuma credencial, conta, tarefa ou permissão foi criada no navegador para esse teste.

O modo de revisão mantém os arquivos em IndexedDB local (além dos metadados locais), ignorando credenciais reais. Ele não executa triggers PostgreSQL no navegador: a prova dos avisos e da RLS está no teste SQL separado. Corrigida também uma referência a `window` durante SSR da tela de acesso, para manter o servidor local revisável.

As fixtures SQL não reproduzem a base Supabase completa, o gateway Storage nem as permissões atuais da Angela. Uma implantação futura deve ser revisada/autorizada separadamente. Não houve upload remoto, email real, alteração em produção, commit, push ou deploy. A aba de pátio permanece fora do escopo.

Resultado final de lint desta etapa (excluindo somente bundles gerados): 8.081 erros e 69 avisos; HEAD original: 8.260/69. No conjunto de sete arquivos legados alterados nesta etapa, 521 erros/1 aviso, contra 552/1 no HEAD original. A abertura de uma janela independente do aplicativo Terminal foi bloqueada pela política da ferramenta de interface; o Vite foi iniciado pelo executor local autorizado.


## Reprodução concreta: seletor de Ângela, cadastro e CC

Conversa Codex: **Ajustes locais do sistema Jacoby**. As mudanças anteriores foram preservadas.

### Instâncias e ambiente

A inspeção inicial de processos/arquivos confirmou que 8080 e 5174 usam este mesmo checkout. A 8080 tinha Supabase configurado e `VITE_LOCAL_REVIEW` desativado; a 5174 usa `VITE_LOCAL_REVIEW=true`, que ignora as credenciais e permanece isolada. Não houve navegação/ação na sessão real da Ângela. A porta 8080 deixou de responder numa verificação posterior; ela não foi reiniciada por esta revisão.

Após o login Supabase realizado por Reinan, foram consultados somente metadados e baixada uma cópia da função de email para `/tmp/jacoby-email-function-audit`. A lista da CLI retornou um único projeto, com nome visível diferente de “Sistema Jacobi”; o alvo continua classificado pela CLI como `environment: unverified`. A configuração `.env` do checkout corresponde ao projeto vinculado. **Nome do projeto e login não comprovam que o banco é desenvolvimento**, portanto nenhuma escrita remota, migration, alteração de acesso ou implantação foi executada.

A identidade/UUID e as permissões efetivas da Ângela real não foram confirmadas numa base de desenvolvimento identificada. Não se concedeu acesso por nome de exibição. As permissões foram exercitadas em perfis fictícios e no PostgreSQL local descartável.

### Causa e correção do seletor

Na linha de serviços, em **Arquivo de faturamento**, havia `input disabled={Boolean(isLocked(cycle))}` sem considerar a permissão específica de anexação. A exceção anterior existia somente no bloco geral de arquivos do BM. Assim, em um BM finalizado marcado como somente consulta, clicar naquela linha não poderia abrir o seletor. O relato de Reinan de “somente consultas” é consistente com essa guarda; o perfil real não foi alterado para contorná-la.

O novo `BillingInvoiceFilePicker` usa um botão HTML real, `type=button`, e um input montado acionado por ref de forma síncrona no gesto do usuário, substituindo os controles compostos de label/span. Input e botão compartilham as mesmas guardas. Há bloqueio durante gravação, reset do input para repetir o mesmo arquivo, tratamento de erro e cancelamento sem envio.

Em BM aberto, o seletor da linha segue o fluxo existente de anexar ao serviço. Em BM finalizado, a linha mostra **Anexar nova nota ao BM**: quando a capacidade específica está presente, ela aciona o input do bloco geral e salva somente um novo arquivo do BM. Não atualiza o serviço nem substitui seu arquivo. Sem essa capacidade, a ação continua desabilitada e o motivo é exibido. O próprio componente geral também verifica `billing` e usuário interno, tanto na apresentação quanto na mutação.

### Cadastro de BM é distinto da anexação em finalizado

`billing` é o acesso operacional que já inclui cadastrar BMs e trabalhar nos abertos. `billing_lock_finalized` protege os existentes finalizados. `billing_append_finalized_invoice` é a exceção adicional, só para inserir novas notas em finalizados; não dá acesso a billing por si só.

Foi adicionado **Cadastrar novo BM** ao cabeçalho do boletim: um colaborador interno com billing pode iniciar outro BM mesmo enquanto consulta um finalizado, sem reabri-lo. A ação muda para um novo rascunho/formulário; os dados finais só são gravados após confirmar a criação. A mutação revalida a permissão e usa trava contra dupla ação. Nenhuma permissão real foi alterada.

### CC não confirmado pelo servidor

A cópia da função **implantada** no projeto vinculado não contém `js.js.ambientais@gmail.com`, campo `cc` no payload nem a nova prévia de CC. Isso explica a resposta “CC não informado pelo servidor”; mudar somente a interface local não atualiza a Edge Function implantada.

A interface agora mostra **Cópia confirmada pelo servidor: js.js.ambientais@gmail.com** somente quando a resposta confirma esse destino. Se Juliana já for o único destinatário principal, informa isso sem duplicar CC. Ausência, CC vazio para outro destinatário ou endereço diferente são apresentados como **não confirmados**, e a confirmação de envio é bloqueada também no handler. Não se afirma que haverá cópia sem prova do servidor. A publicação sem email permanece separada.

Ativar o comportamento no projeto remoto exigirá implantação futura autorizada da função local `send-billing-emails` e seu helper. Essa implantação não foi realizada e nenhum email foi disparado.

### Verificação reproduzível

- `npm test`: 242 testes passaram, incluindo o componente real de seletor com hooks controlados, cancelamento, repetição do mesmo arquivo, dupla ação, readonly e guardas de papel/permissão; confirmação/ausência de CC e bloqueio de envio; cadastro distinto de anexação.
- `npm run test:dev-items:sql`: passou em cluster novo via socket Unix, com fixture fictícia. Inclui criar BM novo em draft com billing + bloqueio de finalizados, sem conceder exceção de anexos e sem destravar BM antigo.
- Fixture visual: `npm run dev -- --config tests/fixtures/vite.picker.config.ts`, depois `http://127.0.0.1:5176/tests/fixtures/invoice-file-picker.html`. Esse servidor desativa leitura de `.env`, não importa autenticação/Supabase e não faz uploads. Ações de cadastro/envio nessa fixture são simulações sem banco.
- No navegador, foi observado o evento nativo `filechooser` nos estados permitidos: aberto, finalizado com capacidade específica, publicado com capacidade específica e administrador. Sem a capacidade, cliente ou sem billing: botão e input bloqueados. No finalizado com capacidade, alterar serviço e publicar continuaram bloqueados.
- Com gravação simulada em andamento, os dois controles ficaram desabilitados. Após liberar, o seletor abriu duas vezes sucessivas. Foi usado Escape sem seleção; a fixture manteve **Arquivos selecionados: 0** em todos os casos. Nenhum arquivo foi enviado.

Pendências para aplicação real: confirmar projeto/branch de desenvolvimento e a conta exata da Ângela; manter billing e bloqueio de finalizados, habilitando só a exceção específica quando a migration correspondente estiver implantada; implantar a função de email atualizada no ambiente autorizado. Não houve alteração em produção, deploy, push ou commit.

Fechamento desta etapa: 242/242 testes; typecheck, build padrão, build:pages e integração SQL local passaram. Lint dos novos controles, helpers e fixtures passou sem diagnósticos. O lint global final dos fontes registrou 8.083 erros/69 avisos, contra 8.260/69 no HEAD original. Continuam pendentes confirmação da conta real da Ângela e de um projeto/branch remoto de desenvolvimento antes de qualquer aplicação real. A auditoria da função implantada foi somente leitura e não houve invocação de envio. A revisão principal permanece em `http://127.0.0.1:5174/` no modo isolado.

## Pedido de aplicar a permissão no teste — verificação do alvo

Autorização recebida: aplicar somente no ambiente de teste, preservando produção. A verificação posterior da CLI passou a identificar expressamente o projeto vinculado como **production** (consultas `branches list` e `db query --read-only`). Não foram retornadas branches de desenvolvimento. A stack Supabase local também não foi encontrada em execução: o daemon Docker local está indisponível. A prévia 5174 usa armazenamento do navegador e não é uma base Supabase com a conta real.

A conta foi confirmada com consulta somente leitura por UUID já documentado no teste histórico `supabase/tests/finalized-bulletin-user-lock.sql`, mais busca de nome para detectar homônimos. Foi encontrado um único registro correspondente, ativo e colaborador. Ele já possui `billing` e `billing_lock_finalized`. O plano de alteração é **adicionar somente `billing_append_finalized_invoice`**, sem remover acessos e sem mudar papel, bloqueio de finalizados ou acesso financeiro. O plano concreto, ainda não aplicado, está em `/tmp/jacoby-angela-permission-plan.json`.

O teste SQL descartável foi ampliado e passou: a concessão em colaborador fictício foi aplicada duas vezes, acrescentando exatamente uma capacidade sem duplicá-la nem remover as anteriores. Inserir nota ficou permitido; substituir, excluir, reabrir o BM e acessar Financeiro continuaram negados. Nenhuma identidade ou dado de produção foi usado nessa fixture.

**Estado: não aplicado à conta real.** Foi solicitada a referência/URL do Supabase de desenvolvimento/teste. A escrita permanece bloqueada pelo escopo autorizado até identificar esse alvo e confirmar novamente a conta nele. Não houve atualização de `user_permissions`, migration, implantação ou alteração de dados no projeto remoto.


## Aplicação pontual em produção — 15/11/2026

Nesta conversa **Sistema Jacoby**, Reinan autorizou expressamente aplicar em produção somente a exceção de anexação para Angela. As afirmações anteriores de “não aplicado” descrevem as etapas anteriores; esta seção registra a aplicação posterior e limitada.

- Checkout confirmado: `/Users/rei/Documents/Projeto Jacoby /sistema-jacoby`, remoto `jsambientais-a11y/sistema-jacoby`. Projeto Supabase confirmado pela CLI como produção: `ikdmfungulmgwvknramd`.
- Identidade confirmada novamente: Angela, `angela.aco40@gmail.com`, UUID `688b03c1-d49c-46eb-b0a3-9aaf84c3f69e`, ativa, colaboradora, único registro correspondente. `billing` e `billing_lock_finalized` já estavam presentes.
- Aplicada exclusivamente a migration `20261115121000_allow_scoped_finalized_invoice_append.sql`, mais o acréscimo de `billing_append_finalized_invoice` a essa conta, na mesma transação. Registrada somente essa versão no histórico de migrations. Não foi usado `db push` nem aplicada a migration de notificações.
- A transação validou identidade/permissões anteriores, modificou apenas a política restritiva de INSERT de arquivos e criou seu helper específico. UPDATE e DELETE continuam na guarda original. Os testes no contexto autenticado da Angela confirmaram a exceção no caminho permitido de BM real finalizado; caminhos fora do escopo foram rejeitados; edição de BM/arquivo finalizado e acesso Financeiro/configurações de movimento continuaram bloqueados. Nenhum arquivo foi inserido nesses testes: foram consultas das guardas, com caminhos de verificação sem upload.
- Snapshots antes/depois confirmaram: apenas a lista de permissões de Angela e seu `updated_at`, uma política INSERT e um novo helper mudaram. Demais contas/permissões, papéis, políticas, funções existentes e triggers permaneceram idênticos. Integração SQL local descartável também passou.
- **Limitação da interface:** o HEAD publicado ainda bloqueia o seletor e a mutação quando o BM é somente consulta. O helper/picker local ainda não foi publicado. Esta aplicação no banco, isoladamente, não libera o botão na interface online; é necessária autorização separada para publicar o frontend mínimo correspondente e validar o upload real. Não houve publicação de frontend, commit, push, deploy geral, email, upload fictício ou alteração de conteúdo de BM/faturamento.


## Publicação isolada de email — 15/11/2026

Reinan autorizou publicar a função e a interface juntas. Durante a publicação esclareceu que o CC correto é **js.js.ambientais@gmail.com** (com `js.js`); esse endereço substitui a especificação inicial `js.ambientais@gmail.com` somente no destinatário CC, sem alterar a identidade do projeto Supabase.

- Commits restritos a email: `7ff55dd`, seguido de `43d6924` com a correção do endereço. Nenhuma alteração financeira, de anexação ou de notificações do lote local foi incluída.
- Função `send-billing-emails` publicada no projeto `ikdmfungulmgwvknramd`, mantendo a configuração de autenticação existente. Fonte remota baixada após a publicação coincide com os dois arquivos testados e inclui o CC correto.
- Frontend envia para a conferência o CC retornado pelo servidor; mostra `CC: js.js.ambientais@gmail.com` por destinatário. Se Juliana já for TO nesse endereço, não duplica CC na mesma mensagem. Envio permanece bloqueado se o servidor não confirmar o endereço. Podem existir múltiplas cópias por BM, pois cada destinatário recebe mensagem separada.
- 218 testes passaram na versão isolada, typecheck e build passaram. Após a correção do endereço, os 12 testes de email/prévia/bloqueio de finalizados passaram novamente. Endpoint remoto rejeitou chamada sem sessão com 401. Nenhum email real foi enviado como teste.
- Código enviado a `main` no repositório confirmado. Checkout principal alinhado ao commit publicado preservando byte a byte os arquivos locais existentes; as demais alterações continuam pendentes.
- Deploy Vercel da correção: `dpl_DHfvNCB379ECA7wTa1CX9WD8xho9`. A confirmação final do domínio será registrada abaixo após conclusão.


Correção final de endereço pelo usuário: **js.ambientais@gmail.com**, com um único `js`. Commit `0f10832` restaura esse destinatário na prévia, validação e servidor; sua árvore é idêntica à de `7ff55dd`. As referências a `js.js` na etapa anterior registram uma orientação posteriormente corrigida e não devem ser usadas. Função republicada com o endereço final; 12 testes de email passaram novamente.

Verificação de produção: promovido `dpl_CR1i7hhFTd9HHnt21U1u9LNPEest`, construído do commit `7ff55dd`, cuja árvore é idêntica à do commit final `0f10832`. O domínio `gestao.jacobysolucoesambientais.com.br` respondeu e seu bundle contém a prévia de CC e `js.ambientais@gmail.com`, sem o endereço duplicado. Build servido verificado: `8ab0e527-22a8-4e38-a7c1-7e92d8746b07`. Fonte da função remota também conferida byte a byte após a correção. O rebuild automático do commit final foi disparado pelo GitHub; é a mesma árvore já publicada. Não foi enviado email real nem realizada conferência autenticada no modal de um BM real.


## Painel Novidades — versão 2026.11.15.2

A pedido de Reinan, o painel foi atualizado e publicado com somente os assuntos desta revisão, removendo o histórico antigo e o vídeo. Inclui email disponível com CC `js.ambientais@gmail.com`; permissão da Angela configurada com tela ainda pendente; faturamento e tarefas identificados como em preparação. Os avisos não afirmam que o lote local foi publicado. Commits finais de notas: `5e79c2f`, `056f004` e `2f432d5`. O manifesto servido no domínio de produção foi comparado com o JSON local e coincide integralmente: quatro seções, versão `2026.11.15.2`, sem vídeo. Typecheck e testes do manifesto/controles passaram. Demais alterações locais preservadas; nenhuma função, permissão ou dado foi modificado nesta publicação de notas.

## Gestão completa de anexos da Angela — produção 15/11/2026

Autorização posterior explícita de Reinan: publicar somente o ajuste de anexos da Angela; escopo ampliado para adicionar, substituir, renomear e excluir arquivos. Essa autorização substitui a limitação anterior de somente anexar e, depois, substituir mantendo nome/formato.

- Conta reconfirmada: `angela.aco40@gmail.com`, UUID `688b03c1-d49c-46eb-b0a3-9aaf84c3f69e`, ativa, colaboradora. Mesmo projeto produção `ikdmfungulmgwvknramd`.
- Aplicadas isoladamente e registradas no histórico as migrations `20261115190000_scoped_finalized_invoice_replacement.sql` e `20261115193000_manage_finalized_bulletin_invoices.sql`, com concessões pontuais somente a Angela. Cada aplicação foi transacional e conferiu identidade/permissões antes e depois. Sem `db push` geral.
- A primeira etapa permitiu substituição de conteúdo no mesmo caminho. A etapa final permite INSERT/DELETE somente dos caminhos de notas de BMs fechados não-demo, e UPDATE de serviços apenas de `invoice_pdf_path`, `invoice_pdf_name` e `updated_at`, validando o BM do arquivo e sua existência. Caminhos compartilhados entre BMs ou anexos de movimentações ficam fora da exceção. Reabertura, valores e exclusão de serviço permanecem bloqueados.
- Comparação final com o snapshot anterior: somente Angela recebeu `billing_manage_finalized_invoices`; nenhum papel ou permissão de outro usuário mudou. Políticas restritivas INSERT/DELETE foram ajustadas para essa capacidade; demais regras seguem preservadas.
- Frontend isolado publicado em `aa0293a` e depois `b1b3541`, incluindo anexação, substituição com outro formato, renomeação e remoção, inclusive nas notas de serviço. Exclusão de nota mantém o lançamento e seus valores. Operações concorrentes nos arquivos de serviços usam trava local e comparação do caminho anterior antes de atualizar.
- 220 testes, TypeScript e build da versão isolada passaram. Fixture PostgreSQL descartável e reproduzível por `bash scripts/test-finalized-invoice-management.sh` testou gestão de notas e rejeições de valor/serviço/reabertura/outra conta. Nenhum anexo real foi alterado nem arquivo fictício enviado à produção; nenhum email foi enviado. A sessão da Angela não foi usada para upload real na interface.
- Vercel `dpl_2Qm2VuKer3FGsTc1s691QYsPiRp2` Ready em produção. Domínio principal serviu manifesto `2026.11.15.4`, build `8eb01756-3df5-497d-ac4a-21c15e19ece5`, com notas iguais ao JSON publicado.
- Checkout principal alinhado a `b1b3541`, mantendo os demais ajustes locais não publicados. Cópia de segurança dos arquivos incorporados e hashes anteriores em `/tmp/jacoby-manage-canonical-backup`. Nenhuma migration de notificações ou publicação financeira do lote local foi incluída.

Conferência final: o bundle servido `/assets/portal.residuos-QvnqWEai.js` contém `billing_manage_finalized_invoices`, `Renomear nota`, `Excluir nota` e `Substituir nota`. A checagem TypeScript do checkout principal após incorporar a publicação também passou. Não houve validação por upload real na sessão autenticada da Angela.
