const { Router } = require('express');
const {
  listUsers, addUser, removeUser, addCodeAssistUser, removeCodeAssistUser,
} = require('../services/iamService');
const validateEmail = require('../middleware/validateEmail');
const asyncRoute = require('../middleware/asyncRoute');

const router = Router();

router.get('/users', asyncRoute(async (req, res) => {
  res.json(await listUsers());
}));

router.post('/users', validateEmail, asyncRoute(async (req, res) => {
  const result = await addUser(req.body.email.trim().toLowerCase(), {
    codeAssist: !!req.body.codeAssist,
  });
  res.status(201).json(result);
}));

router.delete('/users/:email', asyncRoute(async (req, res) => {
  await removeUser(decodeURIComponent(req.params.email));
  res.status(204).send();
}));

router.post('/users/:email/code-assist', asyncRoute(async (req, res) => {
  const result = await addCodeAssistUser(decodeURIComponent(req.params.email));
  res.status(201).json(result);
}));

router.delete('/users/:email/code-assist', asyncRoute(async (req, res) => {
  await removeCodeAssistUser(decodeURIComponent(req.params.email));
  res.status(204).send();
}));

module.exports = router;
