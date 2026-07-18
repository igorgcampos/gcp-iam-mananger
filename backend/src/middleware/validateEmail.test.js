const validateEmail = require('./validateEmail');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('validateEmail', () => {
  let next;

  beforeEach(() => {
    next = jest.fn();
  });

  test('chama next() com email válido', () => {
    validateEmail({ body: { email: 'user@example.com' } }, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('chama next() com email de subdomínio', () => {
    validateEmail({ body: { email: 'user@mail.edglobo.com.br' } }, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  test('retorna 400 quando email está ausente no body', () => {
    const res = mockRes();
    validateEmail({ body: {} }, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Email inválido' });
    expect(next).not.toHaveBeenCalled();
  });

  test('retorna 400 com string vazia', () => {
    const res = mockRes();
    validateEmail({ body: { email: '' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('retorna 400 sem @', () => {
    const res = mockRes();
    validateEmail({ body: { email: 'naoehmail' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('retorna 400 com espaço no email', () => {
    const res = mockRes();
    validateEmail({ body: { email: 'user @example.com' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('retorna 400 sem domínio após @', () => {
    const res = mockRes();
    validateEmail({ body: { email: 'user@' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('retorna 400 sem ponto no domínio', () => {
    const res = mockRes();
    validateEmail({ body: { email: 'user@dominio' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
