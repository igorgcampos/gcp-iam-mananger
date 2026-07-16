export const DEFAULT_INACTIVITY_MONTHS = 2;

export const INACTIVITY_MONTH_OPTIONS = [1, 2, 3, 6, 12];

export function getReferenceDate(user) {
  const source = user.lastLoginTime || user.createTime;
  return source ? new Date(source) : null;
}

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
