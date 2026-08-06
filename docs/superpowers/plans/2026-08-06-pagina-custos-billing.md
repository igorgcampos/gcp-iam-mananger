# Página de Custos (Billing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma página "Custos" ao painel que mostra, para o projeto `agentspace-469418`, o gasto do mês corrente até hoje dividido em três buckets que sempre somam o total: **Gemini** (licenças/Vertex AI Search), **Infra** (Cloud Run e demais serviços que rodam a própria aplicação) e **Não categorizado**.

**Architecture:** Backend consulta diretamente a tabela crua do BigQuery Billing Export (`infra-bi-355620.billing_standard.gcp_billing_export_v1_01779C_55AF20_FD92F6`) via o cliente `bigquery` v2 já disponível no pacote `googleapis` (mesmo padrão de `gcpClients.js` — nenhuma dependência nova). Um novo `billingService.js` roda a query, agrupa por `service.description` contra duas listas explícitas mantidas no código, e cacheia o resultado em memória por algumas horas (o export do GCP só atualiza 1x/dia — polling agressivo não faz sentido e tem custo). Uma rota única (`GET /api/billing/summary`) expõe isso atrás do mesmo `requireAuth` do resto do painel. Frontend segue exatamente o padrão de `useGeminiData`/`DashboardPage`: um hook (`useBillingData`), uma página nova (`BillingPage.jsx`) com `StatCard`s, e um novo item de menu em `App.jsx`.

**Tech Stack:** Node/Express + Jest/Supertest (backend), React + Ant Design + Vitest (frontend). Nenhuma dependência nova — `googleapis` já expõe `google.bigquery('v2')`.

**Context docs already written (do not re-derive these decisions):** `CONTEXT.md` (seção "Billing (custos GCP)") e `docs/adr/0006-billing-export-como-fonte-de-custos.md`. Não reabra essas decisões (fonte de dados, escopo, categorização, permissões) — implemente-as.

**Pré-requisito já feito pelo usuário (fora do código):** a Service Account da aplicação já recebeu `roles/bigquery.jobUser` em `agentspace-469418` e `roles/bigquery.dataViewer` no dataset `billing_standard` do projeto `infra-bi-355620`.

---

## File Structure

- Modify: `backend/src/services/gcpClients.js` — adiciona o cliente `bigquery`.
- Modify: `backend/.env.example` — adiciona `BILLING_EXPORT_TABLE`.
- Create: `backend/scripts/list-billing-services.js` — script manual (não faz parte da rota) para descobrir/auditar quais `service.description` aparecem no projeto — usado para fechar as listas de categorização e, depois, sempre que "Não categorizado" crescer.
- Modify: `backend/package.json` — adiciona o script `billing:services`.
- Create: `backend/src/services/billingService.js` — query, categorização, cache.
- Create: `backend/src/services/billingService.test.js`
- Create: `backend/src/routes/billing.js`
- Create: `backend/src/routes/billing.test.js`
- Modify: `backend/src/app.js` — registra `/api/billing`.
- Create: `frontend/src/api/billing.js`
- Create: `frontend/src/utils/billingFormatting.js` — formatação de moeda.
- Create: `frontend/src/utils/billingFormatting.test.js`
- Modify: `frontend/src/config.js` — adiciona `BILLING_POLL_INTERVAL_MS`.
- Create: `frontend/src/hooks/useBillingData.js`
- Create: `frontend/src/pages/BillingPage.jsx`
- Modify: `frontend/src/App.jsx` — item de menu "Custos", `PAGE_TITLES`, hook, bloco de página.

---

### Task 1: Cliente BigQuery em `gcpClients.js`

**Files:**
- Modify: `backend/src/services/gcpClients.js`
- Modify: `backend/.env.example`

- [ ] **Step 1: Adicionar o cliente `bigquery`**

`backend/src/services/gcpClients.js` fica:

