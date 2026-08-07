# ADC e Secret Manager (sem chave estática) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Eliminar `backend/credentials.json` (chave estática de service account) em dev e produção, substituindo por Application Default Credentials (ADC); mover os dois segredos reais (`AZURE_CLIENT_SECRET`, `SESSION_JWT_SECRET`) para o Secret Manager, buscados pelo backend em dev via API/ADC e injetados nativamente pelo Cloud Run (`--update-secrets`) em produção.

**Architecture:** `gcpAuth.js` para de passar `keyFile` ao `GoogleAuth` — a lib resolve a credencial sozinha pela cadeia padrão do ADC (metadata server no Cloud Run em prod; ADC impersonada da SA em dev, via `gcloud auth application-default login --impersonate-service-account=...`). Um novo `secretManager.js` resolve cada segredo real com uma regra única sem branch por ambiente: se a env var alvo já vier setada em `process.env` (prod — o Cloud Run já injetou via `--update-secrets`), usa direto; se vier ausente (dev — nada injeta nada), busca a versão `latest` no Secret Manager via `@google-cloud/secret-manager`, usando a mesma ADC, e grava o valor de volta em `process.env` para que `msalClient.js`/`sessionToken.js` continuem lendo `process.env` sem qualquer mudança. `backend/src/index.js` vira um bootstrap assíncrono que resolve os dois segredos antes de `app.listen()`, falhando rápido (log claro + `process.exit(1)`) se não conseguir. `docker-compose.yml` monta o arquivo de ADC do host no lugar do `credentials.json` de hoje.

**Tech Stack:** Node/Express + Jest (backend), mesmo padrão dos serviços existentes (`gcpAuth.js`, `sessionToken.js`). Nova dependência: `@google-cloud/secret-manager`.

**Context docs already written (do not re-derive these decisions):** [`docs/adr/0007-adc-e-secret-manager-para-credenciais.md`](../adr/0007-adc-e-secret-manager-para-credenciais.md), seção "Autenticação (SSO)" / "Segredos no Secret Manager" e "Pré-requisitos" do [`README.md`](../../README.md), [`docs/sso-pedidos-time-ad.md`](../sso-pedidos-time-ad.md). Não reabra essas decisões (identidade via impersonation, fallback condicional por env var ausente, nomes/versão `:latest` dos secrets, separação por ambiente) — implemente-as.

**Pré-requisito já feito pelo usuário (fora do código):** os 4 secrets (`azure-client-secret-dev`, `azure-client-secret-prod`, `session-jwt-secret-dev`, `session-jwt-secret-prod`) já existem no Secret Manager do projeto `agentspace-469418`; a SA do painel já tem `roles/secretmanager.secretAccessor` nos 4; devs já têm `roles/iam.serviceAccountTokenCreator` na SA para impersonation.

**Fora de escopo (não mudou, não mexer):** Dockerfiles, nginx reverse-proxy do frontend, arquitetura de dois serviços Cloud Run — já implementados antes desta mudança.

---

## File Structure

- Modify: `backend/package.json` — nova dependência `@google-cloud/secret-manager` (via `npm install`, não editado manualmente).
- Modify: `backend/src/services/gcpAuth.js` — remove `keyFile`.
- Create: `backend/src/services/secretManager.js` — `resolveSecret`/`resolveAppSecrets`.
- Create: `backend/src/services/secretManager.test.js`.
- Modify: `backend/src/index.js` — bootstrap assíncrono.
- Modify: `docker-compose.yml` — troca o mount de `credentials.json` pelo arquivo de ADC do host.

`gcpAuth.js` não ganha teste próprio nesta mudança — segue o padrão já existente no repo de não testar wrappers finos de SDK (não há `gcpAuth.test.js`/`msalClient.test.js` hoje). `index.js` também não é testado hoje (as suites de rotas importam `app.js` diretamente, sem passar pelo bootstrap) e continua assim.

---

### Task 1: Instalar a dependência do Secret Manager

**Files:**
- Modify: `backend/package.json`

- [x] **Step 1: Instalar**

```bash
cd backend && npm install @google-cloud/secret-manager
```

