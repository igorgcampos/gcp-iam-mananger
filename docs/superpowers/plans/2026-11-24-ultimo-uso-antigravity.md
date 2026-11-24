# Último uso Antigravity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar na tela Gemini Enterprise quando cada usuário usou o Antigravity (IDE ou extensão do VS Code) pela última vez, ao lado do "Último acesso" (Gemini Enterprise/Agentspace), e permitir medir inatividade por qualquer um dos dois.

**Architecture:** Um sink do Cloud Logging (já criado, `ai-dev-tools-bq` no `agentspace-469418`) grava os logs `businessaicode.googleapis.com/*` no dataset `infra-bi-355620.ai_dev_tools_logs`. O backend faz um GROUP BY por e-mail nesse dataset (job no `GCP_PROJECT_ID`, como o billing), guarda 1h em memória e expõe `GET /api/antigravity/usage`. O frontend busca depois da lista de licenças, junta por e-mail e mostra "—" se a busca falhar, no mesmo padrão da Diretoria.

**Tech Stack:** Node/Express + googleapis BigQuery v2 (Jest); React 18 + antd 5 (Vitest).

**Spec:** decisões D1–D9 aprovadas na conversa de 24/11/2026 (resumo em Global Constraints).

## Global Constraints

- Nome da coluna: **"Último uso Antigravity"**. Fica logo depois de "Último acesso", que não muda de valor.
- As duas colunas ganham um ícone `InfoCircleOutlined` com tooltip:
  - Último acesso: "Última vez que o usuário usou o Gemini Enterprise (Agentspace)."
  - Último uso Antigravity: "Última vez que o usuário usou o Antigravity (IDE ou extensão do VS Code). Conta só o uso no projeto agentspace-469418 com a conta corporativa. Dados a partir de 24/11/2026."
- Quem não tem uso registrado mostra **"Sem uso desde 24/11/2026"** (nunca "Nunca"). A data vem do backend (`since`).
- Falha na busca mostra **"—"** na coluna e o resto da tela carrega normal, sem notificação de erro.
- IDE e extensão não são distinguíveis (`client_name` é `antigravity_hub` nos dois): não tentar separar.
- Tooltip de cada célula com uso: `N dia(s) com uso desde 24/11/2026`.
- Cache no backend: 1h. Dataset padrão `infra-bi-355620.ai_dev_tools_logs`, sobrescrevível por `ANTIGRAVITY_LOGS_DATASET`. Início do rastreamento: `2026-11-24`.
- Fora do escopo: tokens, modelo, distinção IDE/extensão.
- Commits em pt-BR, sem linha de Co-Authored-By.

## Review Focus

1. `labels.user_id` com maiúsculas ou sem o prefixo `user:`: precisa casar com `userPrincipal` da licença (normalizar lower + remover prefixo).
2. Tabela de logs ainda inexistente (ex.: dataset novo, `Not found`): a rota deve devolver 502/erro e o frontend mostrar "—", não quebrar a tela.
3. Usuário atribuído **depois** de 24/11 sem uso: no relatório de inatividade (modo Antigravity) a referência é a data de atribuição, não 24/11.
4. Ordenação da coluna com mistura de usuários com uso, sem uso e dado indisponível (`null`): sem exceção, sem uso no fim.
5. Polling: a lista do Gemini muda de array a cada 3 min; o uso do Antigravity não deve ser rebuscado a cada tick (intervalo próprio, 1h).

---

### Task 1: Backend — serviço e rota de uso do Antigravity

**Files:**
- Create: `backend/src/services/antigravityService.js`, `backend/src/services/antigravityService.test.js`
- Create: `backend/src/routes/antigravity.js`, `backend/src/routes/antigravity.test.js`
- Modify: `backend/src/app.js` (montar `app.use('/api/antigravity', requireAuth, antigravityRoutes)`)

**Interfaces:**
- Produces: `GET /api/antigravity/usage` → `{ since: '2026-11-24', usage: { [email]: { lastUse: ISOString, activeDays: number } } }`
- Produces (service): `getAntigravityUsage(): Promise<{ since, usage }>`, `buildUsageQuery(dataset: string): string`, `parseUsageRows(data): usage`, `_resetCache()`, constantes `ANTIGRAVITY_CACHE_TTL_MS = 3600000`, `TRACKING_SINCE = '2026-11-24'`, `DEFAULT_DATASET = 'infra-bi-355620.ai_dev_tools_logs'`.

