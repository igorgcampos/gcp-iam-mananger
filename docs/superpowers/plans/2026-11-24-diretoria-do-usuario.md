# Diretoria do Usuário Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir a Diretoria de cada Usuário (lida do `extensionAttribute4` do Entra ID) na tela Gemini Enterprise — coluna com filtro, card "Licenças por Diretoria" e coluna no relatório copiado — sem banco de dados.

**Architecture:** Backend ganha `POST /api/diretoria/lookup`, que recebe e-mails e consulta o Microsoft Graph em `$batch` de 20, reaproveitando `getGraphAppToken()` (token de aplicação do SSO), com cache em memória por e-mail (TTL 6h). Frontend busca as Diretorias num hook próprio, instanciado em `App.jsx` a partir de `gemini.users`, *depois* da lista de licenças — a tabela nunca espera o Graph. Agrupamento (normalização de grafia, "Sem Diretoria", percentuais) é função pura em `frontend/src/utils/diretoria.js`.

**Tech Stack:** Node/Express + Jest + supertest (backend), React 18 + antd + Vitest/Testing Library (frontend), Microsoft Graph v1.0 via axios.

**Spec:** Decisões fechadas em sessão de grilling (sem doc de spec separado) — terminologia em [`CONTEXT.md`](../../../CONTEXT.md) (termos **Diretoria**, **Sem Diretoria**, **Rateio por Diretoria**) e decisão de fonte em [ADR 0014](../../adr/0014-diretoria-lida-do-entra-id.md).

## Global Constraints

- Fonte única: `onPremisesExtensionAttributes.extensionAttribute4` do Graph (`GET /users/{email}?$select=mail,onPremisesExtensionAttributes`). Nunca `department` nem `companyName` (são códigos numéricos).
- Somente leitura: nenhum endpoint de escrita, nenhum banco, nenhuma tabela de equivalência de nomes.
- Permissão Graph necessária: `User.Read.All` (Application) — **já concedida** no App Registration `c4bb0f49-bfab-4919-871c-d654c4f55c33` em 24/11/2026.
- Lote do Graph: `POST https://graph.microsoft.com/v1.0/$batch`, no máximo **20** requests por lote.
- Cache backend: em memória, por e-mail normalizado, TTL **6 horas** (`DIRETORIA_CACHE_TTL_MS = 6 * 60 * 60 * 1000`).
- E-mail sempre comparado em minúsculas (`trim().toLowerCase()`) — Gemini e Entra divergem em capitalização (ex.: `Adriana.Domingues@valor.com.br`).
- Três estados por Usuário, nunca confundidos: `string` (Diretoria), `null` (**Sem Diretoria** — atributo vazio ou usuário não encontrado no Entra), ausente/`undefined` (desconhecido — Graph falhou ou ainda carregando; exibido como `—`).
- Agrupamento: mesma Diretoria quando a chave normalizada (trim, sem acentos, maiúsculas, espaços colapsados) é igual; rótulo exibido = grafia mais frequente (empate: a primeira em `localeCompare`). Nomes diferentes (`AUDIÊNCIA ASSINATURAS` × `AUDIÊNCIA`) **nunca** são unificados.
- Card e percentuais contam só licenças `licenseAssignmentState === 'ASSIGNED'`. "Sem Diretoria" sempre aparece (por último) quando tiver ≥1 usuário — nunca escondido.
- Textos de UI: coluna "Diretoria"; card "Licenças por Diretoria"; rótulo `Sem Diretoria`; desconhecido `—`.
- Nomes no código usam "diretoria" (nunca "department"/"area"), consistente com `CONTEXT.md`.
- Nenhuma lib de gráfico nova — usar `Progress` do antd.
- Testes com fake timers no frontend: nunca `vi.useFakeTimers()` puro em `beforeEach` (trava no Node 18 deste repo) — passar `toFake` explícito.

## Review Focus