- [x] **Step 2: Conferir que entrou em `dependencies` (não `devDependencies`)**

Abra `backend/package.json` e confirme a nova linha em `"dependencies"`.

- [x] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore(backend): adiciona dependencia @google-cloud/secret-manager"
```

---

### Task 2: `secretManager.js` — resolve um segredo (TDD)

**Files:**
- Create: `backend/src/services/secretManager.js`
- Test: `backend/src/services/secretManager.test.js`

- [x] **Step 1: Escrever o teste falho**

Crie `backend/src/services/secretManager.test.js`:

```js
const OLD_ENV = process.env;

const mockAccessSecretVersion = jest.fn();

jest.mock('@google-cloud/secret-manager', () => ({
  SecretManagerServiceClient: jest.fn().mockImplementation(() => ({
    accessSecretVersion: mockAccessSecretVersion,
  })),
}));

describe('secretManager', () => {
  let resolveSecret;

  beforeEach(() => {
    jest.resetModules();
    mockAccessSecretVersion.mockReset();
    process.env = { ...OLD_ENV };
    delete process.env.AZURE_CLIENT_SECRET;
    delete process.env.AZURE_CLIENT_SECRET_ID;
    // eslint-disable-next-line global-require
    ({ resolveSecret } = require('./secretManager'));
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('usa o valor já presente em process.env sem chamar o Secret Manager', async () => {
    process.env.AZURE_CLIENT_SECRET = 'valor-de-producao';

    const value = await resolveSecret('AZURE_CLIENT_SECRET', 'AZURE_CLIENT_SECRET_ID');

    expect(value).toBe('valor-de-producao');
    expect(mockAccessSecretVersion).not.toHaveBeenCalled();
  });

  test('busca no Secret Manager quando a env var alvo está ausente', async () => {
    process.env.AZURE_CLIENT_SECRET_ID = 'azure-client-secret-dev';
    process.env.GCP_PROJECT_ID = 'agentspace-469418';
    mockAccessSecretVersion.mockResolvedValue([
      { payload: { data: Buffer.from('valor-secreto') } },
    ]);

    const value = await resolveSecret('AZURE_CLIENT_SECRET', 'AZURE_CLIENT_SECRET_ID');

    expect(value).toBe('valor-secreto');
    expect(process.env.AZURE_CLIENT_SECRET).toBe('valor-secreto');
    expect(mockAccessSecretVersion).toHaveBeenCalledWith({
      name: 'projects/agentspace-469418/secrets/azure-client-secret-dev/versions/latest',
    });
  });

  test('lança erro claro quando nem a env var nem o ID do secret estão configurados', async () => {
    await expect(
      resolveSecret('AZURE_CLIENT_SECRET', 'AZURE_CLIENT_SECRET_ID'),
    ).rejects.toThrow(/AZURE_CLIENT_SECRET_ID/);
  });

  test('lança erro claro quando a busca no Secret Manager falha', async () => {
    process.env.AZURE_CLIENT_SECRET_ID = 'azure-client-secret-dev';
    process.env.GCP_PROJECT_ID = 'agentspace-469418';
    mockAccessSecretVersion.mockRejectedValue(new Error('PERMISSION_DENIED'));

    await expect(
      resolveSecret('AZURE_CLIENT_SECRET', 'AZURE_CLIENT_SECRET_ID'),
    ).rejects.toThrow(/Falha ao buscar o secret/);
  });
});
```

- [x] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && npx jest secretManager -v`
Expected: FAIL — `Cannot find module './secretManager'`

- [x] **Step 3: Implementar `secretManager.js`**

Crie `backend/src/services/secretManager.js`:

```js
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

let client;
function getClient() {
  if (!client) {
    client = new SecretManagerServiceClient();
  }
  return client;
}

// Resolve um segredo real com uma regra única, sem branch por ambiente:
// se `envVar` já vier setada em process.env, usa direto — esse é o caminho
// de produção, onde o Cloud Run já injetou o valor via `--update-secrets`,
// sem nenhuma chamada ao Secret Manager feita por este código (ver
// docs/adr/0007-adc-e-secret-manager-para-credenciais.md). Se vier ausente
// — dev local, onde não existe Cloud Run injetando nada — busca a versão
// mais recente do secret no Secret Manager via ADC (a mesma usada por
// gcpAuth.js), no ID indicado por `secretIdEnvVar`, e grava o valor de
// volta em process.env[envVar] — o resto do código (msalClient.js,
// sessionToken.js) continua lendo process.env sem saber de onde veio.
async function resolveSecret(envVar, secretIdEnvVar) {
  if (process.env[envVar]) {
    return process.env[envVar];
  }

  const secretId = process.env[secretIdEnvVar];
  if (!secretId) {
    throw new Error(
      `${envVar} não está definido e ${secretIdEnvVar} também não — configure um `
      + `dos dois em backend/.env (ver README, seção "Segredos no Secret Manager").`,
    );
  }

  const projectId = process.env.GCP_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      'GCP_PROJECT_ID não está definido — necessário para montar o resource name do secret.',
    );
  }

  const name = `projects/${projectId}/secrets/${secretId}/versions/latest`;

  let version;
  try {
    [version] = await getClient().accessSecretVersion({ name });
  } catch (err) {
    throw new Error(
      `Falha ao buscar o secret "${secretId}" (${name}) no Secret Manager: ${err.message}. `
      + 'Confirme que o secret existe e que a ADC ativa '
      + '(gcloud auth application-default login --impersonate-service-account=...) '
      + 'tem roles/secretmanager.secretAccessor nele.',
    );
  }

  const value = version.payload.data.toString('utf8');
  process.env[envVar] = value;
  return value;
}

// Resolve os dois segredos reais da aplicação — chamada uma vez, no boot
// (backend/src/index.js), antes de app.listen().
async function resolveAppSecrets() {
  await resolveSecret('AZURE_CLIENT_SECRET', 'AZURE_CLIENT_SECRET_ID');
  await resolveSecret('SESSION_JWT_SECRET', 'SESSION_JWT_SECRET_ID');
}

module.exports = { resolveSecret, resolveAppSecrets };
```

- [x] **Step 4: Rodar e confirmar que passa**

Run: `cd backend && npx jest secretManager -v`
Expected: PASS (4 testes)

- [x] **Step 5: Commit**

```bash
git add backend/src/services/secretManager.js backend/src/services/secretManager.test.js
git commit -m "feat(backend): adiciona secretManager com fallback condicional para o Secret Manager"
```

---

### Task 3: `gcpAuth.js` — remove a chave estática

**Files:**
- Modify: `backend/src/services/gcpAuth.js`

- [x] **Step 1: Editar**

`backend/src/services/gcpAuth.js` fica:

```js
const { GoogleAuth } = require('google-auth-library');

// Sem `keyFile`: a credencial vem sempre da cadeia padrão de Application
// Default Credentials — metadata server no Cloud Run (SA anexada
// diretamente ao serviço) em produção, ADC impersonada da mesma SA
// (`gcloud auth application-default login --impersonate-service-account=...`)
// em dev local. Nenhum caminho de fallback para chave estática existe mais
// — ver docs/adr/0007-adc-e-secret-manager-para-credenciais.md.
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

async function getAccessToken() {
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token;
}

module.exports = { auth, getAccessToken };
```

- [x] **Step 2: Rodar a suíte inteira do backend para confirmar que nada quebrou**

Run: `cd backend && npm test`
Expected: PASS (nenhuma suíte usa `GOOGLE_APPLICATION_CREDENTIALS`/`keyFile` diretamente — todas mockam os serviços do GCP).

- [x] **Step 3: Commit**

```bash
git add backend/src/services/gcpAuth.js
git commit -m "feat(backend): remove chave estatica de gcpAuth.js, usa ADC"
```

---

### Task 4: `index.js` — bootstrap assíncrono, falha rápido

**Files:**
- Modify: `backend/src/index.js`

- [x] **Step 1: Editar**

`backend/src/index.js` fica:

```js
require('dotenv').config();
const { resolveAppSecrets } = require('./services/secretManager');

async function main() {
  try {
    await resolveAppSecrets();
  } catch (err) {
    // Falha rápido: sem os dois segredos resolvidos, /auth/login nunca
    // funcionaria — melhor não subir do que subir "quebrado" (ver
    // docs/adr/0007-adc-e-secret-manager-para-credenciais.md).
    console.error('Falha ao resolver segredos no boot:', err.message);
    process.exit(1);
  }

  // Só exige app.js (e, por consequência, msalClient.js/sessionToken.js)
  // depois dos segredos resolvidos.
  // eslint-disable-next-line global-require
  const app = require('./app');
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
  });
}

main();
```

- [x] **Step 2: Testar manualmente que o boot falha sem os segredos**

Run (dentro de `backend/`, sem `AZURE_CLIENT_SECRET_ID`/`SESSION_JWT_SECRET_ID` válidos no `.env`): `node src/index.js`
Expected: processo imprime `Falha ao resolver segredos no boot: ...` e sai (não fica escutando porta nenhuma).

- [x] **Step 3: Testar manualmente que o boot sobe com os segredos configurados**

Com `backend/.env` apontando para os IDs reais dos secrets `-dev` e a ADC impersonada ativa: `node src/index.js`
Expected: `Backend running on http://localhost:3001`.

- [x] **Step 4: Rodar a suíte inteira do backend**

Run: `cd backend && npm test`
Expected: PASS — as suítes de rotas importam `app.js` diretamente, não `index.js`, então não passam pelo bootstrap.

- [x] **Step 5: Commit**

```bash
git add backend/src/index.js
git commit -m "feat(backend): index.js resolve segredos no boot antes de subir o servidor"
```

---

### Task 5: `docker-compose.yml` — ADC no lugar de `credentials.json`

**Files:**
- Modify: `docker-compose.yml`

- [x] **Step 1: Editar o serviço `backend`**

Em `docker-compose.yml`, troque:

```yaml
    environment:
      # Overrides the path from backend/.env to point at the read-only
      # secret mounted below instead of baking the key into the image.
      - GOOGLE_APPLICATION_CREDENTIALS=/secrets/credentials.json
      # Overrides the Vite dev server URL from backend/.env — under Compose
      # the frontend is the nginx container on 8080, not localhost:5173.
      - FRONTEND_BASE_URL=http://localhost:8080
    volumes:
      - ./backend/credentials.json:/secrets/credentials.json:ro
```

por:

```yaml
    environment:
      # Overrides the path from backend/.env to point at the read-only ADC
      # file mounted below — the container has no metadata server, so it
      # still needs an explicit credentials file: the host's ADC, generated
      # by `gcloud auth application-default login
      # --impersonate-service-account=...` (see README, seção Pré-requisitos).
      - GOOGLE_APPLICATION_CREDENTIALS=/secrets/adc.json
      # Overrides the Vite dev server URL from backend/.env — under Compose
      # the frontend is the nginx container on 8080, not localhost:5173.
      - FRONTEND_BASE_URL=http://localhost:8080
    volumes:
      - ${HOME}/.config/gcloud/application_default_credentials.json:/secrets/adc.json:ro
```

- [x] **Step 2: Validar o compose file**

Run: `docker compose config --quiet`
Expected: sem erro (valida sintaxe/interpolação de `${HOME}`).

- [x] **Step 3: Smoke test manual**

Com a ADC impersonada já configurada no host (Task/Pré-requisito do README) e `backend/.env` completo:

Run: `docker compose up --build -d && curl -s http://localhost:3001/api/health`
Expected: `{"status":"ok"}`. Depois: `docker compose down`.

- [x] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(docker): monta ADC do host no lugar de credentials.json"
```

---

### Task 6: Verificação final

- [x] **Step 1: Suíte completa do backend**

Run: `cd backend && npm test`
Expected: PASS, todas as suítes.

- [x] **Step 2: Lint (se configurado)**

Run: `cd backend && npm run lint 2>/dev/null || echo "sem script de lint"`

- [x] **Step 3: Conferir que nenhuma referência a `credentials.json`/`keyFile` sobrou no código**

Run: `grep -rn "credentials.json\|keyFile" backend/src docker-compose.yml`
Expected: nenhum resultado.

- [x] **Step 4: Commit final (se sobrou algo solto)**

```bash
git status --short
```
