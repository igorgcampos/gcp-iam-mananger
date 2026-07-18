jest.mock('googleapis', () => ({
  google: {
    cloudresourcemanager: jest.fn().mockReturnValue({
      projects: {
        getIamPolicy: jest.fn(),
        setIamPolicy: jest.fn(),
      },
    }),
  },
}));

jest.mock('./gcpAuth', () => ({ auth: {} }));

// iamService deve ser carregado primeiro — ele chama cloudresourcemanager() ao inicializar
const { listUsers, addUser, removeUser } = require('./iamService');

const { google } = require('googleapis');
const crm = google.cloudresourcemanager.mock.results[0].value;
const { getIamPolicy, setIamPolicy } = crm.projects;

const ROLE = 'roles/discoveryengine.user';
const PREFIX = 'principal://iam.googleapis.com/locations/global/workforcePools/entra-workforce/subject/';

function makePolicy(members = []) {
  return {
    data: {
      etag: 'abc123',
      bindings: members.length ? [{ role: ROLE, members }] : [],
    },
  };
}

beforeEach(() => {
  setIamPolicy.mockResolvedValue({});
});

describe('listUsers', () => {
  test('retorna lista vazia quando não há binding para a role', async () => {
    getIamPolicy.mockResolvedValue({ data: { bindings: [] } });
    expect(await listUsers()).toEqual([]);
  });

  test('retorna lista vazia quando bindings é undefined', async () => {
    getIamPolicy.mockResolvedValue({ data: {} });
    expect(await listUsers()).toEqual([]);
  });

  test('retorna usuários mapeados de membros existentes', async () => {
    getIamPolicy.mockResolvedValue(
      makePolicy([`${PREFIX}a@exemplo.com`, `${PREFIX}b@exemplo.com`])
    );
    const users = await listUsers();
    expect(users).toEqual([
      { email: 'a@exemplo.com', principal: `${PREFIX}a@exemplo.com` },
      { email: 'b@exemplo.com', principal: `${PREFIX}b@exemplo.com` },
    ]);
  });

  test('ignora membros que não começam com "principal://"', async () => {
    getIamPolicy.mockResolvedValue(
      makePolicy([`${PREFIX}a@exemplo.com`, 'user:outro@exemplo.com'])
    );
    const users = await listUsers();
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe('a@exemplo.com');
  });
});

describe('addUser', () => {
  test('adiciona membro ao binding existente', async () => {
    getIamPolicy.mockResolvedValue(makePolicy([`${PREFIX}ja@existe.com`]));
    await addUser('novo@exemplo.com');
    const policy = setIamPolicy.mock.calls[0][0].requestBody.policy;
    const binding = policy.bindings.find((b) => b.role === ROLE);
    expect(binding.members).toContain(`${PREFIX}novo@exemplo.com`);
  });

  test('cria novo binding quando a role não existe', async () => {
    getIamPolicy.mockResolvedValue({ data: { etag: 'x', bindings: [] } });
    await addUser('primeiro@exemplo.com');
    const policy = setIamPolicy.mock.calls[0][0].requestBody.policy;
    expect(policy.bindings).toContainEqual({
      role: ROLE,
      members: [`${PREFIX}primeiro@exemplo.com`],
    });
  });

  test('cria binding quando policy.bindings é undefined', async () => {
    getIamPolicy.mockResolvedValue({ data: { etag: 'x' } });
    await addUser('novo@exemplo.com');
    const policy = setIamPolicy.mock.calls[0][0].requestBody.policy;
    expect(policy.bindings).toHaveLength(1);
  });

  test('lança 409 quando usuário já possui a role', async () => {
    getIamPolicy.mockResolvedValue(makePolicy([`${PREFIX}ja@existe.com`]));
    const err = await addUser('ja@existe.com').catch((e) => e);
    expect(err.status).toBe(409);
    expect(setIamPolicy).not.toHaveBeenCalled();
  });

  test('retorna objeto com email e principal', async () => {
    getIamPolicy.mockResolvedValue({ data: { bindings: [] } });
    const result = await addUser('novo@exemplo.com');
    expect(result).toEqual({
      email: 'novo@exemplo.com',
      principal: `${PREFIX}novo@exemplo.com`,
    });
  });
});

describe('removeUser', () => {
  test('remove membro do binding existente', async () => {
    getIamPolicy.mockResolvedValue(
      makePolicy([`${PREFIX}a@exemplo.com`, `${PREFIX}b@exemplo.com`])
    );
    await removeUser('a@exemplo.com');
    const policy = setIamPolicy.mock.calls[0][0].requestBody.policy;
    const binding = policy.bindings.find((b) => b.role === ROLE);
    expect(binding.members).not.toContain(`${PREFIX}a@exemplo.com`);
    expect(binding.members).toContain(`${PREFIX}b@exemplo.com`);
  });

  test('lança 404 quando a role não existe na policy', async () => {
    getIamPolicy.mockResolvedValue({ data: { bindings: [] } });
    const err = await removeUser('qualquer@exemplo.com').catch((e) => e);
    expect(err.status).toBe(404);
    expect(setIamPolicy).not.toHaveBeenCalled();
  });

  test('lança 404 quando usuário não está na role', async () => {
    getIamPolicy.mockResolvedValue(makePolicy([`${PREFIX}outro@exemplo.com`]));
    const err = await removeUser('naoexiste@exemplo.com').catch((e) => e);
    expect(err.status).toBe(404);
    expect(setIamPolicy).not.toHaveBeenCalled();
  });
});