1. **E-mail com maiúsculas vindo do Gemini** (`Adriana.Domingues@valor.com.br`): a Diretoria deve aparecer normalmente — mapa sempre indexado em minúsculas, nos dois lados. Testado nas Tasks 1, 3 e 6.
2. **Falha parcial do `$batch`** (um item volta 429/500, os outros 200): os 200 são devolvidos e cacheados; o item falho fica **ausente** (vira `—`, não "Sem Diretoria") e **não** é cacheado. 404 vira `null`. Testado na Task 1.
3. **Graph inteiro fora do ar**: tabela de licenças funciona, coluna mostra `—`, card de Diretoria não aparece (não pode mostrar 100% "Sem Diretoria"). Testado nas Tasks 3 e 4.
4. **Polling de 3 min do `useGeminiData`** gera array novo a cada tick: o hook de Diretoria **não** pode refazer a chamada se o conjunto de e-mails não mudou. Testado na Task 4.
5. **`extensionAttribute4` só com espaços ou string vazia**: tratado como `null` (Sem Diretoria), nunca como uma Diretoria em branco. Testado na Task 1.
6. **Graph volta depois de uma falha** (lookup inteiro rejeitado, ou e-mails ausentes por 429): a coluna se recupera sozinha no próximo tick do polling do Gemini ou no botão "Atualizar", sem F5. Testado na Task 4.

---

## File Structure

**Backend — criar:**
- `backend/src/services/diretoriaService.js` — `getDiretorias(emails)`, cache, chamadas `$batch`.
- `backend/src/services/diretoriaService.test.js`
- `backend/src/routes/diretoria.js` — `POST /lookup`.
- `backend/src/routes/diretoria.test.js`

**Backend — modificar:**
- `backend/src/app.js` — `app.use('/api/diretoria', requireAuth, diretoriaRoutes)`.
- `docs/sso-pedidos-time-ad.md` — seção 3 passa a listar `User.Read.All` e o motivo.

**Frontend — criar:**
- `frontend/src/utils/diretoria.js` — normalização, rótulo por usuário, estatísticas, opções de filtro.
- `frontend/src/utils/diretoria.test.js`
- `frontend/src/api/diretoria.js` — `lookupDiretorias(emails)` (sem teste próprio, mesmo padrão de `api/gemini.js`).
- `frontend/src/hooks/useDiretoriaData.js`
- `frontend/src/hooks/useDiretoriaData.test.jsx`
- `frontend/src/components/DiretoriaStatsCard.jsx`
- `frontend/src/components/DiretoriaStatsCard.test.jsx`

**Frontend — modificar:**
- `frontend/src/App.jsx` — instanciar `useDiretoriaData(gemini.users, { enabled })` e passar `diretorias` para `GeminiPage`.
- `frontend/src/pages/GeminiPage.jsx` — coluna "Diretoria" + filtro, card, repassar `diretorias` ao botão de copiar.
- `frontend/src/utils/usersReport.js` + `.test.js` — coluna "Diretoria".
- `frontend/src/components/CopyUsersReportButton.jsx` + `.test.jsx` — prop `diretorias`.

---

### Task 1: Serviço backend de Diretoria (Graph `$batch` + cache)

**Files:**
- Create: `backend/src/services/diretoriaService.js`
- Test: `backend/src/services/diretoriaService.test.js`
- Modify: `docs/sso-pedidos-time-ad.md` (seção 3)

**Interfaces:**
- Consumes: `getGraphAppToken(): Promise<string>` de `backend/src/services/graphGroupCheck.js`.
- Produces: `getDiretorias(emails: string[]): Promise<Record<string, string | null>>` — chaves em minúsculas; e-mail com falha transitória fica **ausente** do objeto. `_resetCache(): void` (só para testes). Constantes `DIRETORIA_CACHE_TTL_MS`, `GRAPH_BATCH_SIZE = 20`.

- [ ] **Step 0: Branch e commit dos docs de decisão**

