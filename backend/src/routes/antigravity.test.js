jest.mock('../middleware/requireAuth', () => (req, res, next) => {
  req.operator = { email: 'operador.teste@edglobo.com.br', name: 'Operador Teste', oid: 'oid-teste' };
  next();
});

jest.mock('../services/antigravityService', () => ({
  getAntigravityUsage: jest.fn(),
}));

// O app.js completo carrega as outras rotas — mesmos mocks de billing.test.js.
jest.mock('../services/geminiService', () => ({
  listLicenseConfigs: jest.fn(), listUserLicenses: jest.fn(), assignLicense: jest.fn(), removeLicense: jest.fn(),
}));
jest.mock('../services/iamService', () => ({
  listUsers: jest.fn(), addUser: jest.fn(), removeUser: jest.fn(), addCodeAssistUser: jest.fn(), removeCodeAssistUser: jest.fn(),
}));
jest.mock('../services/billingService', () => ({ getBillingSummary: jest.fn() }));
jest.mock('../services/gcpAuth', () => ({ auth: {}, getAccessToken: jest.fn() }));
jest.mock('googleapis', () => ({
  google: { cloudresourcemanager: jest.fn().mockReturnValue({ projects: {} }), bigquery: jest.fn().mockReturnValue({ jobs: {} }) },
}));

const request = require('supertest');
const app = require('../app');
const { getAntigravityUsage } = require('../services/antigravityService');

describe('GET /api/antigravity/usage', () => {
  test('retorna since e usage com status 200', async () => {
    const body = { since: '2026-11-24', usage: { 'a@x.com': { lastUse: '2026-11-24T19:39:56.544Z', activeDays: 1 } } };
    getAntigravityUsage.mockResolvedValue(body);

    const res = await request(app).get('/api/antigravity/usage');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(body);
  });

  test('erro do BigQuery vira resposta de erro, não 200', async () => {
    getAntigravityUsage.mockRejectedValue(new Error('Not found: Dataset'));

    const res = await request(app).get('/api/antigravity/usage');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Not found: Dataset');
  });
});
