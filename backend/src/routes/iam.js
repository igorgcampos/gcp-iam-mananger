const { Router } = require('express');
const {
  listUsers, addUser, removeUser, addCodeAssistUser, removeCodeAssistUser,
} = require('../services/iamService');
const validateEmail = require('../middleware/validateEmail');
const asyncRoute = require('../middleware/asyncRoute');
const logAudit = require('../services/auditLog');

const router = Router();

router.get('/users', asyncRoute(async (req, res) => {
  res.json(await listUsers());
}));

router.post('/users', validateEmail, asyncRoute(async (req, res) => {
  const email = req.body.email.trim().toLowerCase();
  const result = await addUser(email, {
    codeAssist: !!req.body.codeAssist,
  });
  logAudit(req, 'iam.addUser', email, { codeAssist: !!req.body.codeAssist });
  res.status(201).json(result);
}));

router.delete('/users/:email', asyncRoute(async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  await removeUser(email);
  logAudit(req, 'iam.removeUser', email);
  res.status(204).send();
}));

router.post('/users/:email/code-assist', asyncRoute(async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  const result = await addCodeAssistUser(email);
  logAudit(req, 'iam.grantCodeAssist', email);
  res.status(201).json(result);
}));

router.delete('/users/:email/code-assist', asyncRoute(async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  await removeCodeAssistUser(email);
  logAudit(req, 'iam.revokeCodeAssist', email);
  res.status(204).send();
}));

module.exports = router;
