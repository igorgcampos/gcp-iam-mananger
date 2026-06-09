require('dotenv').config();
const express = require('express');
const cors = require('cors');
const iamRoutes = require('./routes/iam');
const geminiRoutes = require('./routes/gemini');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/iam', iamRoutes);
app.use('/api/gemini', geminiRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
