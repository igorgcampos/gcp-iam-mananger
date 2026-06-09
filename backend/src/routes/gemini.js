const { Router } = require('express');
const {
  listLicenseConfigs,
  listUserLicenses,
  assignLicense,
  removeLicense,
} = require('../services/geminiService');

const router = Router();

router.get('/license-configs', async (req, res) => {
  try {
    const configs = await listLicenseConfigs();
    res.json(configs);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

router.get('/users', async (req, res) => {
  try {
    const users = await listUserLicenses();
    res.json(users);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

router.post('/users', async (req, res) => {
  const { email, licenseConfig } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email inválido' });
  }
  if (!licenseConfig) {
    return res.status(400).json({ error: 'Licença obrigatória' });
  }
  try {
    const result = await assignLicense(email.trim().toLowerCase(), licenseConfig);
    res.status(201).json(result);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

router.delete('/users/:email', async (req, res) => {
  try {
    await removeLicense(decodeURIComponent(req.params.email));
    res.status(204).send();
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

module.exports = router;
