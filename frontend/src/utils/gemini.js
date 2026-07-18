const TIER_NAMES = {
  SUBSCRIPTION_TIER_ENTERPRISE: 'Gemini Enterprise Standard',
  SUBSCRIPTION_TIER_SEARCH_AND_ASSISTANT: 'Agentspace Enterprise Plus',
};

export function tierName(tier) {
  return TIER_NAMES[tier] || tier || 'Licença';
}

export function tierColor(name = '') {
  if (name.includes('Plus')) return 'purple';
  if (name.includes('Standard')) return 'blue';
  return 'default';
}

export function formatDate(d) {
  if (!d || !d.year) return null;
  return `${String(d.day).padStart(2, '0')}/${String(d.month).padStart(2, '0')}/${d.year}`;
}
