jest.mock('../middleware/requireAuth', () => (req, res, next) => {
  req.operator = { email: 'operador.teste@edglobo.com.br', name: 'Operador Teste', oid: 'oid-teste' };
  next();
});

jest.mock('../services/billingService', () => ({
  getBillingSummary: jest.fn(),
}));

// As mesmas rotas já existentes precisam continuar "carregáveis" pelo app.js
// completo — reaproveita os mocks já usados por gemini.test.js/iam.test.js
// para as dependências delas.
jest.mock('../services/geminiService', () => ({
  listLicenseConfigs: jest.fn(), listUserLicenses: jest.fn(), assignLicense: jest.fn(), removeLicense: jest.fn(),
}));
jest.mock('../services/iamService', () => ({
  listUsers: jest.fn(), addUser: jest.fn(), removeUser: jest.fn(), addCodeAssistUser: jest.fn(), removeCodeAssistUser: jest.fn(),
}));
jest.mock('../services/gcpAuth', () => ({ auth: {}, getAccessToken: jest.fn() }));
jest.mock('googleapis', () => ({
  google: { cloudresourcemanager: jest.fn().mockReturnValue({ projects: {} }), bigquery: jest.fn().mockReturnValue({ jobs: {} }) },
}));

const request = require('supertest');
const app = require('../app');
const { getBillingSummary } = require('../services/billingService');

describe('GET /api/billing/summary', () => {
  test('retorna o resumo com status 200', async () => {
    const summary = {
      licenses: 100,
      vertexApi: 0,
      infra: 10,
      uncategorized: 0,
      total: 110,
      currency: 'BRL',
      items: {
        licenses: [{ service: 'Vertex AI Search', cost: 100, skus: [{ sku: 'Query API', cost: 100 }] }],
        vertexApi: [],
        infra: [{ service: 'Cloud Run', cost: 10, skus: [{ sku: 'CPU Allocation Time', cost: 10 }] }],
        uncategorized: [],
      },
      licensesByProject: { total: 100, byProject: {} },
      apiByProject: { total: 0, byProject: {} },
      updatedAt: '2026-08-06T12:00:00.000Z',
    };
    getBillingSummary.mockResolvedValue(summary);

    const res = await request(app).get('/api/billing/summary');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(summary);
  });

  test('retorna 500 quando o serviço falha', async () => {
    getBillingSummary.mockRejectedValue(new Error('BigQuery indisponível'));
    const res = await request(app).get('/api/billing/summary');
    expect(res.status).toBe(500);
  });
});