```bash
git checkout -b feature/diretoria-do-usuario
git add CONTEXT.md docs/adr/0014-diretoria-lida-do-entra-id.md docs/superpowers/plans/2026-11-24-diretoria-do-usuario.md
git commit -m "docs: Diretoria do Usuário lida do Entra ID (ADR 0014, glossário, plano)"
```

- [ ] **Step 1: Escrever os testes que falham**

Mock: `jest.mock('axios', () => ({ post: jest.fn() }))` e `jest.mock('./graphGroupCheck', () => ({ getGraphAppToken: jest.fn().mockResolvedValue('tok') }))`; `beforeEach(() => _resetCache())`. Helper que monta a resposta do `$batch`: `{ data: { responses: [{ id, status, body }] } }`.

```js
test('devolve extensionAttribute4 indexado pelo e-mail em minúsculas', async () => {
  axios.post.mockResolvedValue(batch([{ id: '0', status: 200, body: { onPremisesExtensionAttributes: { extensionAttribute4: 'ESTRATÉGIA DIGITAL' } } }]));
  await expect(getDiretorias(['ACottet@EdGlobo.com.br'])).resolves.toEqual({ 'acottet@edglobo.com.br': 'ESTRATÉGIA DIGITAL' });
  expect(axios.post).toHaveBeenCalledWith(
    'https://graph.microsoft.com/v1.0/$batch',
    { requests: [{ id: '0', method: 'GET', url: '/users/acottet%40edglobo.com.br?$select=mail,onPremisesExtensionAttributes' }] },
    { headers: { Authorization: 'Bearer tok' } },
  );
});
test('atributo vazio, só espaços ou ausente vira null', ...);            // '', '   ', onPremisesExtensionAttributes: null → null
test('404 do Graph vira null (Sem Diretoria)', ...);
test('429/500 num item deixa o e-mail ausente e não cacheia', ...);       // 2ª chamada com o mesmo e-mail volta a chamar o Graph
test('quebra em lotes de 20', ...);                                       // 45 e-mails → 3 chamadas a axios.post (20, 20, 5)
test('deduplica e-mails antes de consultar', ...);                        // ['a@x.com', 'A@x.com'] → 1 request
test('usa o cache dentro do TTL e reconsulta depois', ...);               // jest.useFakeTimers({ now: 0 }) + jest.setSystemTime(DIRETORIA_CACHE_TTL_MS + 1) → 2ª consulta
test('lista vazia não chama o Graph', ...);                               // resolves {} e axios.post não chamado
test('falha do $batch inteiro propaga o erro', ...);                      // axios.post rejeita → getDiretorias rejeita
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx jest src/services/diretoriaService.test.js`
Expected: FAIL — `Cannot find module './diretoriaService'`.

- [ ] **Step 3: Implementar `getDiretorias(emails)` em `backend/src/services/diretoriaService.js`**

Cache: `Map<email, { value: string|null, expiresAt: number }>` no módulo, lido com `Date.now()`. Normaliza e deduplica, separa hits de misses, consulta misses em lotes de 20 (lotes em sequência, não em paralelo — evita 429 do Graph). Status 200 → `extensionAttribute4?.trim() || null`; 404 → `null`; outros → ausente sem cachear. Só cacheia entradas resolvidas (string ou null). Comentário no topo apontando a ADR 0014.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npx jest src/services/diretoriaService.test.js`
Expected: PASS (9 testes).

- [ ] **Step 5: Atualizar `docs/sso-pedidos-time-ad.md` seção 3**

Passar de "Duas permissões" para três, adicionando `User.Read.All` com uma linha de motivo: leitura do `extensionAttribute4` (Diretoria, ver ADR 0014) — `User.ReadBasic.All` não expõe `onPremisesExtensionAttributes` e o Graph devolve `null` silenciosamente sem ela.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/diretoriaService.js backend/src/services/diretoriaService.test.js docs/sso-pedidos-time-ad.md
git commit -m "feat(diretoria): serviço que lê extensionAttribute4 do Graph em lote com cache"
```

---

### Task 2: Rota `POST /api/diretoria/lookup`

