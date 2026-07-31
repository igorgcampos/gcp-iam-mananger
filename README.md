# EdGlobo GCP Admin

Painel web para gerenciar acessos no Google Cloud — quem pode usar o Agentspace e quem tem licença Gemini Enterprise — sem precisar abrir o console do GCP.

---

## Quick Start

```bash
# 1. Instale as dependências
npm run install:all

# 2. Configure as credenciais
cp backend/.env.example backend/.env
# Coloque o arquivo JSON da service account em backend/credentials.json
# Edite backend/.env se necessário

# 3. Rode tudo
npm run dev
```

Abra `http://localhost:5173` no navegador.

> Prefere rodar em containers? Veja a seção [Docker](#docker) abaixo.

---

## Pré-requisitos

### Service Account no GCP

Crie uma service account no projeto `agentspace-469418` com as seguintes roles:

| Role | Para quê |
|------|----------|
| `roles/discoveryengine.agentspaceAdmin` | Gerenciar licenças Gemini Enterprise |
| `roles/iam.securityAdmin` | Gerenciar a role `discoveryengine.user` no IAM |
| `roles/iam.roleAdmin` | Auto-provisionar a custom role `iamValidationProbe`, usada para validar o principal antes de conceder acesso (ver [ADR 0002](docs/adr/0002-validacao-de-principal-via-probe-descartavel.md)) |

Baixe a chave JSON e salve em `backend/credentials.json`.

> **Por que duas roles separadas?** IAM policy do projeto (`setIamPolicy`) e a Discovery Engine API são sistemas distintos no GCP — cada um exige sua própria permissão.

Habilite também a **Identity and Access Management (IAM) API** no projeto (Cloud Console → APIs & Services), necessária para o auto-provisionamento da custom role `iamValidationProbe`.

### Variáveis de ambiente (`backend/.env`)

```env
GCP_PROJECT_ID=agentspace-469418
GOOGLE_APPLICATION_CREDENTIALS=./credentials.json
PORT=3001
```

---

## Docker

Frontend e backend rodam em containers isolados — um Dockerfile multi-stage para cada um — e sobem juntos localmente via `docker-compose.yml`. As mesmas imagens são portáveis para qualquer plataforma de containers, incluindo o Cloud Run.

### Requisitos

- Docker e Docker Compose instalados.
- A mesma configuração de credenciais do [Pré-requisitos](#pré-requisitos): `backend/credentials.json` e `backend/.env` já criados.

### Subir tudo com um comando

```bash
docker compose up --build
```

- Frontend: `http://localhost:8080`
- Backend: `http://localhost:3001`

O container do frontend serve os arquivos estáticos do build (Vite) via nginx e faz proxy reverso de `/api/*` para o backend — o browser só fala com a porta 8080, então não é preciso configurar CORS nem apontar URL de API manualmente.

O `docker-compose.yml` reaproveita o `backend/.env` já existente (via `env_file`) e monta `backend/credentials.json` como volume somente-leitura dentro do container — a chave da service account nunca é copiada para dentro da imagem.

Se o frontend precisar de um `VITE_GCP_PROJECT_ID` diferente do padrão, defina-o antes do build:

```bash
cp .env.example .env   # ajuste VITE_GCP_PROJECT_ID se necessário
docker compose up --build
```

Para derrubar os containers:

```bash
docker compose down
```

### Buildar/rodar cada serviço separadamente

```bash
# Backend
docker build -t gcp-iam-manager-backend ./backend
docker run -p 3001:3001 --env-file backend/.env \
  -v $(pwd)/backend/credentials.json:/secrets/credentials.json:ro \
  -e GOOGLE_APPLICATION_CREDENTIALS=/secrets/credentials.json \
  gcp-iam-manager-backend

# Frontend
docker build -t gcp-iam-manager-frontend --build-arg VITE_GCP_PROJECT_ID=agentspace-469418 ./frontend
docker run -p 8080:8080 -e BACKEND_URL=http://host.docker.internal:3001 gcp-iam-manager-frontend
```

### Levando para o Cloud Run

Cada imagem já respeita o contrato do Cloud Run (escuta `$PORT`, stateless, roda como usuário não-root):

- **Backend:** não leve `credentials.json` para produção — anexe uma service account diretamente ao serviço Cloud Run e remova `GOOGLE_APPLICATION_CREDENTIALS`; o Application Default Credentials resolve sozinho via metadata server.
- **Frontend:** ao fazer deploy, defina a env var `BACKEND_URL` do serviço com a URL pública do backend no Cloud Run (ex.: `https://backend-xxxx-uc.a.run.app`) e passe `VITE_GCP_PROJECT_ID` como `--build-arg` no build da imagem.

---

## O que a aplicação faz

### Tela IAM — Discovery Engine User

Lista todos os usuários que têm a role `roles/discoveryengine.user` no projeto. É essa role que dá acesso de uso ao Agentspace.

Os membros ficam armazenados no formato de workforce pool:
```
principal://iam.googleapis.com/locations/global/workforcePools/entra-workforce/subject/usuario@edglobo.com.br
```
A interface exibe apenas o email (a última parte após `/`).

**Adicionar usuário:** basta digitar o email — o prefixo do workforce pool é preenchido automaticamente.

**Validação:** antes de adicionar, o backend verifica se o usuário já tem a role (erro `409` se tiver) e, em seguida, valida se o email já possui Identidade Sincronizada — via probe descartável numa custom role sem poder real (ver [ADR 0002](docs/adr/0002-validacao-de-principal-via-probe-descartavel.md)). Se o email não estiver sincronizado, retorna `422` orientando a falar com o time de AD; qualquer outra falha técnica no probe retorna `500` com mensagem genérica.

### Tela Gemini Enterprise — Licenças

Exibe as subscriptions ativas (total vs. atribuído por tier) e a lista completa de usuários com suas licenças.

**Adicionar usuário:** escolha o email e a licença no dropdown — o dropdown carrega os `licenseConfigs` disponíveis em tempo real, com o número de slots restantes visível antes de confirmar.

**Remover:** desatribui a licença, liberando o slot para outro usuário.

Ambas as telas fazem polling a cada **30 segundos** e têm botão de refresh manual.

---

## Arquitetura

![Diagrama de Arquitetura](docs/arquitetura.svg)

O frontend nunca fala diretamente com o GCP — o backend autentica com a service account e atua como proxy seguro.

---

## API Reference

### IAM

```
GET    /api/iam/users              Lista usuários com roles/discoveryengine.user
POST   /api/iam/users              Adiciona usuário à role
DELETE /api/iam/users/:email       Remove usuário da role
```

**POST /api/iam/users — body:**
```json
{ "email": "usuario@edglobo.com.br" }
```

**GET /api/iam/users — response:**
```json
[
  {
    "email": "usuario@edglobo.com.br",
    "principal": "principal://iam.googleapis.com/locations/global/workforcePools/entra-workforce/subject/usuario@edglobo.com.br"
  }
]
```

### Gemini Enterprise

```
GET    /api/gemini/license-configs   Lista licenças disponíveis (com slots restantes)
GET    /api/gemini/users             Lista usuários com licença atribuída
POST   /api/gemini/users             Atribui licença a um usuário
DELETE /api/gemini/users/:email      Remove licença de um usuário
```

**POST /api/gemini/users — body:**
```json
{
  "email": "usuario@edglobo.com.br",
  "licenseConfig": "projects/agentspace-469418/locations/global/licenseConfigs/CONFIG_ID"
}
```

---

## Troubleshooting

### `PERMISSION_DENIED` ao chamar a API

```
Error: 7 PERMISSION_DENIED: Permission 'discoveryengine.userStores.listUserLicenses' denied
```

**Causa:** A service account não tem a role `roles/discoveryengine.agentspaceAdmin`.

**Solução:**
```bash
gcloud projects add-iam-policy-binding agentspace-469418 \
  --member="serviceAccount:SEU_SA@agentspace-469418.iam.gserviceaccount.com" \
  --role="roles/discoveryengine.agentspaceAdmin"
```

---

### `setIamPolicy` retorna 403

```
Error: 403 The caller does not have permission
```

**Causa:** A service account não tem permissão para modificar a IAM policy do projeto.

**Solução:** Adicione `roles/iam.securityAdmin` (ou `roles/resourcemanager.projectIamAdmin`) à service account.

---

### Backend retorna erro `ENOENT` na chave JSON

```
Error: ENOENT: no such file or directory, open './credentials.json'
```

**Causa:** O arquivo `backend/credentials.json` não existe ou o caminho em `GOOGLE_APPLICATION_CREDENTIALS` está errado.

**Solução:** Verifique se o arquivo existe em `backend/credentials.json` e que o `.env` aponta para ele corretamente.

---

### Dropdown de licenças aparece vazio

**Causa:** A service account pode não ter acesso à rota `/licenseConfigs`, ou o location configurado está errado.

**Verifique:**
```bash
curl -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  "https://discoveryengine.googleapis.com/v1/projects/agentspace-469418/locations/global/licenseConfigs"
```

---

### Usuário adicionado no IAM não aparece na lista

**Causa:** O email precisa ser um subject válido no workforce pool `entra-workforce`. O GCP não valida a existência do subject no momento do `setIamPolicy` — a entry é criada mesmo com email inválido, mas o usuário não consegue autenticar.

**Verificação:** Confirme que o email pertence ao Entra ID federado no workforce pool.

---

## Estrutura de arquivos

```
ed-globo/
├── docker-compose.yml                 Sobe backend + frontend juntos localmente
├── .env.example                       VITE_GCP_PROJECT_ID usado no build do frontend via compose
├── backend/
│   ├── Dockerfile                    Multi-stage Node/Express, non-root
│   ├── .dockerignore
│   ├── src/
│   │   ├── index.js                  Express server
│   │   ├── routes/
│   │   │   ├── iam.js                Endpoints GET/POST/DELETE /api/iam
│   │   │   └── gemini.js             Endpoints GET/POST/DELETE /api/gemini
│   │   └── services/
│   │       ├── gcpAuth.js            GoogleAuth (service account)
│   │       ├── gcpClients.js         Clientes googleapis (crm, iam)
│   │       ├── iamPolicyStore.js     getPolicy / setPolicy (policy v3)
│   │       ├── principalProbe.js     Probe descartável de validação de principal
│   │       ├── iamService.js         listUsers / addUser / removeUser
│   │       └── geminiService.js      Discovery Engine API
│   └── .env.example
└── frontend/
    ├── Dockerfile                     Build Vite → estáticos servidos por nginx non-root
    ├── .dockerignore
    ├── nginx/
    │   └── default.conf.template     SPA fallback + proxy reverso /api → BACKEND_URL
    └── src/
        ├── App.jsx                   Layout sidebar (Ant Design)
        ├── pages/
        │   ├── IAMPage.jsx           Tela IAM com polling + CRUD
        │   └── GeminiPage.jsx        Tela Gemini com subscriptions + CRUD
        └── api/
            ├── iam.js                Cliente axios para /api/iam
            └── gemini.js             Cliente axios para /api/gemini
```
