import { resolveTierName, stateLabel } from './licenseFormatting.jsx';
import { formatDatePtBr } from './inactivity';
import { buildClipboardTable } from './clipboardTable';

export function buildUsersReport(users) {
  return [...users].sort((a, b) => a.userPrincipal.localeCompare(b.userPrincipal));
}

const CLIPBOARD_HEADERS = ['Email', 'Licença', 'Status', 'Atribuída em', 'Último acesso'];

export function buildUsersReportClipboard(report, configs) {
  const rows = report.map((u) => [
    u.userPrincipal,
    resolveTierName(u.licenseConfig, configs) || '—',
    stateLabel(u.licenseAssignmentState),
    formatDatePtBr(u.createTime),
    formatDatePtBr(u.lastLoginTime),
  ]);

  return buildClipboardTable(CLIPBOARD_HEADERS, rows);
}