**Files:**
- Create: `backend/src/routes/diretoria.js`
- Test: `backend/src/routes/diretoria.test.js`
- Modify: `backend/src/app.js`

**Interfaces:**
- Consumes: `getDiretorias` (Task 1); `asyncRoute`, `requireAuth`.
- Produces: `POST /api/diretoria/lookup`, body `{ emails: string[] }` → `200 { diretorias: Record<string, string|null> }`. `400 { error }` se `emails` não for array de strings ou tiver mais de **1000** itens. Erro do Graph → handler global (status do Graph ou 500).

- [ ] **Step 1: Escrever os testes que falham**

Mesmo cabeçalho de mocks de `backend/src/routes/gemini.test.js` (requireAuth, geminiService, iamService, billingService, gcpAuth, googleapis) + `jest.mock('../services/diretoriaService', () => ({ getDiretorias: jest.fn() }))`.

```js
test('200 com o mapa do serviço', async () => {
  getDiretorias.mockResolvedValue({ 'a@b.com': 'TECNOLOGIA', 'c@d.com': null });
  const res = await request(app).post('/api/diretoria/lookup').send({ emails: ['a@b.com', 'c@d.com'] });
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ diretorias: { 'a@b.com': 'TECNOLOGIA', 'c@d.com': null } });
  expect(getDiretorias).toHaveBeenCalledWith(['a@b.com', 'c@d.com']);
});
test('400 sem emails', ...);                    // body {}
test('400 com item não-string', ...);           // { emails: ['a@b.com', 42] }
test('400 com mais de 1000 e-mails', ...);
test('502 quando o Graph falha', ...);          // getDiretorias rejeita com { response: { status: 502 } } → res.status 502
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx jest src/routes/diretoria.test.js`
Expected: FAIL — 404 nas requisições (rota não registrada).

- [ ] **Step 3: Implementar a rota e registrar em `app.js`**

`router.post('/lookup', asyncRoute(...))`. Sem `logAudit` — é leitura, e o log de auditoria só cobre ações mutáveis (ver `auditLog.js`). Em `app.js`: `app.use('/api/diretoria', requireAuth, diretoriaRoutes);` junto das outras rotas `/api`.

- [ ] **Step 4: Rodar a suíte backend inteira**

