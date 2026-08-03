jest.mock('../middleware/requireAuth', () => (req, res, next) => {
  req.operator = { email: 'operador.teste@edglobo.com.br', name: 'Operador Teste', oid: 'oid-teste' };
  next();
});

jest.mock('../services/geminiService', () => ({
  listLicenseConfigs: jest.fn(),
  listUserLicenses: jest.fn(),
  assignLicense: jest.fn(),
  removeLicense: jest.fn(),
}));

jest.mock('../services/iamService', () => ({
  listUsers: jest.fn(),
  addUser: jest.fn(),
  removeUser: jest.fn(),
}));

jest.mock('../services/gcpAuth', () => ({ auth: {}, getAccessToken: jest.fn() }));

jest.mock('googleapis', () => ({
  google: { cloudresourcemanager: jest.fn().mockReturnValue({ projects: {} }) },
}));

const request = require('supertest');
const app = require('../app');
const {
  listLicenseConfigs, listUserLicenses, assignLicense, removeLicense,
} = require('../services/geminiService');

const MOCK_CONFIG = { name: 'licenseConfigs/1', subscriptionTier: 'SUBSCRIPTION_TIER_ENTERPRISE', licenseCount: '10' };
const MOCK_USER = { userPrincipal: 'a@b.com', licenseConfig: 'licenseConfigs/1', licenseAssignmentState: 'ASSIGNED' };

describe('GET /api/gemini/license-configs', () => {
  test('retorna lista de configs com status 200', async () => {
    listLicenseConfigs.mockResolvedValue([MOCK_CONFIG]);
    const res = await request(app).get('/api/gemini/license-configs');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([MOCK_CONFIG]);
  });

  test('retorna 500 quando serviço falha', async () => {
    listLicenseConfigs.mockRejectedValue(new Error('API error'));
    const res = await request(app).get('/api/gemini/license-configs');
    expect(res.status).toBe(500);
  });
});

describe('GET /api/gemini/users', () => {
  test('retorna lista de usuários com status 200', async () => {
    listUserLicenses.mockResolvedValue([MOCK_USER]);
    const res = await request(app).get('/api/gemini/users');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([MOCK_USER]);
  });
});

describe('POST /api/gemini/users', () => {
  test('retorna 201 ao atribuir licença', async () => {
    assignLicense.mockResolvedValue({ userPrincipal: 'novo@b.com' });
    const res = await request(app)
      .post('/api/gemini/users')
      .send({ email: 'novo@b.com', licenseConfig: 'licenseConfigs/1' });
    expect(res.status).toBe(201);
    expect(assignLicense).toHaveBeenCalledWith('novo@b.com', 'licenseConfigs/1');
  });

  test('normaliza email para minúsculas', async () => {
    assignLicense.mockResolvedValue({});
    await request(app)
      .post('/api/gemini/users')
      .send({ email: 'NOVO@B.COM', licenseConfig: 'licenseConfigs/1' });
    expect(assignLicense).toHaveBeenCalledWith('novo@b.com', 'licenseConfigs/1');
  });

  test('retorna 400 sem email', async () => {
    const res = await request(app)
      .post('/api/gemini/users')
      .send({ licenseConfig: 'licenseConfigs/1' });
    expect(res.status).toBe(400);
    expect(assignLicense).not.toHaveBeenCalled();
  });

  test('retorna 400 sem licenseConfig', async () => {
    const res = await request(app)
      .post('/api/gemini/users')
      .send({ email: 'novo@b.com' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Licença obrigatória' });
    expect(assignLicense).not.toHaveBeenCalled();
  });

  test('retorna 400 com email inválido', async () => {
    const res = await request(app)
      .post('/api/gemini/users')
      .send({ email: 'invalido', licenseConfig: 'licenseConfigs/1' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/gemini/users/:email', () => {
  test('retorna 204 ao remover com sucesso', async () => {
    removeLicense.mockResolvedValue();
    const res = await request(app).delete('/api/gemini/users/user%40b.com');
    expect(res.status).toBe(204);
    expect(removeLicense).toHaveBeenCalledWith('user@b.com');
  });

  test('retorna 500 quando serviço falha', async () => {
    removeLicense.mockRejectedValue(new Error('API error'));
    const res = await request(app).delete('/api/gemini/users/user%40b.com');
    expect(res.status).toBe(500);
  });
});
