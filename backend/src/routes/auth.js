const { Router } = require('express');
const crypto = require('crypto');
const { getMsalClient } = require('../services/msalClient');
const { isMemberOfAllowedGroup } = require('../services/graphGroupCheck');
const {
  signSessionToken,
  verifySessionToken,
  SESSION_COOKIE_NAME,
} = require('../services/sessionToken');
const asyncRoute = require('../middleware/asyncRoute');

const router = Router();

const STATE_COOKIE_NAME = 'oauth_state';
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // ~8h, mesmo TTL do JWT
const STATE_MAX_AGE_MS = 5 * 60 * 1000;

const isProduction = () => process.env.NODE_ENV === 'production';

// O redirect_uri é derivado da própria requisição (protocolo + host) em vez
// de uma env var fixa: funciona em dev (http://localhost:3001/auth/callback,
// via proxy do Vite) e em produção (https://gcp-admin.edglobo.com.br/auth/callback,
// via proxy do nginx) sem precisar de configuração adicional — desde que o
// Express confie no cabeçalho X-Forwarded-Proto (ver app.set('trust proxy')
// em app.js). Ambos os valores precisam estar cadastrados como Redirect URIs
// válidos no App Registration do Entra ID (ver docs/sso-pedidos-time-ad.md).
function buildRedirectUri(req) {
  return `${req.protocol}://${req.get('host')}/auth/callback`;
}

function frontendUrl(path = '') {
  const base = (process.env.FRONTEND_BASE_URL || '').replace(/\/$/, '');
  return `${base}${path}`;
}

function cookieOptions(maxAge) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    maxAge,
  };
}

router.get('/login', asyncRoute(async (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie(STATE_COOKIE_NAME, state, cookieOptions(STATE_MAX_AGE_MS));

  const authUrl = await getMsalClient().getAuthCodeUrl({
    scopes: ['openid', 'profile', 'email'],
    redirectUri: buildRedirectUri(req),
    state,
  });

  res.redirect(authUrl);
}));

router.get('/callback', asyncRoute(async (req, res) => {
  const { state, code, error, error_description: errorDescription } = req.query;
  const expectedState = req.cookies?.[STATE_COOKIE_NAME];
  res.clearCookie(STATE_COOKIE_NAME);

  if (error) {
    // error/error_description vêm do provedor (ex.: usuário cancelou o login)
    // e não contêm segredos, mas evitamos logar o objeto de erro inteiro.
    console.error(JSON.stringify({
      evento: 'sso_callback_erro_provedor', erro: error, descricao: errorDescription,
    }));
    return res.redirect(frontendUrl('/?error=access_denied'));
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    console.error(JSON.stringify({ evento: 'sso_callback_state_invalido' }));
    return res.redirect(frontendUrl('/?error=access_denied'));
  }

  let tokenResponse;
  try {
    tokenResponse = await getMsalClient().acquireTokenByCode({
      code,
      scopes: ['openid', 'profile', 'email'],
      redirectUri: buildRedirectUri(req),
    });
  } catch (err) {
    // Nunca logar `err` cru aqui: exceptions do MSAL podem ecoar parâmetros
    // da requisição original. errorCode é um identificador seguro.
    console.error(JSON.stringify({ evento: 'sso_token_exchange_falhou', erro: err.errorCode || 'desconhecido' }));
    return res.redirect(frontendUrl('/?error=access_denied'));
  }

  const claims = tokenResponse?.account?.idTokenClaims || {};
  const { oid } = claims;
  const email = claims.preferred_username || claims.email || tokenResponse?.account?.username;
  const name = claims.name || tokenResponse?.account?.name;

  if (!oid || !email) {
    console.error(JSON.stringify({ evento: 'sso_claims_incompletas' }));
    return res.redirect(frontendUrl('/?error=access_denied'));
  }

  let allowed = false;
  try {
    allowed = await isMemberOfAllowedGroup(oid);
  } catch (err) {
    console.error(JSON.stringify({ evento: 'sso_checagem_grupo_falhou', erro: err.message }));
    return res.redirect(frontendUrl('/?error=access_denied'));
  }

  if (!allowed) {
    console.log(JSON.stringify({
      evento: 'sso_login_negado_fora_do_grupo', operador: email, timestamp: new Date().toISOString(),
    }));
    return res.redirect(frontendUrl('/?error=access_denied'));
  }

  const sessionJwt = signSessionToken({ email, name, oid });
  res.cookie(SESSION_COOKIE_NAME, sessionJwt, cookieOptions(SESSION_MAX_AGE_MS));

  console.log(JSON.stringify({
    evento: 'sso_login_sucesso', operador: email, timestamp: new Date().toISOString(),
  }));
  res.redirect(frontendUrl('/'));
}));

router.post('/logout', (req, res) => {
  // Logout só local: limpa o cookie de sessão. Não chama o endpoint de
  // logout da Microsoft — decisão explícita (ver ADR 0005).
  res.clearCookie(SESSION_COOKIE_NAME);
  res.status(204).send();
});

router.get('/me', (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  try {
    const claims = verifySessionToken(token);
    return res.json({ email: claims.email, name: claims.name });
  } catch (err) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada' });
  }
});

module.exports = router;
