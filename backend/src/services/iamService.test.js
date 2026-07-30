jest.mock('./iamPolicyStore', () => ({
  getPolicy: jest.fn(),
  setPolicy: jest.fn(),
}));

jest.mock('./principalProbe', () => ({
  validateAndCleanup: jest.fn(),
}));

const { listUsers, addUser, removeUser, addCodeAssistUser, removeCodeAssistUser } = require('./iamService');
const { getPolicy, setPolicy } = require('./iamPolicyStore');
const { validateAndCleanup } = require('./principalProbe');

const ROLE = 'roles/discoveryengine.user';
const PREFIX = 'principal://iam.googleapis.com/locations/global/workforcePools/entra-workforce/subject/';
const CODE_ASSIST_ROLE = `projects/${process.env.GCP_PROJECT_ID}/roles/CustomRole`;
const CODE_ASSIST_PREFIX = 'user:';

function makePolicy(members = []) {
  return {
    etag: 'abc123',
    bindings: members.length ? [{ role: ROLE, members }] : [],
  };
}

function makeCodeAssistPolicy(codeAssistMembers = [], mainRoleMembers = []) {
  const bindings = [];
  if (mainRoleMembers.length) bindings.push({ role: ROLE, members: mainRoleMembers });
  if (codeAssistMembers.length) bindings.push({ role: CODE_ASSIST_ROLE, members: codeAssistMembers });
  return { etag: 'abc123', bindings };
}

beforeEach(() => {
  setPolicy.mockResolvedValue({});
  validateAndCleanup.mockImplementation(async (policy) => JSON.parse(JSON.stringify(policy)));
});

describe('listUsers', () => {
  test('retorna lista vazia quando não há binding para a role', async () => {
    getPolicy.mockResolvedValue({ bindings: [] });
    expect(await listUsers()).toEqual([]);
  });

  test('retorna lista vazia quando bindings é undefined', async () => {
    getPolicy.mockResolvedValue({});
    expect(await listUsers()).toEqual([]);
  });

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

  test('ignora membros que não começam com "principal://"', async () => {
    getPolicy.mockResolvedValue(
      makePolicy([`${PREFIX}a@exemplo.com`, 'user:outro@exemplo.com'])
    );
    const users = await listUsers();
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe('a@exemplo.com');
  });
});

describe('addUser', () => {
  test('adiciona membro ao binding existente', async () => {
    getPolicy.mockResolvedValue(makePolicy([`${PREFIX}ja@existe.com`]));
    await addUser('novo@exemplo.com');
    const policy = setPolicy.mock.calls[0][0];
    const binding = policy.bindings.find((b) => b.role === ROLE);
    expect(binding.members).toContain(`${PREFIX}novo@exemplo.com`);
  });

  test('cria novo binding quando a role não existe', async () => {
    getPolicy.mockResolvedValue({ etag: 'x', bindings: [] });
    await addUser('primeiro@exemplo.com');
    const policy = setPolicy.mock.calls[0][0];
    expect(policy.bindings).toContainEqual({
      role: ROLE,
      members: [`${PREFIX}primeiro@exemplo.com`],
    });
  });

  test('cria binding quando policy.bindings é undefined', async () => {
    getPolicy.mockResolvedValue({ etag: 'x' });
    await addUser('novo@exemplo.com');
    const policy = setPolicy.mock.calls[0][0];
    expect(policy.bindings).toHaveLength(1);
  });

  test('lança 409 quando usuário já possui a role', async () => {
    getPolicy.mockResolvedValue(makePolicy([`${PREFIX}ja@existe.com`]));
    const err = await addUser('ja@existe.com').catch((e) => e);
    expect(err.status).toBe(409);
    expect(setPolicy).not.toHaveBeenCalled();
    expect(validateAndCleanup).not.toHaveBeenCalled();
  });

  test('retorna objeto com email e principal', async () => {
    getPolicy.mockResolvedValue({ bindings: [] });
    const result = await addUser('novo@exemplo.com');
    expect(result).toEqual({
      email: 'novo@exemplo.com',
      principal: `${PREFIX}novo@exemplo.com`,
    });
  });

  test('valida o principal via probe antes de conceder a role', async () => {
    getPolicy.mockResolvedValue({ bindings: [] });
    await addUser('novo@exemplo.com');
    expect(validateAndCleanup).toHaveBeenCalledWith(
      expect.objectContaining({ bindings: [] }),
      'novo@exemplo.com'
    );
  });

  test('concede a role usando a policy limpa retornada pelo probe', async () => {
    getPolicy.mockResolvedValue({ bindings: [] });
    validateAndCleanup.mockResolvedValue({ etag: 'pos-probe', bindings: [] });

    await addUser('novo@exemplo.com');

    const policy = setPolicy.mock.calls[0][0];
    expect(policy.etag).toBe('pos-probe');
    expect(policy.bindings).toContainEqual({
      role: ROLE,
      members: [`${PREFIX}novo@exemplo.com`],
    });
  });

  test('propaga o erro do probe (422) sem conceder a role', async () => {
    getPolicy.mockResolvedValue({ bindings: [] });
    const notSynced = new Error('Usuário não sincronizado. Solicite ao time de AD.');
    notSynced.status = 422;
    validateAndCleanup.mockRejectedValue(notSynced);

    const err = await addUser('naosincronizado@exemplo.com').catch((e) => e);

    expect(err.status).toBe(422);
    expect(setPolicy).not.toHaveBeenCalled();
  });

  test('propaga o erro genérico do probe (500) sem conceder a role', async () => {
    getPolicy.mockResolvedValue({ bindings: [] });
    const generic = new Error('Falha ao validar usuário. Tente novamente.');
    generic.status = 500;
    validateAndCleanup.mockRejectedValue(generic);

    const err = await addUser('qualquer@exemplo.com').catch((e) => e);

    expect(err.status).toBe(500);
    expect(setPolicy).not.toHaveBeenCalled();
  });

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
});

describe('removeUser', () => {
  test('remove membro do binding existente', async () => {
    getPolicy.mockResolvedValue(
      makePolicy([`${PREFIX}a@exemplo.com`, `${PREFIX}b@exemplo.com`])
    );
    await removeUser('a@exemplo.com');
    const policy = setPolicy.mock.calls[0][0];
    const binding = policy.bindings.find((b) => b.role === ROLE);
    expect(binding.members).not.toContain(`${PREFIX}a@exemplo.com`);
    expect(binding.members).toContain(`${PREFIX}b@exemplo.com`);
  });

  test('lança 404 quando a role não existe na policy', async () => {
    getPolicy.mockResolvedValue({ bindings: [] });
    const err = await removeUser('qualquer@exemplo.com').catch((e) => e);
    expect(err.status).toBe(404);
    expect(setPolicy).not.toHaveBeenCalled();
  });

  test('lança 404 quando usuário não está na role', async () => {
    getPolicy.mockResolvedValue(makePolicy([`${PREFIX}outro@exemplo.com`]));
    const err = await removeUser('naoexiste@exemplo.com').catch((e) => e);
    expect(err.status).toBe(404);
    expect(setPolicy).not.toHaveBeenCalled();
  });

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
});

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