- [ ] **Step 1: testes do serviço (falhando)**, mockando `./gcpClients` (`bigquery.jobs.query`) como nos testes do billing:
  - `buildUsageQuery` lê de `` `infra-bi-355620.ai_dev_tools_logs.businessaicode_googleapis_com_*` ``, normaliza com `REGEXP_REPLACE(LOWER(labels.user_id), r'^user:', '')`, usa `MAX(timestamp)` e `COUNT(DISTINCT DATE(timestamp, 'America/Sao_Paulo'))`, filtra `timestamp >= TIMESTAMP('2026-11-24')`.
  - `ANTIGRAVITY_LOGS_DATASET=x.y` muda o FROM para `` `x.y.businessaicode_googleapis_com_*` ``.
  - `parseUsageRows` converte `{ v: '1.795549196544E9' }` (segundos em notação científica, formato do jobs.query; testar também `'1795549196.544'`) em `lastUse: '2026-11-24T19:39:56.544Z'` e `activeDays` em número; `rows` ausente → `{}`.
  - `getAntigravityUsage` chama `jobs.query` com `projectId: process.env.GCP_PROJECT_ID`, `useLegacySql: false`, `location: 'US'`; segunda chamada dentro de 1h não consulta de novo; depois de 1h consulta; erro do BigQuery propaga e não é cacheado.
- [ ] **Step 2:** `cd backend && npx jest src/services/antigravityService.test.js` → FAIL (módulo não existe).
- [ ] **Step 3:** implementar o serviço (cache `{ data, fetchedAt }` no formato do billingService).
- [ ] **Step 4: testes da rota** (supertest, padrão de `routes/billing.test.js`): 200 com o corpo do serviço; erro do serviço → resposta de erro do middleware (não 200).
- [ ] **Step 5:** implementar rota + montar em `app.js`; `npx jest` inteiro → PASS.
- [ ] **Step 6: Commit** `feat(antigravity): rota de último uso do Antigravity lida do BigQuery`

### Task 2: Frontend — dados e coluna na tela Gemini

**Files:**
- Create: `frontend/src/api/antigravity.js` (`getAntigravityUsage()` → `r.data`)
- Create: `frontend/src/hooks/useAntigravityData.js` (+ `.test.jsx`)
- Create: `frontend/src/utils/antigravity.js` (+ `.test.js`)
- Create: `frontend/src/utils/antigravityColumn.jsx` (+ `.test.jsx`)
- Create: `frontend/src/components/ColumnTitleWithInfo.jsx`
- Modify: `frontend/src/config.js` (`ANTIGRAVITY_POLL_INTERVAL_MS = 60 * 60 * 1000`)
- Modify: `frontend/src/App.jsx` (hook + prop `antigravity` para GeminiPage)
- Modify: `frontend/src/pages/GeminiPage.jsx` (título com info em "Último acesso" + nova coluna)

**Interfaces:**
- Consumes: Task 1 response.
- Produces: `useAntigravityData({ enabled }) → { antigravity: { since, usage } | null }` (usePollingFetch com intervalo de 1h; `onError` só `console.warn` e zera para `null`).
- Produces: `getAntigravityUse(email, antigravity) → { lastUse, activeDays } | null | undefined` (`undefined` = dado indisponível; `null` = sem uso); `antigravityText(email, antigravity) → string` (`'24/11/2026'` | `'Sem uso desde 24/11/2026'` | `'—'`); `formatSince(since) → '24/11/2026'` (formatar a string `YYYY-MM-DD` sem passar por `new Date`, para não voltar um dia em UTC-3).
- Produces: `buildAntigravityColumn(antigravity) → antd column` com `title: <ColumnTitleWithInfo title="Último uso Antigravity" info={...} />`, render (data pt-BR com Tooltip "N dias com uso desde …", `Text type="secondary"` "Sem uso desde …", ou "—"), `sorter` por `lastUse` (sem uso/indisponível = 0) e `filters` "Usou" / "Sem uso" (só quando `antigravity` não é null).
- Produces: `ColumnTitleWithInfo({ title, info })` → `<Space size={4}>{title}<Tooltip title={info}><InfoCircleOutlined style={{ color: '#94a3b8' }} /></Tooltip></Space>`; exportar também as duas strings `GEMINI_LAST_ACCESS_INFO` e `ANTIGRAVITY_LAST_USE_INFO` (texto de Global Constraints) de `utils/antigravity.js`.

