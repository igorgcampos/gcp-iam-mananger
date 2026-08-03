jest.mock('../middleware/requireAuth', () => (req, res, next) => {
  req.operator = { email: 'operador.teste@edglobo.com.br', name: 'Operador Teste', oid: 'oid-teste' };
  next();
});

jest.mock('../services/iamService', () => ({
  listUsers: jest.fn(),
  addUser: jest.fn(),
  removeUser: jest.fn(),
  addCodeAssistUser: jest.fn(),
  removeCodeAssistUser: jest.fn(),
}));

jest.mock('../services/geminiService', () => ({
  listLicenseConfigs: jest.fn(),
  listUserLicenses: jest.fn(),
  assignLicense: jest.fn(),
  removeLicense: jest.fn(),
}));

jest.mock('../services/gcpAuth', () => ({ auth: {}, getAccessToken: jest.fn() }));

jest.mock('googleapis', () => ({
  google: { cloudresourcemanager: jest.fn().mockReturnValue({ projects: {} }) },
}));

const request = require('supertest');
const app = require('../app');
const { listUsers, addUser, removeUser, addCodeAssistUser, removeCodeAssistUser } = require('../services/iamService');

describe('GET /api/iam/users', () => {
  test('retorna lista de usuários com status 200', async () => {
    listUsers.mockResolvedValue([{ email: 'a@b.com', principal: 'principal://a@b.com' }]);
    const res = await request(app).get('/api/iam/users');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ email: 'a@b.com', principal: 'principal://a@b.com' }]);
  });

  test('retorna 500 quando serviço falha', async () => {
    listUsers.mockRejectedValue(new Error('GCP error'));
    const res = await request(app).get('/api/iam/users');
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });
});

describe('POST /api/iam/users', () => {
  test('retorna 201 com usuário criado', async () => {
    addUser.mockResolvedValue({ email: 'novo@b.com', principal: 'principal://novo@b.com' });
    const res = await request(app)
      .post('/api/iam/users')
      .send({ email: 'novo@b.com' });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe('novo@b.com');
  });

  test('normaliza email para minúsculas antes de chamar o serviço', async () => {
    addUser.mockResolvedValue({ email: 'novo@b.com', principal: '' });
    await request(app).post('/api/iam/users').send({ email: 'NOVO@B.COM' });
    expect(addUser).toHaveBeenCalledWith('novo@b.com', { codeAssist: false });
  });

  test('envia codeAssist=true quando o checkbox foi marcado', async () => {
    addUser.mockResolvedValue({ email: 'novo@b.com', principal: '', codeAssist: { granted: true } });
    await request(app).post('/api/iam/users').send({ email: 'novo@b.com', codeAssist: true });
    expect(addUser).toHaveBeenCalledWith('novo@b.com', { codeAssist: true });
  });

  test('envia codeAssist=false por padrão quando não informado', async () => {
    addUser.mockResolvedValue({ email: 'novo@b.com', principal: '' });
    await request(app).post('/api/iam/users').send({ email: 'novo@b.com' });
    expect(addUser).toHaveBeenCalledWith('novo@b.com', { codeAssist: false });
  });

  test('retorna 400 sem email', async () => {
    const res = await request(app).post('/api/iam/users').send({});
    expect(res.status).toBe(400);
    expect(addUser).not.toHaveBeenCalled();
  });

  test('retorna 400 com email inválido', async () => {
    const res = await request(app).post('/api/iam/users').send({ email: 'invalido' });
    expect(res.status).toBe(400);
    expect(addUser).not.toHaveBeenCalled();
  });

  test('retorna 409 quando usuário já existe', async () => {
    const err = new Error('Usuário já possui essa permissão');
    err.status = 409;
    addUser.mockRejectedValue(err);
    const res = await request(app).post('/api/iam/users').send({ email: 'ja@existe.com' });
    expect(res.status).toBe(409);
  });

  test('retorna 422 quando o probe de validação indica que o usuário não está sincronizado', async () => {
    const err = new Error('Usuário não sincronizado. Solicite ao time de AD.');
    err.status = 422;
    addUser.mockRejectedValue(err);
    const res = await request(app).post('/api/iam/users').send({ email: 'naosincronizado@b.com' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/AD/);
  });
});

describe('DELETE /api/iam/users/:email', () => {
  test('retorna 204 ao remover com sucesso', async () => {
    removeUser.mockResolvedValue();
    const res = await request(app).delete('/api/iam/users/user%40b.com');
    expect(res.status).toBe(204);
    expect(removeUser).toHaveBeenCalledWith('user@b.com');
  });

  test('retorna 404 quando usuário não encontrado', async () => {
    const err = new Error('Usuário não encontrado com essa role');
    err.status = 404;
    removeUser.mockRejectedValue(err);
    const res = await request(app).delete('/api/iam/users/nao%40existe.com');
    expect(res.status).toBe(404);
  });

  test('retorna 502 quando a revogação do Code Assist bloqueia a remoção', async () => {
    const err = new Error('Falha ao revogar Code Assist; discoveryengine.user não foi removido.');
    err.status = 502;
    removeUser.mockRejectedValue(err);
    const res = await request(app).delete('/api/iam/users/user%40b.com');
    expect(res.status).toBe(502);
  });
});

describe('POST /api/iam/users/:email/code-assist', () => {
  test('retorna 201 ao conceder Code Assist', async () => {
    addCodeAssistUser.mockResolvedValue({ email: 'a@b.com', member: 'user:a@b.com' });
    const res = await request(app).post('/api/iam/users/a%40b.com/code-assist');
    expect(res.status).toBe(201);
    expect(addCodeAssistUser).toHaveBeenCalledWith('a@b.com');
  });

  test('retorna 409 quando o usuário já possui Code Assist', async () => {
    const err = new Error('Usuário já possui essa permissão');
    err.status = 409;
    addCodeAssistUser.mockRejectedValue(err);
    const res = await request(app).post('/api/iam/users/a%40b.com/code-assist');
    expect(res.status).toBe(409);
  });

  test('retorna 422 quando o probe indica que o usuário não está sincronizado', async () => {
    const err = new Error('Usuário não sincronizado. Solicite ao time de AD.');
    err.status = 422;
    addCodeAssistUser.mockRejectedValue(err);
    const res = await request(app).post('/api/iam/users/a%40b.com/code-assist');
    expect(res.status).toBe(422);
  });

  test('retorna 404 quando o usuário não possui discoveryengine.user', async () => {
    const err = new Error('Usuário precisa ter discoveryengine.user antes de receber o Code Assist');
    err.status = 404;
    addCodeAssistUser.mockRejectedValue(err);
    const res = await request(app).post('/api/iam/users/semrole%40b.com/code-assist');
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/iam/users/:email/code-assist', () => {
  test('retorna 204 ao revogar Code Assist', async () => {
    removeCodeAssistUser.mockResolvedValue();
    const res = await request(app).delete('/api/iam/users/a%40b.com/code-assist');
    expect(res.status).toBe(204);
    expect(removeCodeAssistUser).toHaveBeenCalledWith('a@b.com');
  });

  test('retorna 404 quando o usuário não possui Code Assist', async () => {
    const err = new Error('Usuário não encontrado com essa role');
    err.status = 404;
    removeCodeAssistUser.mockRejectedValue(err);
    const res = await request(app).delete('/api/iam/users/a%40b.com/code-assist');
    expect(res.status).toBe(404);
  });
});
