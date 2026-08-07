const mockGetAuthCodeUrl = jest.fn();
const mockAcquireTokenByCode = jest.fn();

jest.mock('../services/msalClient', () => ({
  getMsalClient: jest.fn(() => ({
    getAuthCodeUrl: mockGetAuthCodeUrl,
    acquireTokenByCode: mockAcquireTokenByCode,
  })),
}));

jest.mock('../services/graphGroupCheck', () => ({
  isMemberOfAllowedGroup: jest.fn(),
}));

// As rotas mutáveis exigem requireAuth; para os testes de auth isso não é
// relevante (auth.js é montado antes do requireAuth em app.js), mas mockamos
// os serviços do GCP para o app conseguir subir sem credenciais reais.
jest.mock('../services/iamService', () => ({
  listUsers: jest.fn(), addUser: jest.fn(), removeUser: jest.fn(),
  addCodeAssistUser: jest.fn(), removeCodeAssistUser: jest.fn(),
}));
jest.mock('../services/geminiService', () => ({
  listLicenseConfigs: jest.fn(), listUserLicenses: jest.fn(), assignLicense: jest.fn(), removeLicense: jest.fn(),
}));
jest.mock('../services/billingService', () => ({ getBillingSummary: jest.fn() }));
jest.mock('../services/gcpAuth', () => ({ auth: {}, getAccessToken: jest.fn() }));
jest.mock('googleapis', () => ({
  google: { cloudresourcemanager: jest.fn().mockReturnValue({ projects: {} }) },
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { isMemberOfAllowedGroup } = require('../services/graphGroupCheck');

const OLD_ENV = process.env;

// Env vars lidas em tempo de chamada (não no load do módulo) pelas rotas de
// auth — por isso não é preciso jest.resetModules() aqui. Mantemos uma única
// instância de `app` e dos mocks de serviço ao longo dos testes deste
// arquivo (clearMocks do jest.config já limpa mock.calls entre testes).
process.env = {
  ...OLD_ENV,
  SESSION_JWT_SECRET: 'segredo-de-teste',
  FRONTEND_BASE_URL: 'http://localhost:5173',
  AZURE_TENANT_ID: 'tenant-teste',
  AZURE_CLIENT_ID: 'client-teste',
  AZURE_CLIENT_SECRET: 'secret-teste',
  AZURE_ALLOWED_GROUP_ID: 'grupo-permitido',
};

// eslint-disable-next-line global-require
const app = require('../app');

describe('auth routes', () => {
  afterAll(() => {
    process.env = OLD_ENV;
  });

  describe('GET /auth/me', () => {
    test('retorna 401 sem cookie de sessão', async () => {
      const res = await request(app).get('/auth/me');
      expect(res.status).toBe(401);
    });

    test('retorna email e name com cookie de sessão válido', async () => {
      const token = jwt.sign(
        { email: 'operador@edglobo.com.br', name: 'Operador', oid: 'oid-1' },
        'segredo-de-teste',
        { algorithm: 'HS256', expiresIn: '8h' },
      );
      const res = await request(app).get('/auth/me').set('Cookie', [`session=${token}`]);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ email: 'operador@edglobo.com.br', name: 'Operador' });
    });

    test('retorna 401 com cookie de sessão expirado', async () => {
      const token = jwt.sign(
        { email: 'operador@edglobo.com.br', name: 'Operador', oid: 'oid-1' },
        'segredo-de-teste',
        { algorithm: 'HS256', expiresIn: -10 },
      );
      const res = await request(app).get('/auth/me').set('Cookie', [`session=${token}`]);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/logout', () => {
    test('limpa o cookie de sessão e retorna 204', async () => {
      const res = await request(app).post('/auth/logout');
      expect(res.status).toBe(204);
      const setCookie = res.headers['set-cookie'] || [];
      expect(setCookie.some((c) => c.startsWith('session=;') || c.includes('session=;'))).toBe(true);
    });
  });

  describe('GET /auth/login', () => {
    test('seta cookie de state e redireciona para a URL de autorização', async () => {
      mockGetAuthCodeUrl.mockResolvedValue('https://login.microsoftonline.com/tenant-teste/oauth2/v2.0/authorize?...');

      const res = await request(app).get('/auth/login');

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('login.microsoftonline.com');
      expect(mockGetAuthCodeUrl).toHaveBeenCalledWith(expect.objectContaining({
        scopes: ['openid', 'profile', 'email'],
      }));
      const setCookie = res.headers['set-cookie'] || [];
      expect(setCookie.some((c) => c.startsWith('oauth_state='))).toBe(true);
    });

    test('deriva o redirect_uri preservando a porta do Host da requisição', async () => {
      // Regressão: um proxy (nginx/Vite) que repasse o Host sem a porta faz
      // o backend gerar um redirect_uri inválido (ex.: sem a porta 8080 do
      // docker-compose) — ver docs/sso-pedidos-time-ad.md, item 4.
      mockGetAuthCodeUrl.mockResolvedValue('https://login.microsoftonline.com/tenant-teste/oauth2/v2.0/authorize?...');

      await request(app).get('/auth/login').set('Host', 'localhost:8080');

      expect(mockGetAuthCodeUrl).toHaveBeenCalledWith(expect.objectContaining({
        redirectUri: 'http://localhost:8080/auth/callback',
      }));
    });

    test('prioriza X-Forwarded-Host sobre o Host quando os dois vêm preenchidos', async () => {
      // Regressão: no Cloud Run, o nginx do frontend precisa mandar Host =
      // hostname do backend (senão o front-end do Google não roteia a
      // requisição — cai num 404 genérico, nunca chega no Express). O host
      // original do browser (necessário pro redirect_uri) chega à parte, em
      // X-Forwarded-Host — ver frontend/nginx/default.conf.template. Sem essa
      // priorização, o redirect_uri sairia com o hostname do backend em vez
      // do domínio público do painel.
      mockGetAuthCodeUrl.mockResolvedValue('https://login.microsoftonline.com/tenant-teste/oauth2/v2.0/authorize?...');

      await request(app)
        .get('/auth/login')
        .set('Host', 'gcp-iam-manager-backend-yhs7dusmaa-uk.a.run.app')
        .set('X-Forwarded-Host', 'gcp-admin.edglobo.com.br');

      expect(mockGetAuthCodeUrl).toHaveBeenCalledWith(expect.objectContaining({
        redirectUri: 'http://gcp-admin.edglobo.com.br/auth/callback',
      }));
    });
  });

  describe('GET /auth/callback', () => {
    test('redireciona para access_denied quando o state não bate', async () => {
      const res = await request(app)
        .get('/auth/callback?state=errado&code=abc')
        .set('Cookie', ['oauth_state=certo']);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/?error=access_denied');
      expect(mockAcquireTokenByCode).not.toHaveBeenCalled();
    });

    test('redireciona para access_denied quando o provedor retorna erro', async () => {
      const res = await request(app)
        .get('/auth/callback?error=access_denied&error_description=cancelado');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/?error=access_denied');
    });

    test('quando o Operador NÃO pertence ao grupo: não seta cookie de sessão e redireciona com access_denied', async () => {
      mockAcquireTokenByCode.mockResolvedValue({
        account: {
          idTokenClaims: { oid: 'oid-fora-do-grupo', preferred_username: 'fora@edglobo.com.br', name: 'Fora Do Grupo' },
        },
      });
      isMemberOfAllowedGroup.mockResolvedValue(false);

      const res = await request(app)
        .get('/auth/callback?state=certo&code=abc123')
        .set('Cookie', ['oauth_state=certo']);

      expect(isMemberOfAllowedGroup).toHaveBeenCalledWith('oid-fora-do-grupo');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/?error=access_denied');
      const setCookie = res.headers['set-cookie'] || [];
      expect(setCookie.some((c) => c.startsWith('session=') && !c.startsWith('session=;'))).toBe(false);
    });

    test('quando o Operador pertence ao grupo: seta cookie de sessão e redireciona para o frontend', async () => {
      mockAcquireTokenByCode.mockResolvedValue({
        account: {
          idTokenClaims: { oid: 'oid-do-grupo', preferred_username: 'membro@edglobo.com.br', name: 'Membro Do Grupo' },
        },
      });
      isMemberOfAllowedGroup.mockResolvedValue(true);

      const res = await request(app)
        .get('/auth/callback?state=certo&code=abc123')
        .set('Cookie', ['oauth_state=certo']);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/');
      const setCookie = res.headers['set-cookie'] || [];
      const sessionCookie = setCookie.find((c) => c.startsWith('session='));
      expect(sessionCookie).toBeDefined();

      const token = sessionCookie.split(';')[0].split('=')[1];
      const claims = jwt.verify(token, 'segredo-de-teste');
      expect(claims.email).toBe('membro@edglobo.com.br');
      expect(claims.oid).toBe('oid-do-grupo');
    });

    test('redireciona para access_denied quando a checagem de grupo falha tecnicamente', async () => {
      mockAcquireTokenByCode.mockResolvedValue({
        account: {
          idTokenClaims: { oid: 'oid-x', preferred_username: 'x@edglobo.com.br', name: 'X' },
        },
      });
      isMemberOfAllowedGroup.mockRejectedValue(new Error('Graph indisponível'));

      const res = await request(app)
        .get('/auth/callback?state=certo&code=abc123')
        .set('Cookie', ['oauth_state=certo']);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/?error=access_denied');
    });
  });
});
