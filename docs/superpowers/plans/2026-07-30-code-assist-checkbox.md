# Code Assist Checkbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin optionally grant the custom "Code Assist" IAM role alongside `discoveryengine.user` from the "IAM — Discovery Engine User" screen, view who has it, manage it independently per user, and have it revoked automatically when the user is removed from IAM.

**Architecture:** Code Assist is a second IAM role managed entirely inside the existing `iamService.js` (no generalization/registry — two roles get two dedicated function pairs, following the file's current style). It uses a different GCP member type (`user:<email>`, a direct Cloud Identity member) than `discoveryengine.user` (`principal://...workforcePools/...`), but reuses the same `getPolicy`/`setPolicy`/`validateAndCleanup` plumbing. `addUser` grows an optional `{ codeAssist }` flag that, on success, attempts a second grant without rolling back the first on failure. `removeUser` grows a cascade: it revokes Code Assist first (a real failure blocks the whole removal; a 404 is swallowed), mirroring the existing Gemini-license-removal pattern in `docs/adr/0003-remocao-de-licenca-revoga-iam.md`. Two new routes let the UI manage Code Assist per-row without going through the full add/remove flow.

**Tech Stack:** Node/Express + Jest/Supertest (backend), React + Ant Design + Vitest (frontend). No new dependencies.

**Context docs already written (do not re-derive these decisions):** `CONTEXT.md` (see "Papel Complementar" and "Code Assist" entries) and `docs/adr/0004-code-assist-e-papel-complementar.md`.

---

## File Structure

- Modify: `backend/src/services/iamService.js` — add `CODE_ASSIST_ROLE`/`CODE_ASSIST_MEMBER_PREFIX` constants, `addCodeAssistUser`/`removeCodeAssistUser` functions, extend `listUsers`/`addUser`/`removeUser`.
- Modify: `backend/src/services/iamService.test.js` — tests for all of the above.
- Modify: `backend/src/routes/iam.js` — add `POST/DELETE /users/:email/code-assist`, thread `codeAssist` flag through `POST /users`.
- Modify: `backend/src/routes/iam.test.js` — tests for the new/changed routes.
- Modify: `frontend/src/api/iam.js` — add `addCodeAssist`/`removeCodeAssist`, extend `addIAMUser`.
- Modify: `frontend/src/pages/IAMPage.jsx` — checkbox in the add modal, Code Assist column with per-row grant/revoke action.

No new files needed — both roles fit naturally into the existing single-file service.

---

### Task 1: `addCodeAssistUser` / `removeCodeAssistUser` in `iamService.js`

**Files:**
- Modify: `backend/src/services/iamService.js`
- Test: `backend/src/services/iamService.test.js`

- [ ] **Step 1: Add the new constants and test helpers**

At the top of `backend/src/services/iamService.test.js`, after the existing `ROLE`/`PREFIX` constants, add:

```js
const CODE_ASSIST_ROLE = `projects/${process.env.GCP_PROJECT_ID}/roles/CustomRole`;
const CODE_ASSIST_PREFIX = 'user:';

function makeCodeAssistPolicy(codeAssistMembers = [], mainRoleMembers = []) {
  const bindings = [];
  if (mainRoleMembers.length) bindings.push({ role: ROLE, members: mainRoleMembers });
  if (codeAssistMembers.length) bindings.push({ role: CODE_ASSIST_ROLE, members: codeAssistMembers });
  return { etag: 'abc123', bindings };
}
```

`makeCodeAssistPolicy`'s second argument represents which emails already have `discoveryengine.user` — needed because `addCodeAssistUser` requires that as a precondition (Code Assist is a Papel Complementar, see `docs/adr/0004-code-assist-e-papel-complementar.md`: it can never exist without `discoveryengine.user`).

(This mirrors how `backend/src/services/principalProbe.test.js:33` reads `process.env.GCP_PROJECT_ID` directly — no `.env` loading needed in tests, the string just has to match what the source builds.)

- [ ] **Step 2: Write the failing tests for `addCodeAssistUser`**

Add a new `describe` block to `iamService.test.js`, right after the existing `describe('addUser', ...)` block:

```js
describe('addCodeAssistUser', () => {
  test('adiciona membro ao binding existente', async () => {
    getPolicy.mockResolvedValue(
      makeCodeAssistPolicy(
        [`${CODE_ASSIST_PREFIX}ja@existe.com`],
        [`${PREFIX}novo@exemplo.com`, `${PREFIX}ja@existe.com`]
      )
    );
    await addCodeAssistUser('novo@exemplo.com');
    const policy = setPolicy.mock.calls[0][0];
    const binding = policy.bindings.find((b) => b.role === CODE_ASSIST_ROLE);
    expect(binding.members).toContain(`${CODE_ASSIST_PREFIX}novo@exemplo.com`);
  });

  test('cria novo binding quando a role não existe', async () => {
    getPolicy.mockResolvedValue(makeCodeAssistPolicy([], [`${PREFIX}primeiro@exemplo.com`]));
    await addCodeAssistUser('primeiro@exemplo.com');
    const policy = setPolicy.mock.calls[0][0];
    expect(policy.bindings).toContainEqual({
      role: CODE_ASSIST_ROLE,
      members: [`${CODE_ASSIST_PREFIX}primeiro@exemplo.com`],
    });
  });

  test('lança 404 quando o usuário não possui discoveryengine.user', async () => {
    getPolicy.mockResolvedValue({ bindings: [] });
    const err = await addCodeAssistUser('semrole@exemplo.com').catch((e) => e);
    expect(err.status).toBe(404);
    expect(setPolicy).not.toHaveBeenCalled();
    expect(validateAndCleanup).not.toHaveBeenCalled();
  });

  test('lança 409 quando usuário já possui a role', async () => {
    getPolicy.mockResolvedValue(
      makeCodeAssistPolicy([`${CODE_ASSIST_PREFIX}ja@existe.com`], [`${PREFIX}ja@existe.com`])
    );
    const err = await addCodeAssistUser('ja@existe.com').catch((e) => e);
    expect(err.status).toBe(409);
    expect(setPolicy).not.toHaveBeenCalled();
    expect(validateAndCleanup).not.toHaveBeenCalled();
  });

  test('retorna objeto com email e member', async () => {
    getPolicy.mockResolvedValue(makeCodeAssistPolicy([], [`${PREFIX}novo@exemplo.com`]));
    const result = await addCodeAssistUser('novo@exemplo.com');
    expect(result).toEqual({
      email: 'novo@exemplo.com',
      member: `${CODE_ASSIST_PREFIX}novo@exemplo.com`,
    });
  });

  test('valida o principal via probe antes de conceder a role', async () => {
    const policy = makeCodeAssistPolicy([], [`${PREFIX}novo@exemplo.com`]);
    getPolicy.mockResolvedValue(policy);
    await addCodeAssistUser('novo@exemplo.com');
    expect(validateAndCleanup).toHaveBeenCalledWith(policy, 'novo@exemplo.com');
  });

  test('propaga o erro do probe (422) sem conceder a role', async () => {
    getPolicy.mockResolvedValue(makeCodeAssistPolicy([], [`${PREFIX}naosincronizado@exemplo.com`]));
    const notSynced = new Error('Usuário não sincronizado. Solicite ao time de AD.');
    notSynced.status = 422;
    validateAndCleanup.mockRejectedValue(notSynced);

    const err = await addCodeAssistUser('naosincronizado@exemplo.com').catch((e) => e);

    expect(err.status).toBe(422);
    expect(setPolicy).not.toHaveBeenCalled();
  });
});

describe('removeCodeAssistUser', () => {
  test('remove membro do binding existente', async () => {
    getPolicy.mockResolvedValue(
      makeCodeAssistPolicy([`${CODE_ASSIST_PREFIX}a@exemplo.com`, `${CODE_ASSIST_PREFIX}b@exemplo.com`])
    );
    await removeCodeAssistUser('a@exemplo.com');
    const policy = setPolicy.mock.calls[0][0];
    const binding = policy.bindings.find((b) => b.role === CODE_ASSIST_ROLE);
    expect(binding.members).not.toContain(`${CODE_ASSIST_PREFIX}a@exemplo.com`);
    expect(binding.members).toContain(`${CODE_ASSIST_PREFIX}b@exemplo.com`);
  });

  test('lança 404 quando a role não existe na policy', async () => {
    getPolicy.mockResolvedValue({ bindings: [] });
    const err = await removeCodeAssistUser('qualquer@exemplo.com').catch((e) => e);
    expect(err.status).toBe(404);
    expect(setPolicy).not.toHaveBeenCalled();
  });

  test('lança 404 quando usuário não está na role', async () => {
    getPolicy.mockResolvedValue(makeCodeAssistPolicy([`${CODE_ASSIST_PREFIX}outro@exemplo.com`]));
    const err = await removeCodeAssistUser('naoexiste@exemplo.com').catch((e) => e);
    expect(err.status).toBe(404);
    expect(setPolicy).not.toHaveBeenCalled();
  });
});
```

Also update the top `require` line to pull in the two new functions:

```js
const { listUsers, addUser, removeUser, addCodeAssistUser, removeCodeAssistUser } = require('./iamService');
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd backend && npx jest iamService.test.js -t "addCodeAssistUser"`
Expected: FAIL — `addCodeAssistUser is not a function` (it isn't exported yet).

- [ ] **Step 4: Implement `addCodeAssistUser` and `removeCodeAssistUser`**

In `backend/src/services/iamService.js`, add the constants right after the existing `WORKFORCE_PREFIX` constant:

```js
const CODE_ASSIST_ROLE = `projects/${process.env.GCP_PROJECT_ID}/roles/CustomRole`;
const CODE_ASSIST_MEMBER_PREFIX = 'user:';
```

Add the two functions after `removeUser` (before `module.exports`):

```js
async function addCodeAssistUser(email) {
  const policy = await getPolicy();
  const principal = `${WORKFORCE_PREFIX}${email}`;
  const mainBinding = (policy.bindings || []).find((b) => b.role === ROLE);

  if (!mainBinding || !mainBinding.members.includes(principal)) {
    const err = new Error('Usuário precisa ter discoveryengine.user antes de receber o Code Assist');
    err.status = 404;
    throw err;
  }

  const member = `${CODE_ASSIST_MEMBER_PREFIX}${email}`;
  policy.bindings ??= [];
  const binding = policy.bindings.find((b) => b.role === CODE_ASSIST_ROLE);

  if (binding && binding.members.includes(member)) {
    const err = new Error('Usuário já possui essa permissão');
    err.status = 409;
    throw err;
  }

  const cleanPolicy = await validateAndCleanup(policy, email);
  cleanPolicy.bindings ??= [];
  const cleanBinding = cleanPolicy.bindings.find((b) => b.role === CODE_ASSIST_ROLE);

  if (cleanBinding) {
    cleanBinding.members.push(member);
  } else {
    cleanPolicy.bindings.push({ role: CODE_ASSIST_ROLE, members: [member] });
  }

  await setPolicy(cleanPolicy);
  return { email, member };
}

async function removeCodeAssistUser(email) {
  const policy = await getPolicy();
  const member = `${CODE_ASSIST_MEMBER_PREFIX}${email}`;
  policy.bindings ??= [];
  const binding = policy.bindings.find((b) => b.role === CODE_ASSIST_ROLE);

  if (!binding) {
    const err = new Error('Role não encontrada na policy do projeto');
    err.status = 404;
    throw err;
  }

  const before = binding.members.length;
  binding.members = binding.members.filter((m) => m !== member);

  if (binding.members.length === before) {
    const err = new Error('Usuário não encontrado com essa role');
    err.status = 404;
    throw err;
  }

  await setPolicy(policy);
}
```

Update `module.exports` at the bottom:

```js
module.exports = { listUsers, addUser, removeUser, addCodeAssistUser, removeCodeAssistUser };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx jest iamService.test.js`
Expected: PASS, all tests including the pre-existing ones.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/iamService.js backend/src/services/iamService.test.js
git commit -m "feat: add addCodeAssistUser/removeCodeAssistUser to iamService"
```

---

### Task 2: `listUsers` reports Code Assist status per user

**Files:**
- Modify: `backend/src/services/iamService.js`
- Test: `backend/src/services/iamService.test.js`

- [ ] **Step 1: Update the existing full-equality `listUsers` test and add new ones**

The test `'retorna usuários mapeados de membros existentes'` currently asserts exact objects without a `codeAssist` field — it needs updating since the return shape changes. Replace it, and add two new tests for the Code Assist join, inside the existing `describe('listUsers', ...)` block:

```js
  test('retorna usuários mapeados de membros existentes', async () => {
    getPolicy.mockResolvedValue(
      makePolicy([`${PREFIX}a@exemplo.com`, `${PREFIX}b@exemplo.com`])
    );
    const users = await listUsers();
    expect(users).toEqual([
      { email: 'a@exemplo.com', principal: `${PREFIX}a@exemplo.com`, codeAssist: false },
      { email: 'b@exemplo.com', principal: `${PREFIX}b@exemplo.com`, codeAssist: false },
    ]);
  });

  test('marca codeAssist true para quem também tem o binding do Code Assist', async () => {
    getPolicy.mockResolvedValue({
      etag: 'abc123',
      bindings: [
        { role: ROLE, members: [`${PREFIX}a@exemplo.com`, `${PREFIX}b@exemplo.com`] },
        { role: CODE_ASSIST_ROLE, members: [`${CODE_ASSIST_PREFIX}a@exemplo.com`] },
      ],
    });
    const users = await listUsers();
    expect(users).toEqual([
      { email: 'a@exemplo.com', principal: `${PREFIX}a@exemplo.com`, codeAssist: true },
      { email: 'b@exemplo.com', principal: `${PREFIX}b@exemplo.com`, codeAssist: false },
    ]);
  });

  test('não quebra quando não há binding nenhum de Code Assist na policy', async () => {
    getPolicy.mockResolvedValue(makePolicy([`${PREFIX}a@exemplo.com`]));
    const users = await listUsers();
    expect(users[0].codeAssist).toBe(false);
  });
```

(The existing test `'ignora membros que não começam com "principal://"'` only checks `users[0].email`, not full equality — leave it as-is, it still passes.)

- [ ] **Step 2: Run to verify the new/updated tests fail**

Run: `cd backend && npx jest iamService.test.js -t "listUsers"`
Expected: FAIL — actual objects don't have a `codeAssist` key yet.

- [ ] **Step 3: Implement the join in `listUsers`**

Replace the body of `listUsers` in `backend/src/services/iamService.js`:

```js
async function listUsers() {
  const policy = await getPolicy();
  const binding = (policy.bindings || []).find((b) => b.role === ROLE);
  if (!binding) return [];

  const codeAssistBinding = (policy.bindings || []).find((b) => b.role === CODE_ASSIST_ROLE);
  const codeAssistEmails = new Set(
    (codeAssistBinding?.members || [])
      .filter((m) => m.startsWith(CODE_ASSIST_MEMBER_PREFIX))
      .map((m) => m.slice(CODE_ASSIST_MEMBER_PREFIX.length))
  );

  return (binding.members || [])
    .filter((m) => m.startsWith('principal://'))
    .map((m) => {
      const email = m.split('/').pop();
      return { email, principal: m, codeAssist: codeAssistEmails.has(email) };
    });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest iamService.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/iamService.js backend/src/services/iamService.test.js
git commit -m "feat: listUsers reports Code Assist status per user"
```

---

### Task 3: `addUser` accepts an optional `codeAssist` flag

**Files:**
- Modify: `backend/src/services/iamService.js`
- Test: `backend/src/services/iamService.test.js`

- [ ] **Step 1: Write the failing tests**

Add to the existing `describe('addUser', ...)` block:

```js
  test('não concede Code Assist quando a opção não é passada', async () => {
    getPolicy.mockResolvedValue({ bindings: [] });
    const result = await addUser('novo@exemplo.com');
    expect(result.codeAssist).toBeUndefined();
    expect(setPolicy).toHaveBeenCalledTimes(1);
  });

  test('concede Code Assist quando codeAssist=true e retorna granted:true', async () => {
    // 1ª chamada: addUser busca a policy antes de conceder discoveryengine.user (ainda sem o binding).
    // 2ª chamada: addCodeAssistUser busca a policy de novo, já refletindo o discoveryengine.user recém-concedido
    // (setPolicy já foi aplicado nesse ponto) — é essa 2ª policy que satisfaz a checagem de pré-requisito.
    getPolicy
      .mockResolvedValueOnce({ bindings: [] })
      .mockResolvedValueOnce({ bindings: [{ role: ROLE, members: [`${PREFIX}novo@exemplo.com`] }] });

    const result = await addUser('novo@exemplo.com', { codeAssist: true });

    expect(result.codeAssist).toEqual({ granted: true });
    expect(setPolicy).toHaveBeenCalledTimes(2);
    const codeAssistPolicy = setPolicy.mock.calls[1][0];
    expect(codeAssistPolicy.bindings).toContainEqual({
      role: CODE_ASSIST_ROLE,
      members: [`${CODE_ASSIST_PREFIX}novo@exemplo.com`],
    });
  });

  test('mantém discoveryengine.user concedido mesmo se a concessão do Code Assist falhar', async () => {
    getPolicy
      .mockResolvedValueOnce({ bindings: [] })
      .mockResolvedValueOnce({ bindings: [{ role: ROLE, members: [`${PREFIX}novo@exemplo.com`] }] });
    setPolicy
      .mockResolvedValueOnce({}) // grant discoveryengine.user
      .mockRejectedValueOnce(new Error('falha de rede')); // grant Code Assist

    const result = await addUser('novo@exemplo.com', { codeAssist: true });

    expect(result.email).toBe('novo@exemplo.com');
    expect(result.codeAssist).toEqual({ granted: false, error: 'falha de rede' });
    expect(setPolicy).toHaveBeenCalledTimes(2);
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && npx jest iamService.test.js -t "addUser"`
Expected: FAIL — `result.codeAssist` is always `undefined` regardless of the flag.

- [ ] **Step 3: Implement the flag in `addUser`**

In `backend/src/services/iamService.js`, change the signature and tail of `addUser`:

```js
async function addUser(email, { codeAssist = false } = {}) {
  const policy = await getPolicy();
  const principal = `${WORKFORCE_PREFIX}${email}`;
  policy.bindings ??= [];
  const binding = policy.bindings.find((b) => b.role === ROLE);

  if (binding && binding.members.includes(principal)) {
    const err = new Error('Usuário já possui essa permissão');
    err.status = 409;
    throw err;
  }

  const cleanPolicy = await validateAndCleanup(policy, email);
  cleanPolicy.bindings ??= [];
  const cleanBinding = cleanPolicy.bindings.find((b) => b.role === ROLE);

  if (cleanBinding) {
    cleanBinding.members.push(principal);
  } else {
    cleanPolicy.bindings.push({ role: ROLE, members: [principal] });
  }

  await setPolicy(cleanPolicy);
  const result = { email, principal };

  if (codeAssist) {
    try {
      await addCodeAssistUser(email);
      result.codeAssist = { granted: true };
    } catch (err) {
      result.codeAssist = { granted: false, error: err.message };
    }
  }

  return result;
}
```

(`addCodeAssistUser` is defined later in the file — fine, function declarations are hoisted.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest iamService.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/iamService.js backend/src/services/iamService.test.js
git commit -m "feat: addUser optionally grants Code Assist alongside discoveryengine.user"
```

---

### Task 4: `removeUser` cascades to revoke Code Assist first

**Files:**
- Modify: `backend/src/services/iamService.js`
- Test: `backend/src/services/iamService.test.js`

- [ ] **Step 1: Write the failing tests**

Add to the existing `describe('removeUser', ...)` block:

```js
  test('revoga Code Assist antes de revogar discoveryengine.user quando o usuário tem os dois', async () => {
    const combinedPolicy = () => ({
      etag: 'abc123',
      bindings: [
        { role: ROLE, members: [`${PREFIX}a@exemplo.com`] },
        { role: CODE_ASSIST_ROLE, members: [`${CODE_ASSIST_PREFIX}a@exemplo.com`] },
      ],
    });
    getPolicy.mockResolvedValueOnce(combinedPolicy()).mockResolvedValueOnce(combinedPolicy());

    await removeUser('a@exemplo.com');

    expect(setPolicy).toHaveBeenCalledTimes(2);
    const codeAssistPolicy = setPolicy.mock.calls[0][0];
    const codeAssistBinding = codeAssistPolicy.bindings.find((b) => b.role === CODE_ASSIST_ROLE);
    expect(codeAssistBinding.members).not.toContain(`${CODE_ASSIST_PREFIX}a@exemplo.com`);

    const mainPolicy = setPolicy.mock.calls[1][0];
    const mainBinding = mainPolicy.bindings.find((b) => b.role === ROLE);
    expect(mainBinding.members).not.toContain(`${PREFIX}a@exemplo.com`);
  });

  test('remove discoveryengine.user normalmente quando o usuário não tem Code Assist (404 é ignorado)', async () => {
    getPolicy.mockResolvedValue(makePolicy([`${PREFIX}a@exemplo.com`]));
    await removeUser('a@exemplo.com');
    expect(setPolicy).toHaveBeenCalledTimes(1);
  });

  test('bloqueia a remoção quando a revogação do Code Assist falha por um erro real', async () => {
    getPolicy.mockResolvedValue({
      etag: 'abc123',
      bindings: [
        { role: ROLE, members: [`${PREFIX}a@exemplo.com`] },
        { role: CODE_ASSIST_ROLE, members: [`${CODE_ASSIST_PREFIX}a@exemplo.com`] },
      ],
    });
    setPolicy.mockRejectedValueOnce(new Error('falha de rede'));

    const err = await removeUser('a@exemplo.com').catch((e) => e);

    expect(err.status).toBe(502);
    expect(setPolicy).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && npx jest iamService.test.js -t "removeUser"`
Expected: FAIL — `removeUser` never touches `CODE_ASSIST_ROLE` yet, so `setPolicy` is called once, not twice, in the first test, and the 502 test doesn't throw at all.

- [ ] **Step 3: Implement the cascade in `removeUser`**

In `backend/src/services/iamService.js`, change the start of `removeUser`:

```js
async function removeUser(email) {
  try {
    await removeCodeAssistUser(email);
  } catch (err) {
    if (err.status !== 404) {
      const wrapped = new Error('Falha ao revogar Code Assist; discoveryengine.user não foi removido.');
      wrapped.status = 502;
      throw wrapped;
    }
  }

  const policy = await getPolicy();
  const principal = `${WORKFORCE_PREFIX}${email}`;
  policy.bindings ??= [];
  const binding = policy.bindings.find((b) => b.role === ROLE);

  if (!binding) {
    const err = new Error('Role não encontrada na policy do projeto');
    err.status = 404;
    throw err;
  }

  const before = binding.members.length;
  binding.members = binding.members.filter((m) => m !== principal);

  if (binding.members.length === before) {
    const err = new Error('Usuário não encontrado com essa role');
    err.status = 404;
    throw err;
  }

  await setPolicy(policy);
}
```

- [ ] **Step 4: Run all backend tests to verify everything passes**

Run: `cd backend && npx jest`
Expected: PASS — all suites, including `principalProbe.test.js` and `iam.test.js` (unaffected so far).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/iamService.js backend/src/services/iamService.test.js
git commit -m "feat: removeUser cascades to revoke Code Assist first"
```

---

### Task 5: Wire up the routes

**Files:**
- Modify: `backend/src/routes/iam.js`
- Test: `backend/src/routes/iam.test.js`

- [ ] **Step 1: Update the mock and write the failing tests**

In `backend/src/routes/iam.test.js`, update the `iamService` mock at the top:

```js
jest.mock('../services/iamService', () => ({
  listUsers: jest.fn(),
  addUser: jest.fn(),
  removeUser: jest.fn(),
  addCodeAssistUser: jest.fn(),
  removeCodeAssistUser: jest.fn(),
}));
```

Update the `require` line accordingly:

```js
const { listUsers, addUser, removeUser, addCodeAssistUser, removeCodeAssistUser } = require('../services/iamService');
```

Replace the existing `'normaliza email para minúsculas antes de chamar o serviço'` test (its assertion needs a second argument now) and add the new tests for the `codeAssist` flag, inside `describe('POST /api/iam/users', ...)`:

```js
  test('normaliza email para minúsculas antes de chamar o serviço', async () => {
    addUser.mockResolvedValue({ email: 'novo@b.com', principal: '' });
    await request(app).post('/api/iam/users').send({ email: 'NOVO@B.COM' });
    expect(addUser).toHaveBeenCalledWith('novo@b.com', { codeAssist: false });
  });

  test('envia codeAssist=true quando o checkbox foi marcado', async () => {
    addUser.mockResolvedValue({ email: 'novo@b.com', principal: '', codeAssist: { granted: true } });
    await request(app).post('/api/iam/users').send({ email: 'novo@b.com', codeAssist: true });
    expect(addUser).toHaveBeenCalledWith('novo@b.com', { codeAssist: true });
  });

  test('envia codeAssist=false por padrão quando não informado', async () => {
    addUser.mockResolvedValue({ email: 'novo@b.com', principal: '' });
    await request(app).post('/api/iam/users').send({ email: 'novo@b.com' });
    expect(addUser).toHaveBeenCalledWith('novo@b.com', { codeAssist: false });
  });
```

Add a test for the cascade-blocked case, inside `describe('DELETE /api/iam/users/:email', ...)`:

```js
  test('retorna 502 quando a revogação do Code Assist bloqueia a remoção', async () => {
    const err = new Error('Falha ao revogar Code Assist; discoveryengine.user não foi removido.');
    err.status = 502;
    removeUser.mockRejectedValue(err);
    const res = await request(app).delete('/api/iam/users/user%40b.com');
    expect(res.status).toBe(502);
  });
```

Add two new `describe` blocks at the end of the file (before the final closing, after `DELETE /api/iam/users/:email`):

```js
describe('POST /api/iam/users/:email/code-assist', () => {
  test('retorna 201 ao conceder Code Assist', async () => {
    addCodeAssistUser.mockResolvedValue({ email: 'a@b.com', member: 'user:a@b.com' });
    const res = await request(app).post('/api/iam/users/a%40b.com/code-assist');
    expect(res.status).toBe(201);
    expect(addCodeAssistUser).toHaveBeenCalledWith('a@b.com');
  });

  test('retorna 409 quando o usuário já possui Code Assist', async () => {
    const err = new Error('Usuário já possui essa permissão');
    err.status = 409;
    addCodeAssistUser.mockRejectedValue(err);
    const res = await request(app).post('/api/iam/users/a%40b.com/code-assist');
    expect(res.status).toBe(409);
  });

  test('retorna 422 quando o probe indica que o usuário não está sincronizado', async () => {
    const err = new Error('Usuário não sincronizado. Solicite ao time de AD.');
    err.status = 422;
    addCodeAssistUser.mockRejectedValue(err);
    const res = await request(app).post('/api/iam/users/a%40b.com/code-assist');
    expect(res.status).toBe(422);
  });

  test('retorna 404 quando o usuário não possui discoveryengine.user', async () => {
    const err = new Error('Usuário precisa ter discoveryengine.user antes de receber o Code Assist');
    err.status = 404;
    addCodeAssistUser.mockRejectedValue(err);
    const res = await request(app).post('/api/iam/users/semrole%40b.com/code-assist');
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/iam/users/:email/code-assist', () => {
  test('retorna 204 ao revogar Code Assist', async () => {
    removeCodeAssistUser.mockResolvedValue();
    const res = await request(app).delete('/api/iam/users/a%40b.com/code-assist');
    expect(res.status).toBe(204);
    expect(removeCodeAssistUser).toHaveBeenCalledWith('a@b.com');
  });

  test('retorna 404 quando o usuário não possui Code Assist', async () => {
    const err = new Error('Usuário não encontrado com essa role');
    err.status = 404;
    removeCodeAssistUser.mockRejectedValue(err);
    const res = await request(app).delete('/api/iam/users/a%40b.com/code-assist');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run to verify the new/updated tests fail**

Run: `cd backend && npx jest iam.test.js`
Expected: FAIL — routes for `/code-assist` don't exist yet (404 from Express itself), and `addUser` is called with only one argument.

- [ ] **Step 3: Implement the routes**

Replace `backend/src/routes/iam.js` in full:

```js
const { Router } = require('express');
const {
  listUsers, addUser, removeUser, addCodeAssistUser, removeCodeAssistUser,
} = require('../services/iamService');
const validateEmail = require('../middleware/validateEmail');
const asyncRoute = require('../middleware/asyncRoute');

const router = Router();

router.get('/users', asyncRoute(async (req, res) => {
  res.json(await listUsers());
}));

router.post('/users', validateEmail, asyncRoute(async (req, res) => {
  const result = await addUser(req.body.email.trim().toLowerCase(), {
    codeAssist: !!req.body.codeAssist,
  });
  res.status(201).json(result);
}));

router.delete('/users/:email', asyncRoute(async (req, res) => {
  await removeUser(decodeURIComponent(req.params.email));
  res.status(204).send();
}));

router.post('/users/:email/code-assist', asyncRoute(async (req, res) => {
  const result = await addCodeAssistUser(decodeURIComponent(req.params.email));
  res.status(201).json(result);
}));

router.delete('/users/:email/code-assist', asyncRoute(async (req, res) => {
  await removeCodeAssistUser(decodeURIComponent(req.params.email));
  res.status(204).send();
}));

module.exports = router;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest`
Expected: PASS — full backend suite green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/iam.js backend/src/routes/iam.test.js
git commit -m "feat: add Code Assist routes and thread codeAssist flag through add-user route"
```

---

### Task 6: Frontend API client

**Files:**
- Modify: `frontend/src/api/iam.js`

- [ ] **Step 1: Update the API client**

Replace `frontend/src/api/iam.js` in full:

```js
import axios from 'axios';

export const listIAMUsers = () => axios.get('/api/iam/users').then((r) => r.data);

export const addIAMUser = (email, codeAssist = false) =>
  axios.post('/api/iam/users', { email, codeAssist }).then((r) => r.data);

export const removeIAMUser = (email) =>
  axios.delete(`/api/iam/users/${encodeURIComponent(email)}`);

export const addCodeAssist = (email) =>
  axios.post(`/api/iam/users/${encodeURIComponent(email)}/code-assist`).then((r) => r.data);

export const removeCodeAssist = (email) =>
  axios.delete(`/api/iam/users/${encodeURIComponent(email)}/code-assist`);
```

This file has no existing test (it's a thin axios wrapper, consistent with `frontend/src/api/gemini.js` which is also untested) — no test to write here.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/iam.js
git commit -m "feat: add Code Assist API client functions"
```

---

### Task 7: Checkbox in the "Adicionar ao IAM" modal

**Files:**
- Modify: `frontend/src/pages/IAMPage.jsx`

- [ ] **Step 1: Import `Checkbox` and update `handleAdd`**

In `frontend/src/pages/IAMPage.jsx`, add `Checkbox` to the antd import (line 2-5):

```js
import {
  Table, Button, Modal, Form, Input, Checkbox, Popconfirm,
  Typography, Space, Tag, message, Tooltip, Badge,
} from 'antd';
```

Update the import from `../api/iam` to include `addCodeAssist`/`removeCodeAssist` (needed by Task 8, add now to avoid a second edit):

```js
import { listIAMUsers, addIAMUser, removeIAMUser, addCodeAssist, removeCodeAssist } from '../api/iam';
```

Replace `handleAdd` (currently `IAMPage.jsx:28-44`):

```js
  const handleAdd = async () => {
    try {
      const { email, codeAssist } = await form.validateFields();
      setSubmitting(true);
      const normalizedEmail = email.trim().toLowerCase();
      const result = await addIAMUser(normalizedEmail, !!codeAssist);
      message.success(`${normalizedEmail} adicionado com sucesso`);
      if (codeAssist && result.codeAssist?.granted === false) {
        message.warning(`Falha ao conceder Code Assist para ${normalizedEmail}: ${result.codeAssist.error}`);
      }
      form.resetFields();
      setModalOpen(false);
      reload();
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.response?.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  };
```

- [ ] **Step 2: Add the checkbox to the form**

Inside the `Modal`'s `Form` (currently `IAMPage.jsx:161-172`), add a second `Form.Item` after the email field:

```jsx
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="Email"
            name="email"
            rules={[
              { required: true, message: 'Informe o email' },
              { type: 'email', message: 'Email inválido' },
            ]}
          >
            <Input placeholder="usuario@edglobo.com.br" autoFocus />
          </Form.Item>
          <Form.Item name="codeAssist" valuePropName="checked" initialValue={false}>
            <Checkbox>Adicionar também ao Code Assist</Checkbox>
          </Form.Item>
        </Form>
```

- [ ] **Step 3: Manual check**

Run: `cd frontend && npm run dev`, open the IAM page, click "Adicionar ao IAM", confirm the checkbox renders under the email field, unchecked by default, and that submitting without checking it behaves exactly as before (no console errors, no `codeAssist` visible anywhere yet since Task 8 hasn't landed).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/IAMPage.jsx
git commit -m "feat: add Code Assist checkbox to the add-user modal"
```

---

### Task 8: Code Assist column with per-row grant/revoke action

**Files:**
- Modify: `frontend/src/pages/IAMPage.jsx`

- [ ] **Step 1: Add per-row loading state and handlers**

Near the other `useState` declarations (`IAMPage.jsx:17-21`), add:

```js
  const [codeAssistLoading, setCodeAssistLoading] = useState(null);
```

After `handleRemove` (currently ends at `IAMPage.jsx:54`), add:

```js
  const handleGrantCodeAssist = async (email) => {
    setCodeAssistLoading(email);
    try {
      await addCodeAssist(email);
      message.success(`Code Assist concedido a ${email}`);
      reload();
    } catch (err) {
      message.error(err.response?.data?.error || err.message);
    } finally {
      setCodeAssistLoading(null);
    }
  };

  const handleRevokeCodeAssist = async (email) => {
    setCodeAssistLoading(email);
    try {
      await removeCodeAssist(email);
      message.success(`Code Assist revogado de ${email}`);
      reload();
    } catch (err) {
      message.error(err.response?.data?.error || err.message);
    } finally {
      setCodeAssistLoading(null);
    }
  };
```

- [ ] **Step 2: Add the column**

In the `columns` array (`IAMPage.jsx:61-105`), add a new column after the existing `'Role'` column and before `'Ações'`:

```jsx
    {
      title: 'Code Assist',
      key: 'codeAssist',
      width: 160,
      align: 'center',
      render: (_, record) =>
        record.codeAssist ? (
          <Popconfirm
            title={`Revogar Code Assist de ${record.email}?`}
            onConfirm={() => handleRevokeCodeAssist(record.email)}
            okText="Revogar"
            cancelText="Cancelar"
            okButtonProps={{ danger: true, loading: codeAssistLoading === record.email }}
          >
            <Tag color="green" style={{ cursor: 'pointer' }}>Code Assist</Tag>
          </Popconfirm>
        ) : (
          <Button
            size="small"
            type="link"
            loading={codeAssistLoading === record.email}
            onClick={() => handleGrantCodeAssist(record.email)}
          >
            Conceder
          </Button>
        ),
    },
```

- [ ] **Step 3: Update the "Remover" confirmation copy**

In the `'Ações'` column's `Popconfirm` (`IAMPage.jsx:93-102`), update the description so the cascade isn't a surprise:

```jsx
        <Popconfirm
          title={`Remover ${record.email}?`}
          description={
            record.codeAssist
              ? 'discoveryengine.user e Code Assist serão revogados no IAM do projeto.'
              : 'A role será revogada no IAM do projeto.'
          }
          onConfirm={() => handleRemove(record.email)}
          okText="Remover"
          cancelText="Cancelar"
          okButtonProps={{ danger: true }}
        >
          <Button danger icon={<DeleteOutlined />} size="small">Remover</Button>
        </Popconfirm>
```

- [ ] **Step 4: Manual check**

Run: `cd frontend && npm run dev`, open the IAM page:
- Confirm the new "Code Assist" column renders for every row, showing "Conceder" for users without it.
- Confirm clicking "Conceder" and "Revogar" (via the tag's Popconfirm) call the right endpoints (watch the Network tab) and update the table after `reload()`.
- Confirm the "Remover" Popconfirm description changes based on whether the row has Code Assist.
- Confirm no regressions to the base "Adicionar"/"Remover" flow from before this feature.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/IAMPage.jsx
git commit -m "feat: show Code Assist status per user with per-row grant/revoke action"
```

---

## Notes on what's intentionally out of scope

- No frontend automated tests were added for `IAMPage.jsx`. The project's existing frontend test suite only covers pure utils, hooks, and presentational components that receive data via props (see `frontend/src/components/InactivityReportModal.test.jsx`) — no page wires up `axios`/`usePollingFetch` under test today. Introducing that scaffolding is a bigger, separate decision; Task 7/8's manual-check steps cover this feature's UI behavior instead, consistent with current project conventions.
- No rollback of `discoveryengine.user` on Code Assist grant failure, and no retry/backoff logic — both were explicitly decided against during design (see `docs/adr/0004-code-assist-e-papel-complementar.md`).
- No generalized multi-role config/registry in `iamService.js` — deliberately two dedicated function pairs instead (same ADR).
