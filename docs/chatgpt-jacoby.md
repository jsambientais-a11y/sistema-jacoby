# Conector Jacoby no ChatGPT

## Estado desta implementação

Implementação desligada por padrão até configuração explícita. A conta Plus do Reinan exibiu o formulário de conexão MCP com OAuth no navegador em 07/11/2026. O endpoint de descoberta do Supabase Jacoby retornou `feature_disabled` (OAuth Server desativado). Não há conexão real ativa enquanto os passos de ativação abaixo não forem concluídos. Não foram usados créditos nem chaves da API de IA.

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

Testes unitários usam identidades e dados fictícios. Build e mocks não substituem consentimento real, teste de consulta no ChatGPT e teste de revogação. A ativação OAuth e o piloto externo ainda precisam ser executados antes de considerar a integração operacional.

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

A primeira tentativa de conversa revelou uma lista vazia de ferramentas. A integração não deve ser considerada concluída somente pelo consentimento ou pelo build. O teste de consulta, a atualização da descoberta no ChatGPT e a revogação real precisam ser confirmados antes da entrega operacional. O servidor usa o bearer explícito para consultar grants, pois a API de grants do SDK exige sessão persistida, ausente em endpoints stateless.
