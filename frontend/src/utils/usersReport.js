import { resolveTierName, stateLabel } from './licenseFormatting.jsx';
import { formatDatePtBr } from './inactivity';
import { buildClipboardTable } from './clipboardTable';
import { SEM_DIRETORIA, getDiretoria } from './diretoria';

export function buildUsersReport(users) {
  return [...users].sort((a, b) => a.userPrincipal.localeCompare(b.userPrincipal));
}

const CLIPBOARD_HEADERS = ['Email', 'Diretoria', 'Licença', 'Status', 'Atribuída em', 'Último acesso'];

function diretoriaCell(email, diretorias) {
  const value = getDiretoria(email, diretorias);
  if (value === undefined) return '—';
  return value === null ? SEM_DIRETORIA : value;
}

export function buildUsersReportClipboard(report, configs, diretorias = null) {
  const rows = report.map((u) => [
    u.userPrincipal,
    diretoriaCell(u.userPrincipal, diretorias),
    resolveTierName(u.licenseConfig, configs) || '—',
    stateLabel(u.licenseAssignmentState),
    formatDatePtBr(u.createTime),
    formatDatePtBr(u.lastLoginTime),
  ]);

  return buildClipboardTable(CLIPBOARD_HEADERS, rows);
}
