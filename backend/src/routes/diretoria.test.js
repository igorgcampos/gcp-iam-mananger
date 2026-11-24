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

jest.mock('../services/billingService', () => ({ getBillingSummary: jest.fn() }));
jest.mock('../services/antigravityService', () => ({ getAntigravityUsage: jest.fn() }));

jest.mock('../services/gcpAuth', () => ({ auth: {}, getAccessToken: jest.fn() }));

jest.mock('googleapis', () => ({
  google: { cloudresourcemanager: jest.fn().mockReturnValue({ projects: {} }) },
}));

jest.mock('../services/diretoriaService', () => ({ getDiretorias: jest.fn() }));

const request = require('supertest');
const app = require('../app');
const { getDiretorias } = require('../services/diretoriaService');

const URL = '/api/diretoria/lookup';

describe('POST /api/diretoria/lookup', () => {
  test('200 com o mapa do serviço', async () => {
    getDiretorias.mockResolvedValue({ 'a@b.com': 'TECNOLOGIA', 'c@d.com': null });

    const res = await request(app).post(URL).send({ emails: ['a@b.com', 'c@d.com'] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ diretorias: { 'a@b.com': 'TECNOLOGIA', 'c@d.com': null } });
    expect(getDiretorias).toHaveBeenCalledWith(['a@b.com', 'c@d.com']);
  });

  test('400 sem emails', async () => {
    const res = await request(app).post(URL).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
    expect(getDiretorias).not.toHaveBeenCalled();
  });

  test('400 com item não-string', async () => {
    const res = await request(app).post(URL).send({ emails: ['a@b.com', 42] });
    expect(res.status).toBe(400);
    expect(getDiretorias).not.toHaveBeenCalled();
  });

  test('400 com mais de 1000 e-mails', async () => {
    const emails = Array.from({ length: 1001 }, (_, i) => `u${i}@x.com`);
    const res = await request(app).post(URL).send({ emails });
    expect(res.status).toBe(400);
    expect(getDiretorias).not.toHaveBeenCalled();
  });

  test('502 quando o Graph falha', async () => {
    const err = new Error('Bad Gateway');
    err.response = { status: 502 };
    getDiretorias.mockRejectedValue(err);

    const res = await request(app).post(URL).send({ emails: ['a@b.com'] });

    expect(res.status).toBe(502);
  });
});
