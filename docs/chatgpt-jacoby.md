# Conector Jacoby no ChatGPT

## Estado desta implementação

Piloto publicado e validado em 07/11/2026 na conta Plus reinan3323. OAuth Server e o cliente dedicado estão ativos no Supabase Jacoby. O acesso autorizado no sistema é o da Juliana. A configuração permanece desligada por padrão em ambientes sem ativação explícita. Não foram usados créditos nem chaves da API de IA.

## Funcionamento

O ChatGPT é o cliente MCP. A Jacoby serve `/api/chatgpt/mcp` usando o servidor já existente de TanStack Start/Vercel. Supabase Auth é o provedor OAuth 2.1, responsável por login, PKCE, consentimento, tokens e revogação. A aplicação não implementa um servidor OAuth próprio, não recebe a senha do ChatGPT e não armazena refresh tokens do usuário.

A tela `/integracoes-chatgpt` gerencia a conexão e também recebe `authorization_id` para o consentimento. O login preserva esse identificador. Depois do consentimento, o retorno é validado para os caminhos OAuth oficiais de `https://chatgpt.com`.

### Restrição de acesso

- Publicação: somente Juliana, UUID `b2f6e43d-ce24-4de2-a770-0548793cc180`, admin ativo e sem papel cliente.
- Desenvolvimento: o mesmo acesso, mais o UUID do Reinan `9f04a62f-dba4-4cbb-918d-96e848ab0c16` para teste. O build de produção não inclui esse bypass.
- A regra vale na navegação, na tela e no endpoint MCP. Outro administrador também é recusado.
- A execução das ferramentas verifica o usuário com Supabase Auth, papel atual, conta ativa, emissor, expiração, `client_id` dedicado e grant ainda existente. A inicialização MCP e a lista estática de ferramentas são públicas para a descoberta do plugin; não acessam tabelas nem retornam dados de clientes. Não aceita tokens de sessão comuns no MCP.
- As consultas usam a chave publicável e o token do próprio usuário, preservando RLS. Nenhuma service role nem ferramenta de SQL livre.
- A UI lista e revoga somente grants dos client IDs dedicados ao conector, preservando outros aplicativos.

### Ferramentas

- `identificar_acesso`: informa qual conta da Jacoby está autorizada.
- `explicar_fluxo`: guia de áreas e links. Requer manutenção quando regras/telas mudarem. Não é inspeção automática do código nem garantia de cálculo financeiro.
- `buscar_clientes`: consulta pelo nome, 25 por página, com `temMais`.
- `buscar_boletins`: consulta por número/cliente, 25 por página, exclui demonstrações.
- `consultar_boletim`: dados operacionais de um BM, até 100 movimentações e serviços. Informa truncamento. Não calcula recebíveis ou comissões.
- `preparar_tarefa`: devolve link com rascunho validado. A usuária abre o formulário existente, revisa e salva. Descrição inicial vazia e responsável inicial igual a quem cria. Não há gravação pelo MCP.

Não há pagamentos, baixas financeiras, alteração/finalização de BM, exclusão nem envio de e-mail pelo conector nesta versão. Esses recursos exigem implementação e validação próprias. Links de rascunho incluem o título e os identificadores escolhidos na URL; evite informações sensíveis no título.

## Ativação em ambiente compartilhado

1. Revisar os diffs e publicar a aplicação com suporte a servidor. GitHub Pages estático não hospeda esses endpoints.
2. Em Supabase Auth, ativar OAuth Server e apontar a tela de autorização para `/integracoes-chatgpt` na origem correta da Jacoby. Não alterar Site URL para localhost no projeto de produção.
3. Criar um cliente OAuth dedicado ao ChatGPT, com PKCE S256, método de autenticação de cliente `none` e a URI de retorno EXATA mostrada no formulário de conexão do ChatGPT. Usar cadastro manual. Não é necessário abrir registro dinâmico para qualquer aplicativo.
4. Configurar no servidor (não como VITE e sem service role):

```text
CHATGPT_MCP_ENABLED=true
CHATGPT_MCP_ORIGIN=https://gestao.jacobysolucoesambientais.com.br
CHATGPT_MCP_CLIENT_IDS=<UUID do cliente OAuth dedicado>
```

A URL e a chave publicável do Supabase já usadas pela aplicação continuam sendo utilizadas. `CHATGPT_MCP_ORIGIN` é fixa e não deriva do cabeçalho Host. Para o piloto com a conta ChatGPT do Reinan, a autorização da Jacoby deve continuar sendo feita por uma conta permitida. Nenhuma identidade do ChatGPT é presumida a partir do nome da conexão.

