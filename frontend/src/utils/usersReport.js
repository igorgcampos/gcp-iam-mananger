import { resolveTierName, stateLabel } from './licenseFormatting.jsx';
import { formatDatePtBr } from './inactivity';
import { buildClipboardTable } from './clipboardTable';
import { diretoriaText } from './diretoria';
import { antigravityText } from './antigravity';

export function buildUsersReport(users) {
  return [...users].sort((a, b) => a.userPrincipal.localeCompare(b.userPrincipal));
}

const CLIPBOARD_HEADERS = ['Email', 'Diretoria', 'Licença', 'Status', 'Atribuída em', 'Último acesso', 'Último uso Antigravity'];

export function buildUsersReportClipboard(report, configs, diretorias = null, antigravity = null) {
  const rows = report.map((u) => [
    u.userPrincipal,
    diretoriaText(u.userPrincipal, diretorias),
    resolveTierName(u.licenseConfig, configs) || '—',
    stateLabel(u.licenseAssignmentState),
    formatDatePtBr(u.createTime),
    formatDatePtBr(u.lastLoginTime),
    antigravityText(u.userPrincipal, antigravity),
  ]);

  return buildClipboardTable(CLIPBOARD_HEADERS, rows);
}
