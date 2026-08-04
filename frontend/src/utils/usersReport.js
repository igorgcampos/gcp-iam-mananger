import { resolveTierName, stateLabel } from './licenseFormatting.jsx';
import { formatDatePtBr } from './inactivity';

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

  const text = [CLIPBOARD_HEADERS, ...rows].map((row) => row.join('\t')).join('\n');

  const cellStyle = 'border:1px solid #ccc;padding:4px 8px;text-align:left';
  const headerRow = CLIPBOARD_HEADERS.map((h) => `<th style="${cellStyle};background:#fafafa">${h}</th>`).join('');
  const bodyRows = rows
    .map((row) => `<tr>${row.map((cell) => `<td style="${cellStyle}">${cell}</td>`).join('')}</tr>`)
    .join('');
  const html = `<table style="border-collapse:collapse;font-family:sans-serif;font-size:13px"><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table>`;

  return { html, text };
}
