import { describe, expect, it } from 'vitest';
import { buildUsersReport, buildUsersReportClipboard } from './usersReport';

const configs = [
  { name: 'configs/enterprise', subscriptionTier: 'SUBSCRIPTION_TIER_ENTERPRISE' },
];

const users = [
  {
    userPrincipal: 'luan.oliveira@oglobo.com.br',
    licenseConfig: 'configs/enterprise',
    licenseAssignmentState: 'ASSIGNED',
    createTime: '2025-10-01T00:00:00',
    lastLoginTime: '2025-10-01T00:00:00',
  },
  {
    userPrincipal: 'ana.souza@oglobo.com.br',
    licenseConfig: 'configs/enterprise',
    licenseAssignmentState: 'NO_LICENSE_ATTEMPTED_LOGIN',
    createTime: '2026-01-16T00:00:00',
    lastLoginTime: null,
  },
];

describe('buildUsersReport', () => {
  it('sorts all users alphabetically by email, regardless of assignment status', () => {
    const report = buildUsersReport(users);
    expect(report.map((u) => u.userPrincipal)).toEqual([
      'ana.souza@oglobo.com.br',
      'luan.oliveira@oglobo.com.br',
    ]);
  });

  it('does not mutate the input array', () => {
    const original = [...users];
    buildUsersReport(users);
    expect(users).toEqual(original);
  });
});

describe('buildUsersReportClipboard', () => {
  it('renders the header row and one tab-separated row per user, without a "Tempo inativo" column', () => {
    const report = buildUsersReport(users);
    const { text } = buildUsersReportClipboard(report, configs);
    const lines = text.split('\n');

    expect(lines[0]).toBe('Email\tLicença\tStatus\tAtribuída em\tÚltimo acesso');
    expect(lines[1]).toBe('ana.souza@oglobo.com.br\tGemini Enterprise Standard\tSem licença\t16/01/2026\t—');
    expect(lines[2]).toBe('luan.oliveira@oglobo.com.br\tGemini Enterprise Standard\tAtribuída\t01/10/2025\t01/10/2025');
  });

  it('renders a matching HTML table', () => {
    const report = buildUsersReport(users);
    const { html } = buildUsersReportClipboard(report, configs);

    expect(html).toContain('<table');
    expect(html).toContain('<th');
    expect(html).toContain('Email');
    // 1 header row + 2 data rows
    expect((html.match(/<tr>/g) || []).length).toBe(3);
  });
});
