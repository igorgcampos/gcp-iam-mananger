import { tierName } from './licenseFormatting.jsx';
import { formatDate } from './gemini';

// Dias entre hoje e uma data { year, month, day } retornada pela API do
// Gemini Enterprise. Negativo significa que a data já passou.
export function daysUntil({ year, month, day } = {}) {
  if (!year) return null;
  const target = new Date(year, month - 1, day);
  const today = new Date();
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

// Cruza cada configuração de licença com os usuários Gemini para calcular
// quantos slots estão atribuídos/livres, além de quando a licença vence.
export function buildConfigStats(configs, geminiUsers) {
  return configs.map((c) => {
    const total = parseInt(c.licenseCount, 10) || 0;
    const assigned = geminiUsers.filter(
      (u) => u.licenseConfig === c.name && u.licenseAssignmentState === 'ASSIGNED'
    ).length;
    return {
      ...c,
      total,
      assigned,
      remaining: total - assigned,
      label: tierName(c.subscriptionTier),
      end: formatDate(c.endDate),
      daysUntilEnd: daysUntil(c.endDate),
    };
  });
}

export function sumAssigned(configStats) {
  return configStats.reduce((sum, c) => sum + c.assigned, 0);
}

export function sumRemaining(configStats) {
  return configStats.reduce((sum, c) => sum + c.remaining, 0);
}

// Nº de dias, após a expiração, que uma Licença sem Renovação Automática
// ainda aparece no Aviso de Expiração (Alert do Dashboard, card "Licenças
// por camada" e resumo por camada/seletor de nível do Gemini Enterprise) —
// ver "Janela de Carência" no CONTEXT.md. Passado esse prazo, some dessas
// superfícies, mas Atribuições e totais continuam contando a Licença
// normalmente (não é revogação, só deixa de ser oferecida/destacada).
export const EXPIRED_GRACE_DAYS = 5;

// Uma Licença com Renovação Automática nunca é tratada como expirada — a
// data de expiração dela é apenas informativa (ver "Renovação Automática"
// no CONTEXT.md).
function isExpiredBeyondGrace(c, graceDays) {
  return !c.autoRenew && c.daysUntilEnd !== null && c.daysUntilEnd < -graceDays;
}

// Licenças sem renovação automática que vencem dentro de `withinDays` (ou já
// venceram, quando daysUntilEnd é negativo), mas ainda dentro da Janela de
// Carência — passado esse prazo, a licença some do Aviso de Expiração.
export function getExpiringSoonConfigs(configStats, { withinDays = 30, graceDays = EXPIRED_GRACE_DAYS } = {}) {
  return configStats.filter(
    (c) => !c.autoRenew && c.daysUntilEnd !== null && c.daysUntilEnd <= withinDays
      && !isExpiredBeyondGrace(c, graceDays)
  );
}

// Licenças que ainda devem ser oferecidas/destacadas na UI: exclui as que já
// passaram da Janela de Carência de expiração (ver "Aviso de Expiração" no
// CONTEXT.md). Usada pelo card "Licenças por camada" do Dashboard e pelo
// resumo por camada/seletor de nível do Gemini Enterprise — não pelos totais
// agregados nem pelo filtro/tabela de Atribuições, que continuam refletindo
// todas as licenças, expiradas ou não.
export function getVisibleConfigs(configStats, { graceDays = EXPIRED_GRACE_DAYS } = {}) {
  return configStats.filter((c) => !isExpiredBeyondGrace(c, graceDays));
}
