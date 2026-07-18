const express = require('express');
const cors = require('cors');
const iamRoutes = require('./routes/iam');
const geminiRoutes = require('./routes/gemini');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/iam', iamRoutes);
app.use('/api/gemini', geminiRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use((err, req, res, next) => {
  const status = err.status ?? err.response?.status ?? 500;
  const msg = err.response?.data?.error?.message ?? err.message;
  res.status(status).json({ error: msg });
});

module.exports = app;
