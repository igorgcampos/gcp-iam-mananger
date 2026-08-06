const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const iamRoutes = require('./routes/iam');
const geminiRoutes = require('./routes/gemini');
const billingRoutes = require('./routes/billing');
const authRoutes = require('./routes/auth');
const requireAuth = require('./middleware/requireAuth');

const app = express();

// Necessário para que req.protocol/req.get('host') reflitam os cabeçalhos
// X-Forwarded-* corretamente atrás do nginx (Docker/Cloud Run) — usado para
// derivar o redirect_uri do fluxo OIDC em backend/src/routes/auth.js.
app.set('trust proxy', true);

app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Rotas públicas de autenticação — precisam vir antes do requireAuth.
app.use('/auth', authRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/iam', requireAuth, iamRoutes);
app.use('/api/gemini', requireAuth, geminiRoutes);
app.use('/api/billing', requireAuth, billingRoutes);

app.use((err, req, res, next) => {
  const status = err.status ?? err.response?.status ?? 500;
  const msg = err.response?.data?.error?.message ?? err.message;
  res.status(status).json({ error: msg });
});

module.exports = app;
