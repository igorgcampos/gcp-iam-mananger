const mockPost = jest.fn();
const mockGet = jest.fn();

jest.mock('axios', () => ({
  create: jest.fn(() => ({
    post: mockPost,
    get: mockGet,
    interceptors: { request: { use: jest.fn() } },
  })),
}));

jest.mock('./gcpAuth', () => ({ getAccessToken: jest.fn().mockResolvedValue('fake-token') }));

jest.mock('./iamService', () => ({
  removeUser: jest.fn(),
}));

const { removeLicense } = require('./geminiService');
const iamService = require('./iamService');

beforeEach(() => {
  mockPost.mockResolvedValue({ data: {} });
});

describe('removeLicense', () => {
  test('caminho normal: remove IAM e prossegue removendo a licença', async () => {
    iamService.removeUser.mockResolvedValue();

    await removeLicense('user@example.com');

    expect(iamService.removeUser).toHaveBeenCalledWith('user@example.com');
    expect(mockPost).toHaveBeenCalledWith(
      '/userStores/default_user_store:batchUpdateUserLicenses',
      expect.objectContaining({
        inlineSource: {
          userLicenses: [{ userPrincipal: 'user@example.com', licenseConfig: '' }],
        },
        deleteUnassignedUserLicenses: true,
      })
    );
  });

  test('IAM 404 (role/usuário não encontrado) é tratado como sucesso e a licença é removida', async () => {
    const err = Object.assign(new Error('Usuário não encontrado com essa role'), { status: 404 });
    iamService.removeUser.mockRejectedValue(err);

    await removeLicense('user@example.com');

    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  test('erro real do IAM aborta a operação e não remove a licença', async () => {
    const err = new Error('boom');
    iamService.removeUser.mockRejectedValue(err);

    const thrown = await removeLicense('user@example.com').catch((e) => e);

    expect(thrown.status).toBe(502);
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('erro do IAM com status diferente de 404 também aborta a operação', async () => {
    const err = Object.assign(new Error('falha no setIamPolicy'), { status: 500 });
    iamService.removeUser.mockRejectedValue(err);

    const thrown = await removeLicense('user@example.com').catch((e) => e);

    expect(thrown.status).toBe(502);
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('normaliza o email antes de chamar iamService.removeUser', async () => {
    iamService.removeUser.mockResolvedValue();

    await removeLicense('  User@Example.COM  ');

    expect(iamService.removeUser).toHaveBeenCalledWith('user@example.com');
  });
});
