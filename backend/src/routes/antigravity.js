const { Router } = require('express');
const { getAntigravityUsage } = require('../services/antigravityService');
const asyncRoute = require('../middleware/asyncRoute');

// Último uso Antigravity por e-mail — ver docs/adr/0015-uso-do-antigravity-via-sink-no-bigquery.md.
const router = Router();

router.get('/usage', asyncRoute(async (req, res) => {
  res.json(await getAntigravityUsage());
}));

module.exports = router;
