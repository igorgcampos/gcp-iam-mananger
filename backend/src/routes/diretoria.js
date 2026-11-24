const { Router } = require('express');
const { getDiretorias } = require('../services/diretoriaService');
const asyncRoute = require('../middleware/asyncRoute');

// Leitura da Diretoria (extensionAttribute4 do AD) — ver
// docs/adr/0014-diretoria-lida-do-entra-id.md. É POST só para levar a lista
// de e-mails no corpo; não muda nada, por isso não passa pelo logAudit.
const MAX_EMAILS = 1000;

const router = Router();

router.post('/lookup', asyncRoute(async (req, res) => {
  const { emails } = req.body ?? {};
  if (!Array.isArray(emails) || !emails.every((e) => typeof e === 'string')) {
    return res.status(400).json({ error: 'emails deve ser uma lista de e-mails' });
  }
  if (emails.length > MAX_EMAILS) {
    return res.status(400).json({ error: `No máximo ${MAX_EMAILS} e-mails por consulta` });
  }
  res.json({ diretorias: await getDiretorias(emails) });
}));

module.exports = router;
