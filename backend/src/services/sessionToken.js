const jwt = require('jsonwebtoken');

const SESSION_COOKIE_NAME = 'session';
const SESSION_TTL = '8h';

function getSecret() {
  const secret = process.env.SESSION_JWT_SECRET;
  if (!secret) {
    throw new Error('SESSION_JWT_SECRET não configurado');
  }
  return secret;
}

// Sessão do Operador é um JWT próprio (HS256), stateless — nenhuma tabela ou
// cache de sessão no backend (ver ADR 0005). O token carrega só o essencial
// para identificar o Operador nos logs de auditoria.
function signSessionToken({ email, name, oid }) {
  return jwt.sign({ email, name, oid }, getSecret(), {
    algorithm: 'HS256',
    expiresIn: SESSION_TTL,
  });
}

function verifySessionToken(token) {
  return jwt.verify(token, getSecret(), { algorithms: ['HS256'] });
}

module.exports = {
  SESSION_COOKIE_NAME,
  signSessionToken,
  verifySessionToken,
};
