# Pedidos ao time de AD — SSO do GCP Admin

Checklist do que precisa ser pedido/confirmado com o time de AD (Entra ID / Microsoft) para o login SSO do painel funcionar. Ver a decisão de arquitetura completa em [ADR 0005](adr/0005-sso-entra-id-para-acesso-ao-painel.md).

## 1. App Registration no Entra ID

- **Tipo**: Web app, **single-tenant** (não multi-tenant) — o backend fixa a `authority` no tenant específico da EdGlobo, nunca em `/common` ou `/organizations`.
- Após criado, anotar:
  - **Tenant (Directory) ID** → `AZURE_TENANT_ID`
  - **Application (client) ID** → `AZURE_CLIENT_ID`
  - **Application ID URI** (se exposto por algum outro consumidor do mesmo app) — não usado diretamente pelo backend hoje, mas registrar para referência futura.

## 2. Client Secret

- Gerar um **Client Secret** para o App Registration acima → `AZURE_CLIENT_SECRET`.
- Definir um prazo de expiração e um responsável por rotacionar antes do vencimento (o Client Secret também é usado no Client Credentials Flow para a checagem de grupo via Graph — ver item 3).
- **Nunca commitar o valor real** — só entra em `backend/.env` local ou no gerenciador de segredos do ambiente de produção (Cloud Run).

## 3. Permissão de API (Microsoft Graph)

- Permissão de **aplicação** (não delegada): `GroupMember.Read.All` (ou `Group.Read.All`), com **admin consent concedido** pelo time de AD.
- Usada pelo backend via Client Credentials Flow para chamar `POST /v1.0/users/{oid}/checkMemberGroups` **apenas no momento do login** (nunca por requisição — ver ADR 0005).

## 4. Redirect URIs

Cadastrar os três valores abaixo como Redirect URIs válidos do App Registration (tipo "Web"):

- **Produção**: `https://gcp-admin.edglobo.com.br/auth/callback`
- **Docker Compose**: `http://localhost:8080/auth/callback` (o nginx preserva o `Host` original do browser via `proxy_set_header Host $host`, então o backend vê `localhost:8080`, não `localhost:3001`)
- **Dev local (Vite)**: `http://localhost:3001/auth/callback` (o proxy do Vite usa `changeOrigin: true`, que reescreve o `Host` para o alvo do proxy — o backend recebe `localhost:3001` mesmo quando o browser está em `localhost:5173`)

> O backend deriva o `redirect_uri` da própria requisição (protocolo + host visto pelo Express), então qualquer domínio adicional em que o painel venha a rodar (ex.: um ambiente de staging) precisa ser adicionado aqui também — e qualquer mudança futura na configuração de proxy (Vite ou nginx) pode alterar qual valor exato precisa estar cadastrado aqui.

## 5. Grupo de acesso ao painel

- Grupo de segurança (ou Microsoft 365) no Entra ID cujos membros terão acesso ao GCP Admin.
- Anotar o **Object ID** do grupo → `AZURE_ALLOWED_GROUP_ID`.
- Não há tiers dentro do painel: pertencer ao grupo já concede acesso total a todas as ações (IAM, Code Assist, licenças Gemini).
- Inclusão/remoção de membros no grupo é responsabilidade do time de AD — o painel não gerencia a membership do próprio grupo.

## Resumo das env vars geradas a partir deste checklist

| Env var | Origem |
|---|---|
| `AZURE_TENANT_ID` | App Registration (item 1) |
| `AZURE_CLIENT_ID` | App Registration (item 1) |
| `AZURE_CLIENT_SECRET` | Client Secret (item 2) |
| `AZURE_ALLOWED_GROUP_ID` | Object ID do grupo (item 5) |

`SESSION_JWT_SECRET` e `FRONTEND_BASE_URL` **não** vêm do time de AD — são gerados/configurados localmente (ver seção "Autenticação (SSO)" do README).
