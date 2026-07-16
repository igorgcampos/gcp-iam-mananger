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

export function stateTag(state) {
  if (state === 'ASSIGNED') return <Tag color="green">Atribuída</Tag>;
  if (state === 'NO_LICENSE_ATTEMPTED_LOGIN') return <Tag color="orange">Sem licença</Tag>;
  return <Tag>{state}</Tag>;
}

export function resolveTierName(licenseConfigName, configs) {
  const config = configs.find((c) => c.name === licenseConfigName);
  return config ? tierName(config.subscriptionTier) : null;
}

export function renderLicenseTag(licenseConfigName, configs) {
  const label = resolveTierName(licenseConfigName, configs);
  return label ? <Tag color={tierColor(label)}>{label}</Tag> : '—';
}