Run: `cd backend && npm test`
Expected: PASS, sem regressão.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/diretoria.js backend/src/routes/diretoria.test.js backend/src/app.js
git commit -m "feat(diretoria): endpoint POST /api/diretoria/lookup"
```

---

### Task 3: Utilitários de agrupamento no frontend

**Files:**
- Create: `frontend/src/utils/diretoria.js`
- Test: `frontend/src/utils/diretoria.test.js`

**Interfaces:**
- Produces:
  - `SEM_DIRETORIA = 'Sem Diretoria'`; `SEM_DIRETORIA_KEY = '__SEM_DIRETORIA__'`
  - `diretoriaKey(value: string): string` — trim, `normalize('NFD')` sem diacríticos, maiúsculas, espaços colapsados.
  - `getDiretoria(email: string, diretorias: Record<string, string|null> | null): string | null | undefined` — lookup em minúsculas; `undefined` se `diretorias` for `null` ou o e-mail não estiver no mapa.
  - `userDiretoriaKey(email, diretorias): string | undefined` — `SEM_DIRETORIA_KEY` para `null`, `diretoriaKey(v)` para string, `undefined` para desconhecido.
  - `buildDiretoriaStats(users, diretorias): Array<{ key, label, count, percent }>` — só `ASSIGNED` com Diretoria conhecida (string ou null); ordenado por `count` desc, empate por `label`; Sem Diretoria sempre por último; `percent` inteiro arredondado sobre o total contado; `[]` se `diretorias` for `null` ou nada for conhecido.
  - `buildDiretoriaFilters(users, diretorias): Array<{ text, value }>` — mesmos grupos de `buildDiretoriaStats` mas sobre **todos** os usuários (qualquer status), `value` = chave; ordem alfabética, Sem Diretoria por último.

- [ ] **Step 1: Escrever os testes que falham**

```js
it('diretoriaKey ignora acento, caixa e espaços', () => {
  expect(diretoriaKey(' Estrategia  Digital ')).toBe(diretoriaKey('ESTRATÉGIA DIGITAL'));
  expect(diretoriaKey('AUDIÊNCIA ASSINATURAS')).not.toBe(diretoriaKey('AUDIÊNCIA'));
});
it('getDiretoria busca em minúsculas e distingue null de desconhecido', () => {
  const m = { 'adriana.domingues@valor.com.br': 'DESENVOLVIMENTO COMERCIAL', 'x.rpa@edglobo.com.br': null };
  expect(getDiretoria('Adriana.Domingues@valor.com.br', m)).toBe('DESENVOLVIMENTO COMERCIAL');
  expect(getDiretoria('x.rpa@edglobo.com.br', m)).toBeNull();
  expect(getDiretoria('outro@edglobo.com.br', m)).toBeUndefined();
  expect(getDiretoria('a@b.com', null)).toBeUndefined();
});
it('buildDiretoriaStats agrupa grafias, usa a mais frequente como rótulo e põe Sem Diretoria por último', () => {
  // 2× 'AUDIÊNCIA', 1× 'Audiencia', 1× 'AUDIÊNCIA ASSINATURAS', 2× null, 1× NO_LICENSE_ATTEMPTED_LOGIN com 'TECNOLOGIA'
  expect(buildDiretoriaStats(users, m)).toEqual([
    { key: 'AUDIENCIA', label: 'AUDIÊNCIA', count: 3, percent: 50 },
    { key: 'AUDIENCIA ASSINATURAS', label: 'AUDIÊNCIA ASSINATURAS', count: 1, percent: 17 },
    { key: SEM_DIRETORIA_KEY, label: SEM_DIRETORIA, count: 2, percent: 33 },
  ]);
});
it('buildDiretoriaStats devolve [] quando o lookup falhou (diretorias null)', ...);
it('buildDiretoriaStats ignora usuários desconhecidos (fora do mapa) no total', ...);
it('buildDiretoriaFilters inclui usuários de qualquer status, em ordem alfabética', ...);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/utils/diretoria.test.js`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `frontend/src/utils/diretoria.js`**

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx vitest run src/utils/diretoria.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/diretoria.js frontend/src/utils/diretoria.test.js
git commit -m "feat(diretoria): agrupamento por Diretoria com normalização de grafia"
```

---

### Task 4: Cliente de API + hook `useDiretoriaData` + ligação em `App.jsx`

**Files:**
- Create: `frontend/src/api/diretoria.js`, `frontend/src/hooks/useDiretoriaData.js`
- Test: `frontend/src/hooks/useDiretoriaData.test.jsx`
- Modify: `frontend/src/App.jsx:166` (instanciar) e `:391` (prop do `GeminiPage`)

**Interfaces:**
- Produces:
  - `lookupDiretorias(emails: string[]): Promise<Record<string, string|null>>` — `axios.post('/api/diretoria/lookup', { emails }).then(r => r.data.diretorias)`.
  - `useDiretoriaData(users, { enabled = true, refreshToken } = {}): { diretorias: Record<string, string|null> | null, loading: boolean }` — `diretorias` é `null` até o primeiro sucesso e **volta a ser `null` se a chamada falhar** (o Graph fora do ar não pode virar "Sem Diretoria"). Falha **não** dispara `notifyFetchError` (a coluna degrada para `—` em silêncio; um `console.warn` basta). `refreshToken` recebe `gemini.lastUpdated`: quando ele muda, o hook refaz a chamada **somente se** a última tentativa falhou ou voltou sem algum e-mail pedido (resultado incompleto); com resultado completo, mudança de `refreshToken` não chama nada.
  - `GeminiPage` recebe a nova prop `diretorias`.

- [ ] **Step 1: Escrever os testes que falham**

