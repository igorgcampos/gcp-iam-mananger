import { resolveTierName, stateLabel } from './licenseFormatting.jsx';
import { buildClipboardTable } from './clipboardTable';

export const DEFAULT_INACTIVITY_MONTHS = 2;

export const INACTIVITY_MONTH_OPTIONS = [1, 2, 3, 6, 12];

export function getReferenceDate(user) {
  const source = user.lastLoginTime || user.createTime;
  return source ? new Date(source) : null;
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

export function isInactiveUser(user, thresholdMonths, now = new Date()) {
  if (user.licenseAssignmentState !== 'ASSIGNED') return false;
  const referenceDate = getReferenceDate(user);
  if (!referenceDate) return false;
  return monthsBetween(referenceDate, now) >= thresholdMonths;
}

export function buildInactivityReport(users, thresholdMonths, now = new Date()) {
  return users
    .filter((user) => isInactiveUser(user, thresholdMonths, now))
    .map((user) => ({ ...user, monthsInactive: monthsBetween(getReferenceDate(user), now) }))
    .sort((a, b) => b.monthsInactive - a.monthsInactive);
}

export function formatMonthsInactive(months) {
  return `${months} ${months === 1 ? 'mês' : 'meses'}`;
}

export function formatDatePtBr(value) {
  return value ? new Date(value).toLocaleDateString('pt-BR') : '—';
}

const CLIPBOARD_HEADERS = ['Email', 'Licença', 'Status', 'Atribuída em', 'Último acesso', 'Tempo inativo'];

export function buildInactivityReportClipboard(report, configs) {
  const rows = report.map((u) => [
    u.userPrincipal,
    resolveTierName(u.licenseConfig, configs) || '—',
    stateLabel(u.licenseAssignmentState),
    formatDatePtBr(u.createTime),
    formatDatePtBr(u.lastLoginTime),
    formatMonthsInactive(u.monthsInactive),
  ]);

  return buildClipboardTable(CLIPBOARD_HEADERS, rows);
}
