// Log de auditoria das ações mutáveis do painel (adicionar/remover usuário,
// conceder/revogar Code Assist, atribuir/remover licença Gemini). Sem
// sistema de logging novo: console.log com JSON estruturado é suficiente —
// em produção isso é capturado pelo Cloud Logging automaticamente.
function logAudit(req, acao, alvo, extra = {}) {
  console.log(JSON.stringify({
    operador: req.operator?.email || 'desconhecido',
    acao,
    alvo,
    ...extra,
    timestamp: new Date().toISOString(),
  }));
}

module.exports = logAudit;
