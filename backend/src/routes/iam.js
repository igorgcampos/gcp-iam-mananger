const { Router } = require('express');
const { listUsers, addUser, removeUser } = require('../services/iamService');

const router = Router();

router.get('/users', async (req, res) => {
  try {
    const users = await listUsers();
    res.json(users);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/users', async (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email inválido' });
  }
  try {
    const result = await addUser(email.trim().toLowerCase());
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/users/:email', async (req, res) => {
  try {
    await removeUser(decodeURIComponent(req.params.email));
    res.status(204).send();
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
