# SSO via Entra ID para acesso ao painel

O painel hoje não tem nenhuma autenticação de aplicação: qualquer request chega direto nas rotas de `/api/iam` e `/api/gemini`, protegido apenas pela rede em que o serviço está exposto. Isso não escala com o painel indo para um domínio público fixo (`https://gcp-admin.edglobo.com.br`, ver seção Docker/Cloud Run do README) — precisamos identificar quem está operando o painel (o "Operador", ver `CONTEXT.md`) e restringir o acesso a quem a organização já autoriza via Entra ID (Azure AD), sem inventar um cadastro de usuários/senhas próprio.

Decidimos implementar login SSO via **Confidential Client** OIDC no backend (Node/Express), nunca no frontend: o frontend nunca vê o Client Secret nem troca código por token diretamente. O fluxo:

1. `GET /auth/login` gera um `state` aleatório (anti-CSRF), guarda em cookie `httpOnly` de curta duração, e redireciona o browser para a tela de login da Microsoft (via `@azure/msal-node`, `getAuthCodeUrl`, scopes `openid profile email`).
2. `GET /auth/callback` valida o `state`, troca o código de autorização por tokens (`acquireTokenByCode`) e extrai `oid`/email/nome do ID token.
3. Com o `oid` do Operador, o backend faz uma **segunda** chamada MSAL — Client Credentials Flow, scope `https://graph.microsoft.com/.default`, mesmo Client Secret — para obter um token de aplicação e chamar `POST /v1.0/users/{oid}/checkMemberGroups` no Microsoft Graph, verificando se o Operador pertence ao grupo do AD que libera acesso ao painel (`AZURE_ALLOWED_GROUP_ID`).
4. Se pertence: o backend emite sua própria sessão — um JWT (HS256, `SESSION_JWT_SECRET`) com claims `{email, name, oid}` e TTL de ~8h, setado como cookie `httpOnly`/`sameSite=lax`/`secure` (em produção). Se não pertence: nenhum cookie de sessão é setado e o browser é redirecionado para `${FRONTEND_BASE_URL}/?error=access_denied` — nunca de volta para a tela de login, para não parecer um loop.
5. As rotas mutáveis (`/api/iam`, `/api/gemini`) passam por um middleware `requireAuth` que só valida a assinatura e expiração do JWT local — **não** chama o Graph a cada requisição. A checagem de grupo acontece uma única vez, no login.

A `authority` do MSAL é fixada no tenant específico da EdGlobo (`https://login.microsoftonline.com/${AZURE_TENANT_ID}`) — nunca `/common` nem `/organizations`. Isso é deliberado: `/common` aceitaria login de qualquer tenant Microsoft (inclusive contas pessoais ou de outras organizações que por acaso tenham o mesmo app registrado como multi-tenant), o que abriria a superfície de ataque para muito além do necessário. Fixar o tenant garante que só contas do diretório da EdGlobo completam o fluxo, antes mesmo da checagem de grupo entrar em jogo.

O logout (`POST /auth/logout`) é só local: limpa o cookie de sessão do painel. Não chama o endpoint de logout da Microsoft (`/oauth2/v2.0/logout`) — decisão explícita para não encerrar a sessão SSO do Operador em outras aplicações da organização que dependam do mesmo login.

Não existe tiers/roles de Operador: pertencer ao grupo do AD já concede acesso total às ações do painel. Se um dia for necessário granularidade, isso é uma decisão nova, não coberta por este ADR.

## Considered Options

- **Sessão com store no backend (Redis, banco, etc.)**: descartada — o projeto não tem nenhum banco de dados hoje (o único estado é a IAM policy do GCP, via `iamPolicyStore.js`), e introduzir um só para sessão adicionaria uma peça de infraestrutura nova só para isso. JWT stateless resolve sem essa dependência.
- **Checagem de grupo a cada requisição (middleware chama o Graph em tempo real)**: descartada — adicionaria uma chamada de rede externa (Microsoft Graph) na latência de toda ação do painel, e criaria uma dependência rígida de disponibilidade do Graph para o painel funcionar minuto a minuto. A checagem no login já é suficiente: a janela de exposição de um Operador removido do grupo é o TTL da sessão (~8h), aceitável para este painel interno.
- **Authority `/common` ou `/organizations` (multi-tenant)**: descartada — abriria o login para contas fora do tenant da EdGlobo antes mesmo da checagem de grupo.
- **Logout que também desloga da conta Microsoft**: descartada a pedido do usuário — o Operador não deve perder a sessão SSO de outras aplicações só por sair deste painel.
- **Roles/tiers de Operador dentro do painel**: descartada — um único nível de acesso (dentro do grupo = acesso total) é suficiente para o tamanho atual do time que opera o painel.

## Consequences

- Login e checagem de grupo dependem da disponibilidade do Microsoft Graph e do Entra ID no momento do login; se o Graph estiver indisponível, o Operador não consegue entrar (mas sessões já ativas continuam válidas até o TTL expirar).
- Remover alguém do grupo do AD não revoga sessões já emitidas — o efeito só é sentido no próximo login (após o TTL da sessão atual expirar, ~8h). Para revogação imediata, seria necessário um mecanismo de invalidação de sessão (denylist), fora do escopo deste ADR.
- O backend precisa de mais três segredos de configuração (`AZURE_CLIENT_SECRET`, `SESSION_JWT_SECRET`, e o `AZURE_TENANT_ID`/`AZURE_CLIENT_ID`/`AZURE_ALLOWED_GROUP_ID` como identificadores), todos vindos do time de AD ou gerados localmente — ver `docs/sso-pedidos-time-ad.md`.
- `/auth/login` e `/auth/callback` precisam ser acessíveis no mesmo domínio público que o frontend (via proxy do nginx em produção, ou do Vite em dev) para que o cookie de sessão seja same-site — não é possível servir o frontend e o backend de auth em domínios diferentes sem reconfigurar o cookie como cross-site (perdendo `sameSite=lax`).