```js
const { google } = require('googleapis');
const { auth } = require('./gcpAuth');

const crm = google.cloudresourcemanager({ version: 'v1', auth });
const iam = google.iam({ version: 'v1', auth });
const bigquery = google.bigquery({ version: 'v2', auth });

module.exports = {
  crm, iam, bigquery,
};
```

- [ ] **Step 2: Documentar a tabela do export em `.env.example`**

Em `backend/.env.example`, logo abaixo de `GCP_PROJECT_ID=agentspace-469418`, adicionar:

```
# Tabela do BigQuery Billing Export ("Standard usage cost", já habilitado na
# Billing Account "Projetos Editora Globo") usada pela página de Custos.
# Formato: projeto.dataset.tabela — ver docs/adr/0006-billing-export-como-fonte-de-custos.md.
BILLING_EXPORT_TABLE=infra-bi-355620.billing_standard.gcp_billing_export_v1_01779C_55AF20_FD92F6
```

Copiar a mesma linha para o `backend/.env` local (não versionado) para poder rodar o Task 2.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/gcpClients.js backend/.env.example
git commit -m "feat(billing): adiciona cliente BigQuery e BILLING_EXPORT_TABLE"
```

---

### Task 2: Descobrir os serviços reais em uso (passo manual)

Este task **não pode ser automatizado** por um agente sem credenciais reais do GCP — precisa ser rodado por alguém com `GOOGLE_APPLICATION_CREDENTIALS` apontando para a SA já autorizada (mesmo requisito do resto do README).

**Files:**
- Create: `backend/scripts/list-billing-services.js`
- Modify: `backend/package.json`

- [ ] **Step 1: Criar o script de descoberta**

```js
// backend/scripts/list-billing-services.js
//
// Lista, com custo agregado, todo `service.description` que apareceu no
// projeto GCP_PROJECT_ID no mês corrente, segundo o BigQuery Billing Export.
// Rodar sempre que "Não categorizado" (ver CONTEXT.md) aparecer com um valor
// inesperado, para decidir se o serviço novo entra em GEMINI_SERVICES ou
// INFRA_SERVICES em backend/src/services/billingService.js.
require('dotenv').config();
const { bigquery } = require('../src/services/gcpClients');

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const TABLE = process.env.BILLING_EXPORT_TABLE;

