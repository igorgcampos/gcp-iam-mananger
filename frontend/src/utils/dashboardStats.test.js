import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  daysUntil, buildConfigStats, sumAssigned, sumRemaining, getExpiringSoonConfigs, getVisibleConfigs,
} from './dashboardStats';

describe('daysUntil', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15)); // 15/01/2026
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a positive count for a future date', () => {
    expect(daysUntil({ year: 2026, month: 1, day: 25 })).toBe(10);
  });

  it('returns a negative count for a past date', () => {
    expect(daysUntil({ year: 2026, month: 1, day: 5 })).toBe(-10);
  });

  it('returns 0 for today', () => {
    expect(daysUntil({ year: 2026, month: 1, day: 15 })).toBe(0);
  });

  it('returns null when there is no date', () => {
    expect(daysUntil(undefined)).toBeNull();
    expect(daysUntil({})).toBeNull();
  });
});

describe('buildConfigStats', () => {
  const configs = [
    { name: 'std', licenseCount: '10', subscriptionTier: 'SUBSCRIPTION_TIER_ENTERPRISE', autoRenew: true },
    { name: 'plus', licenseCount: '5', subscriptionTier: 'SUBSCRIPTION_TIER_SEARCH_AND_ASSISTANT', autoRenew: false },
  ];
  const geminiUsers = [
    { licenseConfig: 'std', licenseAssignmentState: 'ASSIGNED' },
    { licenseConfig: 'std', licenseAssignmentState: 'ASSIGNED' },
    { licenseConfig: 'std', licenseAssignmentState: 'NO_LICENSE_ATTEMPTED_LOGIN' },
    { licenseConfig: 'plus', licenseAssignmentState: 'ASSIGNED' },
  ];

  it('computes assigned/remaining per config, counting only ASSIGNED users for that config', () => {
    const stats = buildConfigStats(configs, geminiUsers);
    expect(stats).toEqual([
      expect.objectContaining({
        name: 'std', total: 10, assigned: 2, remaining: 8, label: 'Gemini Enterprise Standard',
      }),
      expect.objectContaining({
        name: 'plus', total: 5, assigned: 1, remaining: 4, label: 'Agentspace Enterprise Plus',
      }),
    ]);
  });

  it('treats a missing/non-numeric licenseCount as zero total', () => {
    const [stats] = buildConfigStats([{ name: 'broken', subscriptionTier: 'X' }], []);
    expect(stats.total).toBe(0);
    expect(stats.remaining).toBe(0);
  });
});

describe('sumAssigned / sumRemaining', () => {
  const configStats = [
    { assigned: 2, remaining: 8 },
    { assigned: 1, remaining: 4 },
  ];

  it('sums the assigned count across configs', () => {
    expect(sumAssigned(configStats)).toBe(3);
  });

  it('sums the remaining count across configs', () => {
    expect(sumRemaining(configStats)).toBe(12);
  });

  it('returns 0 for an empty list', () => {
    expect(sumAssigned([])).toBe(0);
    expect(sumRemaining([])).toBe(0);
  });
});

describe('getExpiringSoonConfigs', () => {
  it('excludes configs with auto-renew, even if the date is close', () => {
    const stats = [{ name: 'a', autoRenew: true, daysUntilEnd: 5 }];
    expect(getExpiringSoonConfigs(stats)).toEqual([]);
  });

  it('excludes configs without a known end date', () => {
    const stats = [{ name: 'a', autoRenew: false, daysUntilEnd: null }];
    expect(getExpiringSoonConfigs(stats)).toEqual([]);
  });

  it('includes configs without auto-renew expiring within the default 30 days', () => {
    const stats = [{ name: 'a', autoRenew: false, daysUntilEnd: 30 }];
    expect(getExpiringSoonConfigs(stats)).toEqual(stats);
  });

  it('includes already-expired configs (negative daysUntilEnd)', () => {
    const stats = [{ name: 'a', autoRenew: false, daysUntilEnd: -3 }];
    expect(getExpiringSoonConfigs(stats)).toEqual(stats);
  });

  it('excludes configs expiring further out than the withinDays window', () => {
    const stats = [{ name: 'a', autoRenew: false, daysUntilEnd: 31 }];
    expect(getExpiringSoonConfigs(stats, { withinDays: 30 })).toEqual([]);
  });

  it('includes a config still inside the 5-day grace window after expiring', () => {
    const stats = [{ name: 'a', autoRenew: false, daysUntilEnd: -5 }];
    expect(getExpiringSoonConfigs(stats)).toEqual(stats);
  });

  it('excludes a config once it is past the 5-day grace window', () => {
    const stats = [{ name: 'a', autoRenew: false, daysUntilEnd: -6 }];
    expect(getExpiringSoonConfigs(stats)).toEqual([]);
  });

  it('respects a custom graceDays option', () => {
    const stats = [{ name: 'a', autoRenew: false, daysUntilEnd: -10 }];
    expect(getExpiringSoonConfigs(stats, { graceDays: 10 })).toEqual(stats);
    expect(getExpiringSoonConfigs(stats, { graceDays: 9 })).toEqual([]);
  });
});

describe('getVisibleConfigs', () => {
  it('keeps configs with auto-renew regardless of how negative daysUntilEnd is', () => {
    const stats = [{ name: 'a', autoRenew: true, daysUntilEnd: -100 }];
    expect(getVisibleConfigs(stats)).toEqual(stats);
  });

  it('keeps configs without a known end date', () => {
    const stats = [{ name: 'a', autoRenew: false, daysUntilEnd: null }];
    expect(getVisibleConfigs(stats)).toEqual(stats);
  });

  it('keeps a config still inside the 5-day grace window after expiring', () => {
    const stats = [{ name: 'a', autoRenew: false, daysUntilEnd: -5 }];
    expect(getVisibleConfigs(stats)).toEqual(stats);
  });

  it('drops a config once it is past the 5-day grace window', () => {
    const stats = [{ name: 'a', autoRenew: false, daysUntilEnd: -6 }];
    expect(getVisibleConfigs(stats)).toEqual([]);
  });

  it('keeps configs that have not expired yet', () => {
    const stats = [{ name: 'a', autoRenew: false, daysUntilEnd: 100 }];
    expect(getVisibleConfigs(stats)).toEqual(stats);
  });

  it('respects a custom graceDays option', () => {
    const stats = [{ name: 'a', autoRenew: false, daysUntilEnd: -10 }];
    expect(getVisibleConfigs(stats, { graceDays: 10 })).toEqual(stats);
    expect(getVisibleConfigs(stats, { graceDays: 9 })).toEqual([]);
  });
});