`vi.mock('../api/diretoria')`; `renderHook` do Testing Library.

```js
it('busca com os e-mails em minúsculas, deduplicados e ordenados', async () => {
  lookupDiretorias.mockResolvedValue({ 'a@x.com': 'TI' });
  const { result } = renderHook(() => useDiretoriaData([{ userPrincipal: 'B@x.com' }, { userPrincipal: 'a@x.com' }, { userPrincipal: 'b@x.com' }]));
  await waitFor(() => expect(result.current.diretorias).toEqual({ 'a@x.com': 'TI' }));
  expect(lookupDiretorias).toHaveBeenCalledWith(['a@x.com', 'b@x.com']);
});
it('não refaz a chamada quando chega um array novo com os mesmos e-mails (polling)', ...);  // rerender com cópia do array → 1 chamada
it('refaz a chamada quando entra um e-mail novo', ...);
it('diretorias fica null quando a chamada falha', ...);
it('não chama nada com enabled=false ou lista vazia', ...);
it('depois de uma falha, refaz a chamada quando refreshToken muda com os mesmos e-mails', ...);   // 1ª rejeita → rerender com refreshToken novo → 2 chamadas
it('com resultado incompleto (e-mail ausente no mapa), refaz quando refreshToken muda', ...);
it('com resultado completo, refreshToken novo não refaz a chamada', ...);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/hooks/useDiretoriaData.test.jsx`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar api, hook e ligação**

O efeito depende de uma string estável (`emails.join(',')` dos e-mails normalizados e ordenados), não do array `users`, mais `refreshToken` só enquanto o resultado estiver incompleto (ex.: incluir `incomplete ? refreshToken : null` na chave do efeito). Ignorar respostas de chamadas obsoletas (flag `cancelled` no cleanup do efeito). Em `App.jsx`: `const diretoria = useDiretoriaData(gemini.users, { enabled: authState === 'authenticated', refreshToken: gemini.lastUpdated });` e `<GeminiPage ... diretorias={diretoria.diretorias} />`.