5. No ChatGPT web, Plugins → Adicionar → Adicionar servidor MCP personalizado. Nome Jacoby, URL `https://gestao.jacobysolucoesambientais.com.br/api/chatgpt/mcp`, OAuth. Se necessário, informar o client ID dedicado nas configurações avançadas. Copiar a URI de retorno exata para o cadastro do cliente antes de autorizar.
6. Confirmar as permissões e aprovar a conexão na Jacoby. Essa autorização compartilha com o ChatGPT os dados que forem retornados pelas ferramentas. Revisar as configurações de dados da conta ChatGPT.
7. Testar identificação da conta, busca de BM, guia e rascunho em empresa de teste. Não modificar BMs reais para testar.
8. Revogar na Jacoby e verificar que chamadas anteriores deixam de funcionar. Uma nova conexão requer nova autorização.

A integração não chama modelos OpenAI via API. O uso do ChatGPT depende da disponibilidade e dos limites do plano. Infraestrutura usa a hospedagem e o Supabase da Jacoby, sujeitos aos respectivos planos.

## Verificação local

```sh
node --test tests/chatgpt-connection.test.mjs
npm run build
npm run dev -- --host 127.0.0.1 --port 8080
```

- `/api/chatgpt/metadata`: metadados do recurso.
- `/api/chatgpt/status`: diagnóstico autenticado para a Juliana (ou Reinan em dev).
- `/api/chatgpt/mcp`: sem bearer retorna 401 com descoberta; desligado retorna 503 após autenticação.
- `/integracoes-chatgpt`: estado real de ativação/grants. Nunca simula conexão bem-sucedida.

Testes unitários usam identidades e dados fictícios. Build e mocks não substituem consentimento real, teste de consulta no ChatGPT e teste de revogação. O piloto externo desta publicação foi verificado conforme os resultados ao final deste documento.

## Referências

- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/api/docs/guides/custom-mcp-server
- https://supabase.com/docs/guides/auth/oauth-server/getting-started
- https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication

## Entrada principal do assistente

A entrada no menu é **Assistente IA** e a tela principal é **Pergunte ao assistente de IA**, com campo de pedido e sugestões. A gestão da autorização fica em **Minha conexão**.

Depois de criar o plugin, configurar seu identificador real no servidor como `CHATGPT_MCP_PLUGIN_ID`. O botão principal usa o formato oficial `codex://new?prompt=...` com uma menção explícita `[@Jacoby](plugin://<id>)`. Abre o aplicativo ChatGPT/Codex com o pedido no compositor; não o envia automaticamente. Sem plugin instalado, pode ser solicitada a instalação/autorização. Não simular uma conversa vinculada apenas abrindo o ChatGPT comum.

Esse atalho requer o aplicativo compatível no computador da usuária. Para uso exclusivamente no navegador, o fluxo suportado nesta implementação é abrir Plugins, selecionar Jacoby e iniciar a conversa por lá. Um atalho web direto com plugin pré-selecionado ainda precisa de validação no plugin real, sem inventar parâmetros de URL não documentados.

Referência do atalho https://learn.chatgpt.com/docs/reference/commands#start-a-chat-with-a-plugin

## Piloto publicado em 07/11/2026

OAuth Server foi ativado no projeto Jacoby, com registro dinâmico desativado. O Site URL agora usa o domínio atual, preservando o endereço legado em retornos permitidos. O cliente dedicado do piloto foi criado com PKCE e método `none`. A conta ChatGPT do teste foi alterada pelo usuário para `reinan3323`; a autorização na Jacoby permanece exclusivamente vinculada à Juliana. Houve consentimento real confirmado no banco.

A primeira tentativa de conversa revelou uma lista vazia de ferramentas; isso foi corrigido permitindo descoberta estática pública, mantendo a execução autenticada. Consentimento ou build isolados não comprovam funcionamento. Os testes reais estão registrados abaixo. O servidor usa o bearer explícito para consultar grants, pois a API de grants do SDK exige sessão persistida, ausente em endpoints stateless.

### Validação real do piloto

O plugin ativo é **Jacoby Assistente**, instalado na conta Plus reinan3323. O plugin inicial ficou identificado como **Jacoby — teste anterior** e não deve ser usado. O identificador do plugin ativo foi configurado na Vercel. A descoberta estática mostrou as seis ferramentas e a execução via conversa identificou `jacoby@master.com` e encontrou o BM 211, sem alterações de cadastro. A busca usa primeira página 1; aceita 0 como compatibilidade. A tela de consentimento foi movida para o início para que o botão de retorno fique visível.


### Resultado final da verificação

