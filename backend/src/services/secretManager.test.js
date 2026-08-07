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

  test('resolveAppSecrets resolve AZURE_CLIENT_SECRET e SESSION_JWT_SECRET sem trocar os valores', async () => {
    delete process.env.SESSION_JWT_SECRET;
    process.env.AZURE_CLIENT_SECRET_ID = 'azure-client-secret-dev';
    process.env.SESSION_JWT_SECRET_ID = 'session-jwt-secret-dev';
    process.env.GCP_PROJECT_ID = 'agentspace-469418';
    mockAccessSecretVersion.mockImplementation(({ name }) => {
      if (name.includes('azure-client-secret-dev')) {
        return Promise.resolve([{ payload: { data: Buffer.from('valor-azure') } }]);
      }
      if (name.includes('session-jwt-secret-dev')) {
        return Promise.resolve([{ payload: { data: Buffer.from('valor-jwt') } }]);
      }
      throw new Error(`nome de secret inesperado: ${name}`);
    });

    // eslint-disable-next-line global-require
    const { resolveAppSecrets } = require('./secretManager');
    await resolveAppSecrets();

    expect(process.env.AZURE_CLIENT_SECRET).toBe('valor-azure');
    expect(process.env.SESSION_JWT_SECRET).toBe('valor-jwt');
    expect(process.env.AZURE_CLIENT_SECRET).not.toBe(process.env.SESSION_JWT_SECRET);
  });
});