- [ ] **Step 4: Rodar a suíte frontend**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/diretoria.js frontend/src/hooks/useDiretoriaData.js frontend/src/hooks/useDiretoriaData.test.jsx frontend/src/App.jsx
git commit -m "feat(diretoria): hook que busca Diretorias depois da lista de licenças"
```

---

### Task 5: Coluna, filtro e card na tela Gemini Enterprise

**Files:**
- Create: `frontend/src/components/DiretoriaStatsCard.jsx`
- Test: `frontend/src/components/DiretoriaStatsCard.test.jsx`
- Modify: `frontend/src/pages/GeminiPage.jsx`

**Interfaces:**
- Consumes: `getDiretoria`, `userDiretoriaKey`, `buildDiretoriaStats`, `buildDiretoriaFilters`, `SEM_DIRETORIA` (Task 3); prop `diretorias` (Task 4).
- Produces: `DiretoriaStatsCard({ stats: Array<{key,label,count,percent}> })` — retorna `null` se `stats` vazio.

- [ ] **Step 1: Escrever os testes que falham do card**

```js
it('mostra título, uma linha por Diretoria com contagem e percentual', () => {
  render(<DiretoriaStatsCard stats={[{ key: 'TI', label: 'TECNOLOGIA', count: 9, percent: 10 }, { key: '__SEM_DIRETORIA__', label: 'Sem Diretoria', count: 6, percent: 6 }]} />);
  expect(screen.getByText('Licenças por Diretoria')).toBeInTheDocument();
  expect(screen.getByText('TECNOLOGIA')).toBeInTheDocument();
  expect(screen.getByText('9 (10%)')).toBeInTheDocument();
  expect(screen.getByText('Sem Diretoria')).toBeInTheDocument();
});
it('não renderiza nada com stats vazio', ...);   // container vazio
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/components/DiretoriaStatsCard.test.jsx`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar o card e integrar no `GeminiPage`**

Card: antd `Card` (`className="stat-card"`, `borderRadius: 16`, igual aos cards de camada), título "Licenças por Diretoria", uma linha por item: rótulo, texto `${count} (${percent}%)` e `Progress` com `percent` e `showInfo={false}`; "Sem Diretoria" em texto secundário.

`GeminiPage`:
- nova prop `diretorias = null`;
- coluna **"Diretoria"** logo após "Email": render `string` → texto; `null` → `<Tag>Sem Diretoria</Tag>`; `undefined` → `—`. `filters: buildDiretoriaFilters(users, diretorias)`, `onFilter: (value, r) => userDiretoriaKey(r.userPrincipal, diretorias) === value`, `sorter` por `getDiretoria(...) ?? ''` com `localeCompare`;
- `diretoriaStats = useMemo(() => buildDiretoriaStats(users, diretorias), [users, diretorias])` no topo do componente, junto de `configStats`; `<DiretoriaStatsCard stats={diretoriaStats} />` entre a linha de cards de camada e o `Divider`, centralizado (`Row justify="center"`, `Col md={CARD_SPAN * 2}`);
- repassar `diretorias` ao `CopyUsersReportButton` (prop criada na Task 6 — até lá, prop extra ignorada).

- [ ] **Step 4: Rodar a suíte e conferir no app**

Run: `cd frontend && npm test` → PASS. Depois subir backend + frontend (`make` ou `npm run dev` em cada um) e conferir na tela Gemini Enterprise: coluna preenchida (`acottet@edglobo.com.br` → `ESTRATÉGIA DIGITAL`), filtro listando as Diretorias, card com ~13 grupos e "Sem Diretoria" = 6 por último, e "Audiencia"/"Estrategia Digital" agregados em "AUDIÊNCIA"/"ESTRATÉGIA DIGITAL".

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DiretoriaStatsCard.jsx frontend/src/components/DiretoriaStatsCard.test.jsx frontend/src/pages/GeminiPage.jsx
git commit -m "feat(diretoria): coluna, filtro e card Licenças por Diretoria na tela Gemini"
```

---

### Task 6: Coluna "Diretoria" no relatório copiado

**Files:**
- Modify: `frontend/src/utils/usersReport.js`, `frontend/src/utils/usersReport.test.js`, `frontend/src/components/CopyUsersReportButton.jsx`, `frontend/src/components/CopyUsersReportButton.test.jsx`

**Interfaces:**
- Consumes: `getDiretoria`, `SEM_DIRETORIA` (Task 3).
- Produces: `buildUsersReportClipboard(report, configs, diretorias = null)`; headers passam a ser `['Email', 'Diretoria', 'Licença', 'Status', 'Atribuída em', 'Último acesso']`. Célula: string → valor como está no AD; `null` → `Sem Diretoria`; desconhecido → `—`. `CopyUsersReportButton({ users, configs, diretorias })`.

- [ ] **Step 1: Escrever/ajustar os testes que falham**

Em `usersReport.test.js`: o teste existente do clipboard passa a esperar a coluna "Diretoria" na 2ª posição; novos casos para e-mail com maiúsculas (`Ana.Souza@oglobo.com.br` com mapa em minúsculas → valor encontrado), `null` → `Sem Diretoria` e `diretorias = null` → `—` em todas as linhas. Em `CopyUsersReportButton.test.jsx`: passar `diretorias` e conferir que o texto copiado contém a Diretoria.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/utils/usersReport.test.js src/components/CopyUsersReportButton.test.jsx`
Expected: FAIL — falta a coluna Diretoria.

- [ ] **Step 3: Implementar**

- [ ] **Step 4: Rodar as duas suítes**

Run: `cd frontend && npm test && cd ../backend && npm test`
Expected: PASS nas duas.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/usersReport.js frontend/src/utils/usersReport.test.js frontend/src/components/CopyUsersReportButton.jsx frontend/src/components/CopyUsersReportButton.test.jsx
git commit -m "feat(diretoria): coluna Diretoria no Copiar Relatório de Usuários"
```