- Após reinstalação do plugin, chamadas reais de `identificar_acesso` e `buscar_boletins` com número 211 e página 1 retornaram a conta da Juliana e o BM finalizado, respectivamente. O resultado bruto da ferramenta foi conferido no ChatGPT.
- `preparar_tarefa` gerou um link de revisão sem gravar dados. O formulário abriu com título “Teste do assistente — revisar BM 211”, prazo 10/11/2026, prioridade Média, responsável Juliana e descrição vazia. Foi fechado sem salvar.
- A revogação na Jacoby removeu o consentimento ativo e bloqueou uma nova execução. O ChatGPT apresentou erro MCP genérico, sem instrução amigável de reconexão. A tentativa de conectar outra conta não substituiu a credencial revogada; desinstalar e reinstalar somente o plugin restabeleceu o acesso, confirmado por consulta real. Esse é o procedimento de recuperação validado neste piloto.
- A correção de query considera a desserialização JSON feita pelo TanStack para preservar o rascunho após a normalização da URL.
- Nenhum BM, cliente ou tarefa foi criado, alterado ou excluído pelos testes. Mudanças externas ficaram restritas à publicação, configuração OAuth e consentimentos autorizados.

O atalho para o aplicativo desktop usa o formato documentado; o fluxo de consulta pelo plugin no navegador e o retorno do rascunho foram verificados. A abertura pelo atalho desktop ainda precisa ser conferida no computador da usuária. O piloto não oferece alterações autônomas de registros: a tarefa precisa ser revisada e salva na Jacoby.

## Ampliação local: visão entre módulos e ações revisadas

Esta ampliação ainda não foi publicada nem importada no plugin. O piloto em produção continua com as seis ferramentas iniciais até a atualização da aplicação e da descoberta no ChatGPT.

A versão local adiciona seis ferramentas:

- `mapa_sistema`: catálogo de 20 áreas/fontes e conexões entre cadastros, configuração, BM, Faturamento, recebíveis, contas, processos e ISO. Expõe os filtros aceitos por área.
- `buscar_registros`: consulta paginada e com seleção explícita de campos para clientes, filiais, terceirizadas, resíduos, equipamentos, serviços, tarefas, modelos, documentos, contas manuais, centros, bancos, cartões, compras, recorrências e configurações de comissão. Ativos por padrão; excluídos ficam fora. Não lê o conteúdo dos arquivos nem dados de autenticação.
- `consultar_fluxo_bm`: cruza um BM com operação, serviços, notas anexadas, comissões, conferência salva e recebíveis derivados. `buildBillingFlowEntries` foi extraído do hook original e é usado tanto pelas telas quanto pelo servidor; `toReceivable` e `summarizeReceivables` também são compartilhados. Não associa contas manuais a um BM por semelhança de texto. Se há múltiplos BMs, exige escolha por UUID. Se uma fonte falha ou ultrapassa 1.000 registros, informa incompletude e omite os totais. Lê blocos de 500 para detectar a existência do registro 1.001 sem depender de `max_rows` do PostgREST. A leitura não é um snapshot transacional.
- `consultar_processo`: tarefa, subtarefas paginadas, status, coluna e responsável.
- `consultar_iso`: usa somente `iso_open_workspace`, uma RPC de leitura com controle próprio de acesso. Lista auditorias e consulta planos, não conformidades, evidências e perguntas da auditoria escolhida.
- `preparar_acao`: propõe edição de título/prazo/prioridade de tarefa ou criação de conta manual a pagar/receber. Não escreve pelo MCP. A confirmação ocorre na Jacoby, mostrando campos atuais e propostos. Usa sessão e RLS do usuário, validade de 20 minutos, versão `updated_at` na edição e UUID estável na criação para evitar duplicidade da mesma proposta. Não altera descrição, responsável ou conclusão de tarefa, nem executa baixa ou pagamento. Valores monetários da proposta e contas manuais são centavos inteiros; no cruzamento do Faturamento são reais (BRL).

A interface de revisão exige marcar que os dados foram conferidos antes de habilitar “Confirmar e salvar na Jacoby”. Para mudar a proposta, a usuária retorna à conversa. A execução das alterações foi validada com banco simulado; os testes não criaram contas nem modificaram tarefas reais. A inspeção visual local depende de login na aba localhost. Não considerar essa etapa como validada somente pelo build.

A implantação amplia o conjunto de dados que o ChatGPT pode receber, incluindo informações financeiras e ISO. Antes de atualizar as ferramentas no plugin real, apresentar essa ampliação para confirmação. A restrição de conta continua Juliana em produção e Reinan adicional somente no desenvolvimento. Não há chave ou chamada à API de modelos de IA.