async function main() {
  const query = `
    SELECT service.description AS service, ROUND(SUM(cost), 2) AS cost
    FROM \`${TABLE}\`
    WHERE project.id = @projectId
      AND usage_start_time >= TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MONTH)
    GROUP BY service
    ORDER BY cost DESC
  `;

  const res = await bigquery.jobs.query({
    projectId: PROJECT_ID,
    requestBody: {
      query,
      useLegacySql: false,
      parameterMode: 'NAMED',
      queryParameters: [
        { name: 'projectId', parameterType: { type: 'STRING' }, parameterValue: { value: PROJECT_ID } },
      ],
    },
  });

  const fields = (res.data.schema?.fields || []).map((f) => f.name);
  const rows = (res.data.rows || []).map(
    (row) => Object.fromEntries(row.f.map((cell, i) => [fields[i], cell.v]))
  );

  console.table(rows);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Registrar o script no `package.json`**

Em `backend/package.json`, dentro de `"scripts"`:

```json
"billing:services": "node scripts/list-billing-services.js"
```

- [ ] **Step 3: Rodar e reportar o resultado**

```bash
cd backend && npm run billing:services
```

Copie a tabela impressa (`service` × `cost`) de volta para esta sessão. **Pare aqui e aguarde essa lista antes de seguir para o Task 3** — ela decide o conteúdo final de `GEMINI_SERVICES`/`INFRA_SERVICES`. Ponto de partida já validado na sabatina: `Gemini → ["Vertex AI Search"]`, `Infra → ["Cloud Run", "Artifact Registry", "Cloud Logging", "BigQuery"]`; ajuste conforme o que a query realmente devolver (ex.: se aparecer `"Networking"` ou `"Cloud Storage"` com valor não-trivial atribuível à app, discuta com o usuário se entra em Infra ou fica em Não Categorizado de propósito).

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/list-billing-services.js backend/package.json
git commit -m "feat(billing): script de descoberta de serviços do billing export"
```

---

### Task 3: `categorizeCosts` — categorização pura (TDD)

**Files:**
- Create: `backend/src/services/billingService.js`
- Create: `backend/src/services/billingService.test.js`

- [ ] **Step 1: Escrever os testes de `categorizeCosts` primeiro**

```js
// backend/src/services/billingService.test.js
const { categorizeCosts } = require('./billingService');

describe('categorizeCosts', () => {
  test('soma Gemini, Infra e Não categorizado, e eles fecham com o total', () => {
    const rows = [
      { service: 'Vertex AI Search', cost: 1696.14, currency: 'BRL' },
      { service: 'Cloud Run', cost: 42.5, currency: 'BRL' },
      { service: 'Artifact Registry', cost: 3.2, currency: 'BRL' },
      { service: 'Cloud Storage', cost: 7.1, currency: 'BRL' }, // não está em nenhuma lista
    ];

    const result = categorizeCosts(rows);

    expect(result.gemini).toBe(1696.14);
    expect(result.infra).toBe(45.7);
    expect(result.uncategorized).toBe(7.1);
    expect(result.total).toBeCloseTo(1749.94, 2);
    expect(result.total).toBeCloseTo(result.gemini + result.infra + result.uncategorized, 2);
  });

  test('usa a moeda da primeira linha', () => {
    const result = categorizeCosts([{ service: 'Cloud Run', cost: 10, currency: 'USD' }]);
    expect(result.currency).toBe('USD');
  });

  test('retorna zeros e moeda padrão BRL para lista vazia', () => {
    const result = categorizeCosts([]);
    expect(result).toEqual({
      gemini: 0, infra: 0, uncategorized: 0, total: 0, currency: 'BRL',
    });
  });

  test('arredonda para 2 casas decimais mesmo com soma de ponto flutuante imprecisa', () => {
    const rows = [
      { service: 'Vertex AI Search', cost: 0.1, currency: 'BRL' },
      { service: 'Vertex AI Search', cost: 0.2, currency: 'BRL' },
    ];
    expect(categorizeCosts(rows).gemini).toBe(0.3);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha (módulo ainda não existe)**

Run: `cd backend && npx jest billingService -v`
Expected: FAIL — `Cannot find module './billingService'`

- [ ] **Step 3: Implementar `categorizeCosts`**

```js
// backend/src/services/billingService.js

// Listas de service.description (schema do BigQuery Billing Export) que
// compõem cada categoria — editar aqui quando a aplicação passar a usar (ou
// parar de usar) um serviço GCP. Ver Task 2 (backend/scripts/list-billing-services.js)
// para descobrir os nomes reais em uso. Qualquer serviço fora das duas listas
// cai em "uncategorized" — de propósito, ver CONTEXT.md ("Não Categorizado").
const GEMINI_SERVICES = ['Vertex AI Search'];
const INFRA_SERVICES = ['Cloud Run', 'Artifact Registry', 'Cloud Logging', 'BigQuery'];

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function categorizeCosts(rows) {
  let gemini = 0;
  let infra = 0;
  let uncategorized = 0;
  let currency = null;

  rows.forEach((row) => {
    currency = currency || row.currency;
    if (GEMINI_SERVICES.includes(row.service)) {
      gemini += row.cost;
    } else if (INFRA_SERVICES.includes(row.service)) {
      infra += row.cost;
    } else {
      uncategorized += row.cost;
    }
  });

  return {
    gemini: round2(gemini),
    infra: round2(infra),
    uncategorized: round2(uncategorized),
    total: round2(gemini + infra + uncategorized),
    currency: currency || 'BRL',
  };
}

module.exports = { categorizeCosts, GEMINI_SERVICES, INFRA_SERVICES };
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd backend && npx jest billingService -v`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/billingService.js backend/src/services/billingService.test.js
git commit -m "feat(billing): categorizeCosts com listas explícitas de serviço"
```

---

### Task 4: `getBillingSummary` — query BigQuery + cache em memória (TDD)

**Files:**
- Modify: `backend/src/services/billingService.js`
- Modify: `backend/src/services/billingService.test.js`

- [ ] **Step 1: Escrever os testes primeiro**

Adicionar ao topo de `billingService.test.js` (acima do `describe('categorizeCosts', ...)`), e trocar o `require` direto por `jest.resetModules()` por teste, seguindo o mesmo padrão de `backend/src/services/sessionToken.test.js`:

```js
const OLD_ENV = process.env;

jest.mock('./gcpClients', () => ({
  bigquery: { jobs: { query: jest.fn() } },
}));

function mockQueryResult(rows) {
  return {
    data: {
      schema: { fields: [{ name: 'service' }, { name: 'cost' }, { name: 'currency' }] },
      rows: rows.map(({ service, cost, currency }) => ({
        f: [{ v: service }, { v: String(cost) }, { v: currency }],
      })),
    },
  };
}

describe('getBillingSummary', () => {
  let getBillingSummary;
  let queryMock;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    process.env = { ...OLD_ENV, GCP_PROJECT_ID: 'agentspace-469418', BILLING_EXPORT_TABLE: 'proj.ds.tbl' };
    // eslint-disable-next-line global-require
    ({ bigquery: { jobs: { query: queryMock } } } = require('./gcpClients'));
    // eslint-disable-next-line global-require
    ({ getBillingSummary } = require('./billingService'));
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env = OLD_ENV;
  });

  test('consulta o BigQuery filtrando pelo projeto e devolve o resumo categorizado', async () => {
    queryMock.mockResolvedValue(mockQueryResult([
      { service: 'Vertex AI Search', cost: 100, currency: 'BRL' },
      { service: 'Cloud Run', cost: 10, currency: 'BRL' },
    ]));

    const summary = await getBillingSummary();

    expect(summary).toMatchObject({ gemini: 100, infra: 10, uncategorized: 0, total: 110, currency: 'BRL' });
    expect(summary.updatedAt).toBeDefined();
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [call] = queryMock.mock.calls[0];
    expect(call.projectId).toBe('agentspace-469418');
    expect(call.requestBody.queryParameters[0].parameterValue.value).toBe('agentspace-469418');
  });

  test('usa o cache em chamadas subsequentes dentro do TTL', async () => {
    queryMock.mockResolvedValue(mockQueryResult([{ service: 'Cloud Run', cost: 1, currency: 'BRL' }]));

    await getBillingSummary();
    await getBillingSummary();

    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  test('refaz a query depois que o TTL do cache expira', async () => {
    queryMock.mockResolvedValue(mockQueryResult([{ service: 'Cloud Run', cost: 1, currency: 'BRL' }]));

    await getBillingSummary();
    jest.advanceTimersByTime(5 * 60 * 60 * 1000); // 5h > TTL de 4h
    await getBillingSummary();

    expect(queryMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && npx jest billingService -v`
Expected: FAIL — `getBillingSummary is not a function` (ou `undefined`)

- [ ] **Step 3: Implementar a query e o cache**

Adicionar em `billingService.js`, acima de `module.exports`:

```js
const { bigquery } = require('./gcpClients');

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4h — export do GCP só atualiza 1x/dia (ver ADR 0006)
let cache = { data: null, fetchedAt: 0 };

function parseRows(data) {
  if (!data.rows) return [];
  const fields = data.schema.fields.map((f) => f.name);
  return data.rows.map((row) => {
    const obj = {};
    row.f.forEach((cell, i) => { obj[fields[i]] = cell.v; });
    return { service: obj.service, cost: parseFloat(obj.cost) || 0, currency: obj.currency };
  });
}

async function queryCostByService() {
  const projectId = process.env.GCP_PROJECT_ID;
  const table = process.env.BILLING_EXPORT_TABLE;

  const query = `
    SELECT
      service.description AS service,
      SUM(cost) + IFNULL(SUM((SELECT SUM(c.amount) FROM UNNEST(credits) AS c)), 0) AS cost,
      ANY_VALUE(currency) AS currency
    FROM \`${table}\`
    WHERE project.id = @projectId
      AND usage_start_time >= TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MONTH)
    GROUP BY service
  `;

  const res = await bigquery.jobs.query({
    projectId,
    requestBody: {
      query,
      useLegacySql: false,
      parameterMode: 'NAMED',
      queryParameters: [
        { name: 'projectId', parameterType: { type: 'STRING' }, parameterValue: { value: projectId } },
      ],
    },
  });

  return parseRows(res.data);
}

async function getBillingSummary() {
  const isFresh = cache.data && (Date.now() - cache.fetchedAt) < CACHE_TTL_MS;
  if (isFresh) return cache.data;

  const rows = await queryCostByService();
  const summary = { ...categorizeCosts(rows), updatedAt: new Date().toISOString() };
  cache = { data: summary, fetchedAt: Date.now() };
  return summary;
}
```

Trocar o `module.exports` final para:

```js
module.exports = {
  categorizeCosts, getBillingSummary, GEMINI_SERVICES, INFRA_SERVICES,
};
```

> Nota sobre a query: `cost` no schema do export é bruto; a subquery `UNNEST(credits)` soma os descontos/créditos (valores já negativos no schema) para chegar no custo líquido — o mesmo número que aparece na coluna "Usage cost" do Console. Valide isso no Task 10 comparando com o relatório do Console antes de confiar no valor em produção.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd backend && npx jest billingService -v`
Expected: PASS (7 testes no total)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/billingService.js backend/src/services/billingService.test.js
git commit -m "feat(billing): getBillingSummary com query no BigQuery e cache de 4h"
```

---

### Task 5: Rota `GET /api/billing/summary`

**Files:**
- Create: `backend/src/routes/billing.js`
- Create: `backend/src/routes/billing.test.js`
- Modify: `backend/src/app.js`

- [ ] **Step 1: Escrever o teste da rota primeiro**

```js
// backend/src/routes/billing.test.js
jest.mock('../middleware/requireAuth', () => (req, res, next) => {
  req.operator = { email: 'operador.teste@edglobo.com.br', name: 'Operador Teste', oid: 'oid-teste' };
  next();
});

jest.mock('../services/billingService', () => ({
  getBillingSummary: jest.fn(),
}));

// As mesmas rotas já existentes precisam continuar "carregáveis" pelo app.js
// completo — reaproveita os mocks já usados por gemini.test.js/iam.test.js
// para as dependências delas.
jest.mock('../services/geminiService', () => ({
  listLicenseConfigs: jest.fn(), listUserLicenses: jest.fn(), assignLicense: jest.fn(), removeLicense: jest.fn(),
}));
jest.mock('../services/iamService', () => ({
  listUsers: jest.fn(), addUser: jest.fn(), removeUser: jest.fn(), addCodeAssistUser: jest.fn(), removeCodeAssistUser: jest.fn(),
}));
jest.mock('../services/gcpAuth', () => ({ auth: {}, getAccessToken: jest.fn() }));
jest.mock('googleapis', () => ({
  google: { cloudresourcemanager: jest.fn().mockReturnValue({ projects: {} }), bigquery: jest.fn().mockReturnValue({ jobs: {} }) },
}));

const request = require('supertest');
const app = require('../app');
const { getBillingSummary } = require('../services/billingService');

describe('GET /api/billing/summary', () => {
  test('retorna o resumo com status 200', async () => {
    const summary = {
      gemini: 100, infra: 10, uncategorized: 0, total: 110, currency: 'BRL', updatedAt: '2026-08-06T12:00:00.000Z',
    };
    getBillingSummary.mockResolvedValue(summary);

    const res = await request(app).get('/api/billing/summary');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(summary);
  });

  test('retorna 500 quando o serviço falha', async () => {
    getBillingSummary.mockRejectedValue(new Error('BigQuery indisponível'));
    const res = await request(app).get('/api/billing/summary');
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && npx jest routes/billing -v`
Expected: FAIL — `Cannot find module '../routes/billing'` (via `app.js`, que ainda não a registra) ou erro de rota 404

- [ ] **Step 3: Criar a rota**

```js
// backend/src/routes/billing.js
const { Router } = require('express');
const { getBillingSummary } = require('../services/billingService');
const asyncRoute = require('../middleware/asyncRoute');

const router = Router();

router.get('/summary', asyncRoute(async (req, res) => {
  res.json(await getBillingSummary());
}));

module.exports = router;
```

- [ ] **Step 4: Registrar em `app.js`**

Em `backend/src/app.js`:

```js
const billingRoutes = require('./routes/billing');
```

(logo abaixo de `const geminiRoutes = require('./routes/gemini');`), e:

```js
app.use('/api/billing', requireAuth, billingRoutes);
```

(logo abaixo de `app.use('/api/gemini', requireAuth, geminiRoutes);`).

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `cd backend && npx jest routes/billing -v`
Expected: PASS (2 testes)

- [ ] **Step 6: Rodar a suíte inteira do backend pra garantir que nada quebrou**

Run: `cd backend && npm test`
Expected: PASS em todos os arquivos

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/billing.js backend/src/routes/billing.test.js backend/src/app.js
git commit -m "feat(billing): expõe GET /api/billing/summary"
```

---

### Task 6: Frontend — API client e formatação de moeda (TDD)

**Files:**
- Create: `frontend/src/api/billing.js`
- Create: `frontend/src/utils/billingFormatting.js`
- Create: `frontend/src/utils/billingFormatting.test.js`

- [ ] **Step 1: Criar o client de API (sem teste próprio — mesmo padrão de `api/gemini.js`, que também não tem teste dedicado)**

```js
// frontend/src/api/billing.js
import axios from 'axios';

export const getBillingSummary = () => axios.get('/api/billing/summary').then((r) => r.data);
```

- [ ] **Step 2: Escrever os testes de formatação primeiro**

```js
// frontend/src/utils/billingFormatting.test.js
import { describe, expect, it } from 'vitest';
import { formatCurrency } from './billingFormatting';

describe('formatCurrency', () => {
  it('formata em BRL por padrão', () => {
    expect(formatCurrency(1234.5)).toMatch(/R\$\s?1\.234,50/);
  });

  it('formata zero', () => {
    expect(formatCurrency(0)).toMatch(/R\$\s?0,00/);
  });

  it('usa zero quando o valor é undefined/null', () => {
    expect(formatCurrency(undefined)).toMatch(/R\$\s?0,00/);
    expect(formatCurrency(null)).toMatch(/R\$\s?0,00/);
  });

  it('respeita uma moeda diferente', () => {
    expect(formatCurrency(10, 'USD')).toMatch(/US\$\s?10,00/);
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `cd frontend && npx vitest run billingFormatting`
Expected: FAIL — `Cannot find module './billingFormatting'`

- [ ] **Step 4: Implementar**

```js
// frontend/src/utils/billingFormatting.js

// Formata um valor monetário no padrão pt-BR, na moeda vinda do backend (a
// mesma moeda configurada na Billing Account — hoje sempre BRL).
export function formatCurrency(value, currency = 'BRL') {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value ?? 0);
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `cd frontend && npx vitest run billingFormatting`
Expected: PASS (4 testes)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/billing.js frontend/src/utils/billingFormatting.js frontend/src/utils/billingFormatting.test.js
git commit -m "feat(billing): api client e formatCurrency no frontend"
```

---

### Task 7: Hook `useBillingData`

**Files:**
- Modify: `frontend/src/config.js`
- Create: `frontend/src/hooks/useBillingData.js`

- [ ] **Step 1: Adicionar o intervalo de polling em `config.js`**

```js
// Intervalo de atualização automática dos dados de Custos — bem mais longo
// que o dos outros hooks porque o BigQuery Billing Export só é atualizado
// 1x/dia pelo próprio GCP (ver docs/adr/0006-billing-export-como-fonte-de-custos.md);
// ficar checando de poucos em poucos minutos geraria consultas sem nenhum
// dado novo pra mostrar.
export const BILLING_POLL_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 horas
```

- [ ] **Step 2: Criar o hook, espelhando `useGeminiData.js`**

```js
// frontend/src/hooks/useBillingData.js
import { useState } from 'react';
import { getBillingSummary } from '../api/billing';
import { notifyFetchError } from '../utils/apiError';
import { BILLING_POLL_INTERVAL_MS } from '../config';
import { usePollingFetch } from './usePollingFetch';

export function useBillingData({ enabled = true } = {}) {
  const [summary, setSummary] = useState(null);

  const { loading, lastUpdated, reload } = usePollingFetch(
    async () => {
      setSummary(await getBillingSummary());
    },
    { onError: notifyFetchError, interval: BILLING_POLL_INTERVAL_MS, enabled }
  );

  return {
    summary, loading, lastUpdated, reload,
  };
}
```

Sem teste dedicado — `usePollingFetch` já tem cobertura própria (`usePollingFetch.test.jsx`) e `useGeminiData`/`useIamData` seguem o mesmo padrão sem teste próprio.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/config.js frontend/src/hooks/useBillingData.js
git commit -m "feat(billing): useBillingData com polling de 4h"
```

---

### Task 8: Página `BillingPage.jsx`

**Files:**
- Create: `frontend/src/pages/BillingPage.jsx`

- [ ] **Step 1: Implementar a página**

```jsx
// frontend/src/pages/BillingPage.jsx
import React from 'react';
import {
  Card, Statistic, Typography, Space, Button, Spin, Empty,
} from 'antd';
import {
  WalletOutlined, RobotOutlined, CloudServerOutlined, QuestionCircleOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { formatCurrency } from '../utils/billingFormatting';

const { Title, Text } = Typography;

function StatCard({
  icon, iconBg, iconColor, label, value, hint,
}) {
  return (
    <Card size="small" bordered className="stat-card" style={{ borderRadius: 16 }}>
      <Space align="center" size={12}>
        <div
          style={{
            width: 40, height: 40, borderRadius: 12, display: 'flex',
            alignItems: 'center', justifyContent: 'center', background: iconBg, color: iconColor, fontSize: 18,
          }}
        >
          {icon}
        </div>
        <Text strong type="secondary" style={{ fontSize: 13 }}>{label}</Text>
      </Space>
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <Statistic value={value} valueStyle={{ fontSize: 28, fontWeight: 800, color: '#192645' }} />
        {hint && <Text style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8' }}>{hint}</Text>}
      </div>
    </Card>
  );
}

export default function BillingPage({
  summary, loading, lastUpdated, reload,
}) {
  const currency = summary?.currency || 'BRL';

  return (
    <div style={{ padding: 24 }}>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Space style={{ justifyContent: 'space-between', width: '100%' }} align="start" wrap>
          <Space direction="vertical" size={0}>
            <Space>
              <WalletOutlined style={{ fontSize: 20, color: '#192645' }} />
              <Title level={4} style={{ margin: 0 }}>Custos</Title>
            </Space>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Gasto do projeto agentspace-469418 no mês corrente, via BigQuery Billing Export.
            </Text>
          </Space>
          <Space wrap>
            {lastUpdated && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Atualizado: {lastUpdated.toLocaleTimeString('pt-BR')}
              </Text>
            )}
            <Button icon={<ReloadOutlined />} onClick={() => reload()} loading={loading}>
              Atualizar
            </Button>
          </Space>
        </Space>

        <Spin spinning={loading}>
          {summary ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <StatCard
                icon={<WalletOutlined />}
                iconBg="#eff6ff"
                iconColor="#2563eb"
                label="Total do projeto"
                value={formatCurrency(summary.total, currency)}
                hint="Mês corrente"
              />
              <StatCard
                icon={<RobotOutlined />}
                iconBg="#f5f3ff"
                iconColor="#7c3aed"
                label="Gemini"
                value={formatCurrency(summary.gemini, currency)}
                hint="Vertex AI Search / licenças"
              />
              <StatCard
                icon={<CloudServerOutlined />}
                iconBg="#eef2ff"
                iconColor="#4f46e5"
                label="Infra"
                value={formatCurrency(summary.infra, currency)}
                hint="Cloud Run e afins"
              />
              <StatCard
                icon={<QuestionCircleOutlined />}
                iconBg="#f8fafc"
                iconColor="#64748b"
                label="Não categorizado"
                value={formatCurrency(summary.uncategorized, currency)}
                hint="Fora das listas conhecidas"
              />
            </div>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nenhum dado de custo carregado ainda" />
          )}
        </Spin>
      </Space>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/BillingPage.jsx
git commit -m "feat(billing): página Custos com os 4 StatCards"
```

---

### Task 9: Ligar tudo em `App.jsx`

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Import e hook**

Adicionar aos imports do topo:

```js
import BillingPage from './pages/BillingPage';
import { useBillingData } from './hooks/useBillingData';
```

E, junto das outras chamadas de hook (`const iam = ...`, `const gemini = ...`):

```js
const billing = useBillingData({ enabled: authState === 'authenticated' });
```

- [ ] **Step 2: Ícone e item de menu**

Adicionar `WalletOutlined` ao import de `@ant-design/icons` (junto com `DashboardOutlined`, etc.), e um novo item no array `items` do `Menu`, depois de `gemini`:

```js
{
  key: 'custos',
  icon: <WalletOutlined />,
  label: 'Custos',
},
```

- [ ] **Step 3: Título da página**

Em `PAGE_TITLES`:

```js
custos: 'Custos',
```

- [ ] **Step 4: Bloco de página**

Depois do `<div style={{ display: selected === 'gemini' ? 'block' : 'none' }}>...</div>`, adicionar:

```jsx
<div style={{ display: selected === 'custos' ? 'block' : 'none' }}>
  <BillingPage
    summary={billing.summary}
    loading={billing.loading}
    lastUpdated={billing.lastUpdated}
    reload={billing.reload}
  />
</div>
```

- [ ] **Step 5: Rodar a suíte do frontend pra garantir que nada quebrou**

Run: `cd frontend && npm test`
Expected: PASS em todos os arquivos

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(billing): adiciona item de menu Custos ao App"
```

---

### Task 10: Validação manual e documentação (passo manual)

Não automatizável por um agente sem acesso real ao GCP/Console — precisa do usuário.

- [ ] **Step 1: Rodar a aplicação localmente**

```bash
docker-compose up --build
```

(ou `npm run dev` nas duas pastas, conforme o README) com `backend/.env` já contendo `BILLING_EXPORT_TABLE` (Task 1) e `GOOGLE_APPLICATION_CREDENTIALS` apontando pra SA já autorizada.

- [ ] **Step 2: Abrir a aba Custos e comparar com o Console**

Abrir o painel, clicar em "Custos", e comparar o valor de "Total do projeto" com o relatório do Console (Billing → Reports, filtrado por `Projects = agentspace-469418`, `Time range = This month`) para o mesmo período. Se os números não baterem, o problema mais provável é o tratamento de `credits` na query do Task 4 (a query resta os créditos para chegar no custo líquido — revisitar se o Console usa outra convenção) — ajuste e re-rode antes de considerar a feature pronta.

- [ ] **Step 3: Atualizar o README**

Em `README.md`, na seção de Pré-requisitos (perto de onde já lista os `roles/...` da SA), documentar as duas roles novas do Task 4 (`roles/bigquery.jobUser` em `agentspace-469418`, `roles/bigquery.dataViewer` no dataset `billing_standard` de `infra-bi-355620`) e a env var `BILLING_EXPORT_TABLE`, do mesmo jeito que as roles existentes já são documentadas.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: documenta permissões e env var da página de Custos"
```
