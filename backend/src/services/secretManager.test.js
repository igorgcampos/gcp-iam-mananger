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

  test('usa o próprio nome da env var como ID do secret quando *_ID não está configurado', async () => {
    process.env.GCP_PROJECT_ID = 'agentspace-469418';
    mockAccessSecretVersion.mockResolvedValue([
      { payload: { data: Buffer.from('valor-secreto') } },
    ]);

    const value = await resolveSecret('AZURE_CLIENT_SECRET', 'AZURE_CLIENT_SECRET_ID');

    expect(value).toBe('valor-secreto');
    expect(mockAccessSecretVersion).toHaveBeenCalledWith({
      name: 'projects/agentspace-469418/secrets/AZURE_CLIENT_SECRET/versions/latest',
    });
  });

  test('lança erro claro quando GCP_PROJECT_ID não está configurado', async () => {
    process.env.AZURE_CLIENT_SECRET_ID = 'azure-client-secret-dev';
    delete process.env.GCP_PROJECT_ID;

    await expect(
      resolveSecret('AZURE_CLIENT_SECRET', 'AZURE_CLIENT_SECRET_ID'),
    ).rejects.toThrow(/GCP_PROJECT_ID/);
  });

  test('lança erro claro quando a busca no Secret Manager falha', async () => {
    process.env.AZURE_CLIENT_SECRET_ID = 'azure-client-secret-dev';
    process.env.GCP_PROJECT_ID = 'agentspace-469418';
    mockAccessSecretVersion.mockRejectedValue(new Error('PERMISSION_DENIED'));

    await expect(
      resolveSecret('AZURE_CLIENT_SECRET', 'AZURE_CLIENT_SECRET_ID'),
    ).rejects.toThrow(/Falha ao buscar o secret/);
  });

  test('resolveAppSecrets resolve os 5 valores da aplicação sem trocar entre si', async () => {
    delete process.env.SESSION_JWT_SECRET;
    delete process.env.AZURE_TENANT_ID;
    delete process.env.AZURE_CLIENT_ID;
    delete process.env.AZURE_ALLOWED_GROUP_ID;
    process.env.AZURE_CLIENT_SECRET_ID = 'azure-client-secret-dev';
    process.env.SESSION_JWT_SECRET_ID = 'session-jwt-secret-dev';
    process.env.AZURE_TENANT_ID_ID = 'azure-tenant-id-dev';
    process.env.AZURE_CLIENT_ID_ID = 'azure-client-id-dev';
    process.env.AZURE_ALLOWED_GROUP_ID_ID = 'azure-allowed-group-id-dev';
    process.env.GCP_PROJECT_ID = 'agentspace-469418';
    const valores = {
      'azure-client-secret-dev': 'valor-azure-secret',
      'session-jwt-secret-dev': 'valor-jwt',
      'azure-tenant-id-dev': 'valor-tenant',
      'azure-client-id-dev': 'valor-client-id',
      'azure-allowed-group-id-dev': 'valor-group-id',
    };
    mockAccessSecretVersion.mockImplementation(({ name }) => {
      const encontrado = Object.entries(valores).find(([secretId]) => name.includes(secretId));
      if (!encontrado) {
        throw new Error(`nome de secret inesperado: ${name}`);
      }
      return Promise.resolve([{ payload: { data: Buffer.from(encontrado[1]) } }]);
    });

    // eslint-disable-next-line global-require
    const { resolveAppSecrets } = require('./secretManager');
    await resolveAppSecrets();

    expect(process.env.AZURE_CLIENT_SECRET).toBe('valor-azure-secret');
    expect(process.env.SESSION_JWT_SECRET).toBe('valor-jwt');
    expect(process.env.AZURE_TENANT_ID).toBe('valor-tenant');
    expect(process.env.AZURE_CLIENT_ID).toBe('valor-client-id');
    expect(process.env.AZURE_ALLOWED_GROUP_ID).toBe('valor-group-id');
  });
});
