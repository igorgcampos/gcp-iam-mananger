import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { tierName, tierColor, stateTag, renderLicenseTag } from './licenseFormatting';

describe('tierName', () => {
  it('maps known tier keys to friendly names', () => {
    expect(tierName('SUBSCRIPTION_TIER_ENTERPRISE')).toBe('Gemini Enterprise Standard');
    expect(tierName('SUBSCRIPTION_TIER_SEARCH_AND_ASSISTANT')).toBe('Agentspace Enterprise Plus');
  });

  it('falls back to the raw tier when unknown, or "Licença" when falsy', () => {
    expect(tierName('SOME_OTHER_TIER')).toBe('SOME_OTHER_TIER');
    expect(tierName(undefined)).toBe('Licença');
  });
});

describe('tierColor', () => {
  it('colors Plus tiers purple, Standard tiers blue, and anything else default', () => {
    expect(tierColor('Agentspace Enterprise Plus')).toBe('purple');
    expect(tierColor('Gemini Enterprise Standard')).toBe('blue');
    expect(tierColor('Something Else')).toBe('default');
  });
});

describe('stateTag', () => {
  it('renders "Atribuída" for ASSIGNED', () => {
    render(stateTag('ASSIGNED'));
    expect(screen.getByText('Atribuída')).toBeInTheDocument();
  });

  it('renders "Sem licença" for NO_LICENSE_ATTEMPTED_LOGIN', () => {
    render(stateTag('NO_LICENSE_ATTEMPTED_LOGIN'));
    expect(screen.getByText('Sem licença')).toBeInTheDocument();
  });

  it('renders the raw state for anything else', () => {
    render(stateTag('SOME_OTHER_STATE'));
    expect(screen.getByText('SOME_OTHER_STATE')).toBeInTheDocument();
  });
});

describe('renderLicenseTag', () => {
  const configs = [
    { name: 'configs/a', subscriptionTier: 'SUBSCRIPTION_TIER_ENTERPRISE' },
  ];

  it('renders the friendly tier name when the config is found', () => {
    render(renderLicenseTag('configs/a', configs));
    expect(screen.getByText('Gemini Enterprise Standard')).toBeInTheDocument();
  });

  it('renders an em dash when the config is not found', () => {
    const { container } = render(<>{renderLicenseTag('configs/missing', configs)}</>);
    expect(container.textContent).toBe('—');
  });
});
