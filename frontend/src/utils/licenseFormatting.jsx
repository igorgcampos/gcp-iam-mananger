import React from 'react';
import { Tag } from 'antd';

export const TIER_NAMES = {
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

const STATE_LABELS = {
  ASSIGNED: 'Atribuída',
  NO_LICENSE_ATTEMPTED_LOGIN: 'Sem licença',
};

const STATE_COLORS = {
  ASSIGNED: 'green',
  NO_LICENSE_ATTEMPTED_LOGIN: 'orange',
};

export function stateLabel(state) {
  return STATE_LABELS[state] || state;
}

export function stateTag(state) {
  return <Tag color={STATE_COLORS[state]}>{stateLabel(state)}</Tag>;
}

export function resolveTierName(licenseConfigName, configs) {
  const config = configs.find((c) => c.name === licenseConfigName);
  return config ? tierName(config.subscriptionTier) : null;
}

export function renderLicenseTag(licenseConfigName, configs) {
  if (!licenseConfigName) return '—';
  const label = resolveTierName(licenseConfigName, configs) || '—';
  return <Tag color={tierColor(label)}>{label}</Tag>;
}
