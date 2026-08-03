const { Router } = require('express');
const {
  listLicenseConfigs,
  listUserLicenses,
  assignLicense,
  removeLicense,
} = require('../services/geminiService');
const validateEmail = require('../middleware/validateEmail');
const asyncRoute = require('../middleware/asyncRoute');
const logAudit = require('../services/auditLog');

const router = Router();

router.get('/license-configs', asyncRoute(async (req, res) => {
  res.json(await listLicenseConfigs());
}));

router.get('/users', asyncRoute(async (req, res) => {
  res.json(await listUserLicenses());
}));

router.post('/users', validateEmail, asyncRoute(async (req, res) => {
  const { email, licenseConfig } = req.body;
  if (!licenseConfig) {
    return res.status(400).json({ error: 'Licença obrigatória' });
  }
  const normalizedEmail = email.trim().toLowerCase();
  const result = await assignLicense(normalizedEmail, licenseConfig);
  logAudit(req, 'gemini.assignLicense', normalizedEmail, { licenseConfig });
  res.status(201).json(result);
}));

router.delete('/users/:email', asyncRoute(async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  await removeLicense(email);
  logAudit(req, 'gemini.removeLicense', email);
  res.status(204).send();
}));

module.exports = router;
