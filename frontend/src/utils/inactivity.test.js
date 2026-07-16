import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INACTIVITY_MONTHS,
  INACTIVITY_MONTH_OPTIONS,
  getReferenceDate,
  monthsBetween,
  isInactiveUser,
  buildInactivityReport,
  formatMonthsInactive,
} from './inactivity';

describe('constants', () => {
  it('defaults to 2 months and offers 1/2/3/6/12 as options', () => {
    expect(DEFAULT_INACTIVITY_MONTHS).toBe(2);
    expect(INACTIVITY_MONTH_OPTIONS).toEqual([1, 2, 3, 6, 12]);
  });
});

describe('getReferenceDate', () => {
  it('uses lastLoginTime when present', () => {
    const user = { lastLoginTime: '2025-10-01T00:00:00Z', createTime: '2025-01-01T00:00:00Z' };
    expect(getReferenceDate(user)).toEqual(new Date('2025-10-01T00:00:00Z'));
  });

  it('falls back to createTime when lastLoginTime is absent (never logged in)', () => {
    const user = { lastLoginTime: null, createTime: '2026-06-08T00:00:00Z' };
    expect(getReferenceDate(user)).toEqual(new Date('2026-06-08T00:00:00Z'));
  });

  it('returns null when neither date is present', () => {
    expect(getReferenceDate({})).toBeNull();
  });
});

describe('monthsBetween', () => {
  it('counts whole elapsed months, flooring partial months', () => {
    const now = new Date('2026-07-16T00:00:00');
    expect(monthsBetween(new Date('2025-10-01T00:00:00'), now)).toBe(9);
    expect(monthsBetween(new Date('2026-06-08T00:00:00'), now)).toBe(1);
    expect(monthsBetween(now, now)).toBe(0);
  });

  it('does not count a month as elapsed until the day-of-month is reached', () => {
    expect(monthsBetween(new Date('2025-01-31T00:00:00'), new Date('2025-03-01T00:00:00'))).toBe(1);
  });
});

describe('isInactiveUser', () => {
  const now = new Date('2026-07-16T00:00:00');

  it('is true for an ASSIGNED user whose reference date is past the threshold', () => {
    const user = {
      licenseAssignmentState: 'ASSIGNED',
      createTime: '2025-10-01T00:00:00',
      lastLoginTime: '2025-10-01T00:00:00',
    };
    expect(isInactiveUser(user, 2, now)).toBe(true);
  });

  it('is false for an ASSIGNED user within the threshold', () => {
    const user = {
      licenseAssignmentState: 'ASSIGNED',
      createTime: '2026-06-08T00:00:00',
      lastLoginTime: null,
    };
    expect(isInactiveUser(user, 2, now)).toBe(false);
  });

  it('is false regardless of dates when the license is not ASSIGNED', () => {
    const user = {
      licenseAssignmentState: 'NO_LICENSE_ATTEMPTED_LOGIN',
      createTime: '2020-01-01T00:00:00',
      lastLoginTime: null,
    };
    expect(isInactiveUser(user, 2, now)).toBe(false);
  });

  it('is false when there is no reference date at all', () => {
    const user = { licenseAssignmentState: 'ASSIGNED', createTime: null, lastLoginTime: null };
    expect(isInactiveUser(user, 2, now)).toBe(false);
  });
});

describe('buildInactivityReport', () => {
  const now = new Date('2026-07-16T00:00:00');
  const users = [
    { userPrincipal: 'caio.rosa@oglobo.com.br', licenseAssignmentState: 'ASSIGNED', createTime: '2026-06-08T00:00:00', lastLoginTime: null },
    { userPrincipal: 'luan.oliveira@oglobo.com.br', licenseAssignmentState: 'ASSIGNED', createTime: '2025-10-01T00:00:00', lastLoginTime: '2025-10-01T00:00:00' },
    { userPrincipal: 'ana.souza@oglobo.com.br', licenseAssignmentState: 'ASSIGNED', createTime: '2026-01-16T00:00:00', lastLoginTime: '2026-01-16T00:00:00' },
    { userPrincipal: 'sem.licenca@oglobo.com.br', licenseAssignmentState: 'NO_LICENSE_ATTEMPTED_LOGIN', createTime: '2020-01-01T00:00:00', lastLoginTime: null },
  ];

  it('excludes caio (only 1 month) and the non-ASSIGNED user, keeps and sorts the rest by months inactive descending', () => {
    const report = buildInactivityReport(users, 2, now);
    expect(report.map((u) => u.userPrincipal)).toEqual([
      'luan.oliveira@oglobo.com.br',
      'ana.souza@oglobo.com.br',
    ]);
    expect(report[0].monthsInactive).toBe(9);
    expect(report[1].monthsInactive).toBe(6);
  });

  it('returns an empty array when nobody crosses the threshold', () => {
    expect(buildInactivityReport(users, 12, now)).toEqual([]);
  });
});

describe('formatMonthsInactive', () => {
  it('uses singular "mês" for 1 and plural "meses" otherwise', () => {
    expect(formatMonthsInactive(1)).toBe('1 mês');
    expect(formatMonthsInactive(4)).toBe('4 meses');
    expect(formatMonthsInactive(0)).toBe('0 meses');
  });
});
