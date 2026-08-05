import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  daysUntil, buildConfigStats, sumAssigned, sumRemaining, getExpiringSoonConfigs,
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
});
