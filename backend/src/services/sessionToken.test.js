const OLD_ENV = process.env;

describe('sessionToken', () => {
  let signSessionToken;
  let verifySessionToken;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, SESSION_JWT_SECRET: 'segredo-de-teste' };
    // eslint-disable-next-line global-require
    ({ signSessionToken, verifySessionToken } = require('./sessionToken'));
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('assina e verifica um token válido preservando os claims', () => {
    const token = signSessionToken({ email: 'a@b.com', name: 'A B', oid: 'oid-1' });
    const claims = verifySessionToken(token);

    expect(claims.email).toBe('a@b.com');
    expect(claims.name).toBe('A B');
    expect(claims.oid).toBe('oid-1');
    expect(claims.exp).toBeDefined();
  });

  test('lança erro ao verificar token assinado com outro segredo', () => {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ email: 'a@b.com' }, 'outro-segredo', { algorithm: 'HS256' });

    expect(() => verifySessionToken(token)).toThrow();
  });

  test('lança erro quando SESSION_JWT_SECRET não está configurado', () => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    delete process.env.SESSION_JWT_SECRET;
    // eslint-disable-next-line global-require
    const { signSessionToken: sign } = require('./sessionToken');

    expect(() => sign({ email: 'a@b.com' })).toThrow(/SESSION_JWT_SECRET/);
  });
});
