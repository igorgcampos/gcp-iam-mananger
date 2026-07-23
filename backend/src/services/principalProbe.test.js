jest.mock('googleapis', () => ({
  google: {
    cloudresourcemanager: jest.fn().mockReturnValue({
      projects: {
        getIamPolicy: jest.fn(),
        setIamPolicy: jest.fn(),
      },
    }),
    iam: jest.fn().mockReturnValue({
      projects: {
        roles: {
          get: jest.fn(),
          create: jest.fn(),
        },
      },
    }),
  },
}));

jest.mock('./gcpAuth', () => ({ auth: {} }));

jest.mock('./iamPolicyStore', () => ({
  setPolicy: jest.fn(),
}));

const { ensureProbeRole, validateAndCleanup } = require('./principalProbe');
const { setPolicy } = require('./iamPolicyStore');

const { google } = require('googleapis');
const iam = google.iam.mock.results[0].value;
const { get: getRole, create: createRole } = iam.projects.roles;

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const ROLE_NAME = `projects/${PROJECT_ID}/roles/iamValidationProbe`;

describe('ensureProbeRole', () => {
  test('não recria a role quando ela já existe', async () => {
    getRole.mockResolvedValue({ data: { name: ROLE_NAME } });

    await ensureProbeRole();

    expect(getRole).toHaveBeenCalledWith({ name: ROLE_NAME });
    expect(createRole).not.toHaveBeenCalled();
  });

  test('cria a role quando ela ainda não existe (404)', async () => {
    const notFound = new Error('not found');
    notFound.code = 404;
    getRole.mockRejectedValue(notFound);
    createRole.mockResolvedValue({ data: { name: ROLE_NAME } });

    await ensureProbeRole();

    expect(createRole).toHaveBeenCalledWith({
      parent: `projects/${PROJECT_ID}`,
      requestBody: {
        roleId: 'iamValidationProbe',
        role: expect.objectContaining({
          includedPermissions: ['resourcemanager.projects.get'],
        }),
      },
    });
  });
});

describe('validateAndCleanup', () => {
  beforeEach(() => {
    getRole.mockResolvedValue({ data: { name: ROLE_NAME } });
  });

  test('quando o probe aceita o principal, remove o binding de teste e resolve com a policy limpa', async () => {
    setPolicy.mockResolvedValue({
      etag: 'novo-etag',
      bindings: [
        { role: ROLE_NAME, members: ['user:valido@exemplo.com'], condition: { title: 'x' } },
      ],
    });

    const policy = { etag: 'etag-original', bindings: [] };
    const result = await validateAndCleanup(policy, 'valido@exemplo.com');

    expect(setPolicy).toHaveBeenCalledTimes(1);
    const probeAttempt = setPolicy.mock.calls[0][0];
    const probeBinding = probeAttempt.bindings.find((b) => b.role === ROLE_NAME);
    expect(probeBinding.members).toEqual(['user:valido@exemplo.com']);

    const match = probeBinding.condition.expression.match(/timestamp\("(.+)"\)/);
    const expiresAt = new Date(match[1]).getTime();
    const deltaMs = expiresAt - Date.now();
    expect(deltaMs).toBeGreaterThan(4 * 60 * 1000);
    expect(deltaMs).toBeLessThanOrEqual(5 * 60 * 1000);

    expect(result.bindings.find((b) => b.role === ROLE_NAME)).toBeUndefined();
  });

  test('quando o probe rejeita por "does not exist", lança erro 422 sem escrever nada mais', async () => {
    const gcpError = new Error('User invalido@exemplo.com does not exist.');
    setPolicy.mockRejectedValue(gcpError);

    const policy = { etag: 'etag-original', bindings: [] };
    const err = await validateAndCleanup(policy, 'invalido@exemplo.com').catch((e) => e);

    expect(err.status).toBe(422);
    expect(err.message).toMatch(/AD/);
  });

  test('quando o probe falha por outro motivo técnico, lança erro genérico 500 sem mencionar AD', async () => {
    const gcpError = new Error('The caller does not have permission');
    gcpError.code = 403;
    setPolicy.mockRejectedValue(gcpError);

    const policy = { etag: 'etag-original', bindings: [] };
    const err = await validateAndCleanup(policy, 'qualquer@exemplo.com').catch((e) => e);

    expect(err.status).toBe(500);
    expect(err.message).not.toMatch(/AD/);
  });
});
