const { Router } = require('express');
const { getBillingSummary } = require('../services/billingService');
const asyncRoute = require('../middleware/asyncRoute');

const router = Router();

router.get('/summary', asyncRoute(async (req, res) => {
  res.json(await getBillingSummary());
}));

module.exports = router;