- [ ] **Step 1: testes de `utils/antigravity`** (falhando): e-mail com maiúsculas casa; `antigravity` null → `'—'`; sem entrada → `'Sem uso desde 24/11/2026'`; com uso → data pt-BR; `formatSince('2026-11-24') === '24/11/2026'` com `TZ` qualquer.
- [ ] **Step 2: testes da coluna** (render numa `Table` antd): célula mostra data e "Sem uso desde 24/11/2026"; hover no ícone do título mostra o texto do Antigravity; filtro "Sem uso" deixa só quem não usou; sorter não lança com mistura null/undefined.
- [ ] **Step 3: teste do hook**: chama a API uma vez ao habilitar; erro → `antigravity === null` sem lançar. (Mock de `usePollingFetch` não é necessário; usar o real sem fake timers — ver memória sobre fake timers neste repo.)
- [ ] **Step 4:** rodar `cd frontend && npx vitest run src/utils/antigravity src/utils/antigravityColumn src/hooks/useAntigravityData` → FAIL.
- [ ] **Step 5:** implementar; ligar em `App.jsx` e `GeminiPage.jsx` (coluna logo após "Último acesso"; "Último acesso" ganha `ColumnTitleWithInfo` com `GEMINI_LAST_ACCESS_INFO`).
- [ ] **Step 6:** `npx vitest run` inteiro → PASS.
- [ ] **Step 7: Commit** `feat(antigravity): coluna Último uso Antigravity na tela Gemini`

### Task 3: Relatórios — Copiar Relatório e Relatório de Inatividade

**Files:**
- Modify: `frontend/src/utils/usersReport.js` (+ teste): header `'Último uso Antigravity'` após `'Último acesso'`, célula `antigravityText(...)`; assinatura `buildUsersReportClipboard(report, configs, diretorias = null, antigravity = null)`.
- Modify: `frontend/src/components/CopyUsersReportButton.jsx`: prop `antigravity = null` repassada.
- Modify: `frontend/src/utils/inactivity.js` (+ teste):
  - `INACTIVITY_SOURCES = { GEMINI: 'gemini', ANTIGRAVITY: 'antigravity' }`.
  - `getReferenceDate(user, source = 'gemini', antigravity = null)`: gemini = comportamento atual; antigravity = `lastUse` se houver, senão o maior entre `createTime` e `since`; `antigravity` null no modo antigravity → `null` (usuário fica fora do relatório).
  - `isInactiveUser` / `buildInactivityReport(users, thresholdMonths, now, { source, antigravity } = {})` repassam.
  - `buildInactivityReportClipboard(report, configs, diretorias, antigravity)`: coluna `'Último uso Antigravity'` após `'Último acesso'`.
- Modify: `frontend/src/components/InactivityReportModal.jsx` (+ teste): prop `antigravity = null`; `Segmented` "Gemini Enterprise" / "Antigravity" ao lado do seletor de meses (padrão Gemini); coluna Último uso Antigravity via `buildAntigravityColumn`; no modo Antigravity com `antigravity` null, `Alert` "Dados de uso do Antigravity indisponíveis no momento" e tabela vazia.
- Modify: `frontend/src/pages/GeminiPage.jsx`: repassar `antigravity` para os dois componentes.

- [ ] **Step 1: testes falhando** em `inactivity.test.js`:
  - modo antigravity: uso há 3 meses entra com limite 2; uso ontem não entra;
  - sem uso, atribuído antes de 24/11 → referência 24/11; atribuído depois → referência = atribuição;
  - `antigravity` null no modo antigravity → relatório vazio;
  - modo padrão continua igual (testes existentes sem mudança).
- [ ] **Step 2:** testes falhando em `usersReport.test.js` e no `InactivityReportModal.test.jsx` (trocar para Antigravity muda as linhas; header copiado inclui "Último uso Antigravity").
- [ ] **Step 3:** rodar → FAIL; implementar; `npx vitest run` → PASS.
- [ ] **Step 4: Commit** `feat(antigravity): Último uso Antigravity nos relatórios e inatividade por Antigravity`

### Task 4: Documentação

**Files:**
- Create: `docs/adr/0015-uso-do-antigravity-via-sink-no-bigquery.md` — por que sink para BigQuery no `infra-bi-355620` (e não consulta direta ao Cloud Logging, que só guarda 30 dias e é lenta para agregar); sem backfill (dados desde 24/11/2026); permissões no nível do dataset; IDE e extensão indistinguíveis.
- Modify: `CONTEXT.md` — termos **Último uso Antigravity** e ajuste em **Data de Referência** (vale por ferramenta: Gemini Enterprise ou Antigravity).
- Modify: `README.md` — seção curta "Último uso Antigravity": sink, dataset, permissões (Data Editor para o writer do sink, Data Viewer para a SA da app), `ANTIGRAVITY_LOGS_DATASET` opcional.
- Modify: `backend/.env.example` — `ANTIGRAVITY_LOGS_DATASET` comentado, com o padrão.

- [ ] **Step 1:** escrever os docs; `cd backend && npx jest && cd ../frontend && npx vitest run` → tudo PASS.
- [ ] **Step 2: Commit** `docs(antigravity): ADR 0015, glossário e README do Último uso Antigravity`
