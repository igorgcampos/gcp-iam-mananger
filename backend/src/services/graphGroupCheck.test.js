jest.mock('axios', () => ({ post: jest.fn() }));

const mockAcquireTokenByClientCredential = jest.fn();
jest.mock('./msalClient', () => ({
  getMsalClient: jest.fn(() => ({
    acquireTokenByClientCredential: mockAcquireTokenByClientCredential,
  })),
}));

const axios = require('axios');
const { isMemberOfAllowedGroup, getGraphAppToken } = require('./graphGroupCheck');

const OLD_ENV = process.env;
const ALLOWED_GROUP_ID = 'grupo-permitido-object-id';

beforeEach(() => {
  process.env = { ...OLD_ENV, AZURE_ALLOWED_GROUP_ID: ALLOWED_GROUP_ID };
});

afterAll(() => {
  process.env = OLD_ENV;
});

describe('getGraphAppToken', () => {
  test('pede o token via client credentials com o scope .default do Graph', async () => {
    mockAcquireTokenByClientCredential.mockResolvedValue({ accessToken: 'app-token-123' });

    const token = await getGraphAppToken();

    expect(token).toBe('app-token-123');
    expect(mockAcquireTokenByClientCredential).toHaveBeenCalledWith({
      scopes: ['https://graph.microsoft.com/.default'],
    });
  });

  test('lança erro quando o MSAL não retorna accessToken', async () => {
    mockAcquireTokenByClientCredential.mockResolvedValue({});

    await expect(getGraphAppToken()).rejects.toThrow(/token de aplicação/i);
  });
});

describe('isMemberOfAllowedGroup', () => {
  test('retorna true quando o grupo permitido está na resposta do checkMemberGroups', async () => {
    mockAcquireTokenByClientCredential.mockResolvedValue({ accessToken: 'app-token-123' });
    axios.post.mockResolvedValue({ data: { value: [ALLOWED_GROUP_ID, 'outro-grupo'] } });

    const result = await isMemberOfAllowedGroup('oid-do-usuario');

    expect(result).toBe(true);
    expect(axios.post).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/users/oid-do-usuario/checkMemberGroups',
      { groupIds: [ALLOWED_GROUP_ID] },
      { headers: { Authorization: 'Bearer app-token-123' } },
    );
  });

  test('retorna false quando o grupo permitido não está na resposta', async () => {
    mockAcquireTokenByClientCredential.mockResolvedValue({ accessToken: 'app-token-123' });
    axios.post.mockResolvedValue({ data: { value: ['outro-grupo'] } });

    const result = await isMemberOfAllowedGroup('oid-do-usuario');

    expect(result).toBe(false);
  });

  test('retorna false quando a resposta não tem nenhum grupo', async () => {
    mockAcquireTokenByClientCredential.mockResolvedValue({ accessToken: 'app-token-123' });
    axios.post.mockResolvedValue({ data: {} });

    const result = await isMemberOfAllowedGroup('oid-do-usuario');

    expect(result).toBe(false);
  });

  test('lança erro quando AZURE_ALLOWED_GROUP_ID não está configurado', async () => {
    delete process.env.AZURE_ALLOWED_GROUP_ID;

    await expect(isMemberOfAllowedGroup('oid-do-usuario')).rejects.toThrow(/AZURE_ALLOWED_GROUP_ID/);
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('propaga erro quando a chamada ao Graph falha', async () => {
    mockAcquireTokenByClientCredential.mockResolvedValue({ accessToken: 'app-token-123' });
    axios.post.mockRejectedValue(new Error('403 Forbidden'));

    await expect(isMemberOfAllowedGroup('oid-do-usuario')).rejects.toThrow('403 Forbidden');
  });
});
