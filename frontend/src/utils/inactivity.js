import { resolveTierName, stateLabel } from './licenseFormatting.jsx';
import { buildClipboardTable } from './clipboardTable';
import { diretoriaText } from './diretoria';
import { antigravityText, getAntigravityUse } from './antigravity';

export const DEFAULT_INACTIVITY_MONTHS = 2;

export const INACTIVITY_MONTH_OPTIONS = [1, 2, 3, 6, 12];

// Ferramenta pela qual a inatividade é medida (ver Data de Referência no
// CONTEXT.md). Gemini Enterprise é o padrão.
export const INACTIVITY_SOURCES = { GEMINI: 'gemini', ANTIGRAVITY: 'antigravity' };

// Antigravity: último uso; sem uso, o mais recente entre a atribuição e o
// início do rastreamento (antes dele não há dado — ninguém pode ser dado como
// inativo por um período que não foi observado). Sem o dado do Antigravity,
// null: o usuário fica fora do relatório em vez de virar falso inativo.
function getAntigravityReferenceDate(user, antigravity) {
  if (!antigravity) return null;
  const use = getAntigravityUse(user.userPrincipal, antigravity);
  if (use) return new Date(use.lastUse);
  const since = new Date(`${antigravity.since}T00:00:00`);
  const created = user.createTime ? new Date(user.createTime) : null;
  return created && created > since ? created : since;
}

export function getReferenceDate(user, source = INACTIVITY_SOURCES.GEMINI, antigravity = null) {
  if (source === INACTIVITY_SOURCES.ANTIGRAVITY) return getAntigravityReferenceDate(user, antigravity);
  const value = user.lastLoginTime || user.createTime;
  return value ? new Date(value) : null;
}

// Reads calendar fields in local time, but the Discovery Engine API returns UTC
// timestamps — near month boundaries this can shift the result by up to 1 month
// in timezones behind UTC (e.g. BRT/UTC-3). Accepted: bounded, and every removal
// is manually confirmed via Popconfirm.
export function monthsBetween(pastDate, now) {
  let total = (now.getFullYear() - pastDate.getFullYear()) * 12 + (now.getMonth() - pastDate.getMonth());
  if (now.getDate() < pastDate.getDate()) total -= 1;
  return Math.max(total, 0);
}

export function isInactiveUser(user, thresholdMonths, now = new Date(), { source, antigravity } = {}) {
  if (user.licenseAssignmentState !== 'ASSIGNED') return false;
  const referenceDate = getReferenceDate(user, source, antigravity);
  if (!referenceDate) return false;
  return monthsBetween(referenceDate, now) >= thresholdMonths;
}

export function buildInactivityReport(users, thresholdMonths, now = new Date(), { source, antigravity } = {}) {
  return users
    .filter((user) => isInactiveUser(user, thresholdMonths, now, { source, antigravity }))
    .map((user) => ({ ...user, monthsInactive: monthsBetween(getReferenceDate(user, source, antigravity), now) }))
    .sort((a, b) => b.monthsInactive - a.monthsInactive);
}

export function formatMonthsInactive(months) {
  return `${months} ${months === 1 ? 'mês' : 'meses'}`;
}

export function formatDatePtBr(value) {
  return value ? new Date(value).toLocaleDateString('pt-BR') : '—';
}

const CLIPBOARD_HEADERS = ['Email', 'Diretoria', 'Licença', 'Status', 'Atribuída em', 'Último acesso', 'Último uso Antigravity', 'Tempo inativo'];

export function buildInactivityReportClipboard(report, configs, diretorias = null, antigravity = null) {
  const rows = report.map((u) => [
    u.userPrincipal,
    diretoriaText(u.userPrincipal, diretorias),
    resolveTierName(u.licenseConfig, configs) || '—',
    stateLabel(u.licenseAssignmentState),
    formatDatePtBr(u.createTime),
    formatDatePtBr(u.lastLoginTime),
    antigravityText(u.userPrincipal, antigravity),
    formatMonthsInactive(u.monthsInactive),
  ]);

  return buildClipboardTable(CLIPBOARD_HEADERS, rows);
}
