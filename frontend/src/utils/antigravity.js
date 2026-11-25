// Último uso Antigravity (ver CONTEXT.md e
// docs/adr/0015-uso-do-antigravity-via-sink-no-bigquery.md). O objeto
// `antigravity` vem de GET /api/antigravity/usage:
//   { since: 'YYYY-MM-DD', usage: { [email em minúsculas]: { lastUse, activeDays } } }
// `since` é o início do rastreamento (o sink não tem dado anterior). O objeto
// inteiro é null quando a consulta falhou ou ainda não voltou.

export const GEMINI_LAST_ACCESS_INFO = 'Última vez que o usuário usou o Gemini Enterprise (Agentspace).';

export const ANTIGRAVITY_LAST_USE_INFO = 'Última vez que o usuário usou o Antigravity (IDE ou extensão do VS Code). '
  + 'Conta só o uso no projeto agentspace-469418 com a conta corporativa. Dados a partir de 24/11/2026.';

// 'YYYY-MM-DD' → 'dd/mm/aaaa'. Sem new Date: meia-noite UTC cai no dia
// anterior em UTC-3.
export function formatSince(since) {
  const [year, month, day] = since.split('-');
  return `${day}/${month}/${year}`;
}

// { lastUse, activeDays } → usou; null → sem uso desde `since`;
// undefined → dado indisponível.
export function getAntigravityUse(email, antigravity) {
  if (!antigravity) return undefined;
  const key = (email || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(antigravity.usage, key) ? antigravity.usage[key] : null;
}

export function semUsoText(antigravity) {
  return `Sem uso desde ${formatSince(antigravity.since)}`;
}

// Texto puro para os relatórios copiados.
export function antigravityText(email, antigravity) {
  const use = getAntigravityUse(email, antigravity);
  if (use === undefined) return '—';
  if (use === null) return semUsoText(antigravity);
  return new Date(use.lastUse).toLocaleDateString('pt-BR');
}
