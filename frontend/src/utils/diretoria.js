// Diretoria do Usuário = extensionAttribute4 do AD (ver CONTEXT.md e
// docs/adr/0014-diretoria-lida-do-entra-id.md). O mapa `diretorias` vem de
// POST /api/diretoria/lookup, indexado por e-mail em minúsculas:
//   string    → Diretoria como está no AD
//   null      → Sem Diretoria (atributo vazio ou usuário fora do Entra)
//   ausente   → desconhecido (Graph falhou / ainda carregando) — exibido "—"
// O mapa inteiro é null quando a consulta falhou.

export const SEM_DIRETORIA = 'Sem Diretoria';
export const SEM_DIRETORIA_KEY = '__SEM_DIRETORIA__';

// "Audiencia" e "AUDIÊNCIA" são a mesma Diretoria; "AUDIÊNCIA ASSINATURAS" não.
export function diretoriaKey(value) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export function getDiretoria(email, diretorias) {
  if (!diretorias) return undefined;
  const key = (email || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(diretorias, key) ? diretorias[key] : undefined;
}

// Diretoria como texto puro (relatórios copiados): desconhecido vira "—".
export function diretoriaText(email, diretorias) {
  const value = getDiretoria(email, diretorias);
  if (value === undefined) return '—';
  return value === null ? SEM_DIRETORIA : value;
}

export function userDiretoriaKey(email, diretorias) {
  const value = getDiretoria(email, diretorias);
  if (value === undefined) return undefined;
  return value === null ? SEM_DIRETORIA_KEY : diretoriaKey(value);
}

// Grafia exibida de um grupo: a mais frequente; no empate, a menor por ordem
// de código (não localeCompare — ele poria "Estrategia" antes de "ESTRATÉGIA",
// e o padrão do AD é a grafia em maiúsculas com acento).
function pickLabel(spellings) {
  return [...spellings.entries()]
    .sort(([a, ca], [b, cb]) => (cb - ca) || (a < b ? -1 : a > b ? 1 : 0))[0][0];
}

function groupUsers(users, diretorias) {
  const groups = new Map(); // key -> { count, spellings: Map<spelling, count> }
  users.forEach((u) => {
    const value = getDiretoria(u.userPrincipal, diretorias);
    if (value === undefined) return;
    const key = value === null ? SEM_DIRETORIA_KEY : diretoriaKey(value);
    const spelling = value === null ? SEM_DIRETORIA : value.trim();
    const group = groups.get(key) ?? { count: 0, spellings: new Map() };
    group.count += 1;
    group.spellings.set(spelling, (group.spellings.get(spelling) ?? 0) + 1);
    groups.set(key, group);
  });
  return [...groups.entries()].map(([key, g]) => ({ key, label: pickLabel(g.spellings), count: g.count }));
}

const semDiretoriaLast = (a, b) => (a.key === SEM_DIRETORIA_KEY) - (b.key === SEM_DIRETORIA_KEY);

export function buildDiretoriaStats(users, diretorias) {
  if (!diretorias) return [];
  const groups = groupUsers(users.filter((u) => u.licenseAssignmentState === 'ASSIGNED'), diretorias);
  const total = groups.reduce((sum, g) => sum + g.count, 0);
  return groups
    .map((g) => ({ ...g, percent: Math.round((g.count / total) * 100) }))
    .sort((a, b) => semDiretoriaLast(a, b) || (b.count - a.count) || a.label.localeCompare(b.label));
}

// Usuários com licença atribuída cuja Diretoria é desconhecida (Graph falhou
// para eles) — ficam fora dos percentuais do card, que precisa avisar disso.
export function countUnknownAssigned(users, diretorias) {
  return users.filter((u) => u.licenseAssignmentState === 'ASSIGNED'
    && getDiretoria(u.userPrincipal, diretorias) === undefined).length;
}

export function buildDiretoriaFilters(users, diretorias) {
  if (!diretorias) return [];
  return groupUsers(users, diretorias)
    .sort((a, b) => semDiretoriaLast(a, b) || a.label.localeCompare(b.label))
    .map((g) => ({ text: g.label, value: g.key }));
}
