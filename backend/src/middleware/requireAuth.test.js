const jwt = require('jsonwebtoken');

const OLD_ENV = process.env;

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('requireAuth', () => {
  let requireAuth;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, SESSION_JWT_SECRET: 'segredo-de-teste' };
    // eslint-disable-next-line global-require
    requireAuth = require('./requireAuth');
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('anexa req.operator e chama next() com token válido', () => {
    const token = jwt.sign(
      { email: 'operador@edglobo.com.br', name: 'Operador Teste', oid: 'oid-123' },
      'segredo-de-teste',
      { algorithm: 'HS256', expiresIn: '8h' },
    );
    const req = { cookies: { session: token } };
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.operator).toEqual({
      email: 'operador@edglobo.com.br',
      name: 'Operador Teste',
      oid: 'oid-123',
    });
  });

  test('retorna 401 quando o cookie de sessão está ausente', () => {
    const req = { cookies: {} };
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Não autenticado' });
    expect(next).not.toHaveBeenCalled();
  });

  test('retorna 401 quando não há objeto cookies na requisição', () => {
    const req = {};
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('retorna 401 quando o token está expirado', () => {
    const token = jwt.sign(
      { email: 'operador@edglobo.com.br', name: 'Operador Teste', oid: 'oid-123' },
      'segredo-de-teste',
      { algorithm: 'HS256', expiresIn: -10 },
    );
    const req = { cookies: { session: token } };
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Sessão inválida ou expirada' });
    expect(next).not.toHaveBeenCalled();
  });

  test('retorna 401 quando o token está malformado', () => {
    const req = { cookies: { session: 'isso-nao-e-um-jwt' } };
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('retorna 401 quando o token foi assinado com outro segredo', () => {
    const token = jwt.sign(
      { email: 'atacante@fora.com', name: 'X', oid: 'y' },
      'segredo-errado',
      { algorithm: 'HS256', expiresIn: '8h' },
    );
    const req = { cookies: { session: token } };
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
