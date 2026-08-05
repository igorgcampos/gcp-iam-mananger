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

// Licenças sem renovação automática que vencem dentro de `withinDays` (ou já
// venceram, quando daysUntilEnd é negativo).
export function getExpiringSoonConfigs(configStats, { withinDays = 30 } = {}) {
  return configStats.filter(
    (c) => !c.autoRenew && c.daysUntilEnd !== null && c.daysUntilEnd <= withinDays
  );
}
