import { resolveTierName, stateLabel } from './licenseFormatting.jsx';
import { buildClipboardTable } from './clipboardTable';
import { diretoriaText } from './diretoria';
import { antigravityText, getAntigravityUse } from './antigravity';

export const DEFAULT_INACTIVITY_MONTHS = 2;

export const INACTIVITY_MONTH_OPTIONS = [1, 2, 3, 6, 12];

// Data de Referência (ver CONTEXT.md): o uso mais recente em qualquer uma
// das duas ferramentas da Licença do Gemini Enterprise — o "Último acesso"
// (Gemini Enterprise/Agentspace) ou o "Último uso Antigravity" — ou a
// atribuição, se for mais recente (licença reatribuída). Quem não aparece nos
// logs do Antigravity conta só pelo Gemini: o início do rastreamento (since)
// não entra, senão ninguém ficaria inativo no primeiro mês do sink.
// Sem o dado do Antigravity, null: o usuário fica fora do relatório em vez
// de virar falso inativo (quem só usa o Antigravity).
export function getReferenceDate(user, antigravity) {
  if (!antigravity) return null;
  const use = getAntigravityUse(user.userPrincipal, antigravity);
  const dates = [user.lastLoginTime, use?.lastUse, user.createTime]
    .filter(Boolean)
    .map((value) => new Date(value));
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map((d) => d.getTime())));
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

export function isInactiveUser(user, thresholdMonths, now = new Date(), { antigravity } = {}) {
  if (user.licenseAssignmentState !== 'ASSIGNED') return false;
  const referenceDate = getReferenceDate(user, antigravity);
  if (!referenceDate) return false;
  return monthsBetween(referenceDate, now) >= thresholdMonths;
}

export function buildInactivityReport(users, thresholdMonths, now = new Date(), { antigravity } = {}) {
  return users
    .filter((user) => isInactiveUser(user, thresholdMonths, now, { antigravity }))
    .map((user) => ({ ...user, monthsInactive: monthsBetween(getReferenceDate(user, antigravity), now) }))
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
