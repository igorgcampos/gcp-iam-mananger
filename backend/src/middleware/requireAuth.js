const { verifySessionToken, SESSION_COOKIE_NAME } = require('../services/sessionToken');

// Gate único de autenticação para as rotas /api/*. Não há tiers/roles de
// Operador — pertencer ao grupo do AD (checado uma vez no login) já concede
// acesso total às ações do painel (ver ADR 0005).
function requireAuth(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  try {
    const claims = verifySessionToken(token);
    req.operator = { email: claims.email, name: claims.name, oid: claims.oid };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada' });
  }
}

module.exports = requireAuth;
