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
    const { text } = buildUsersReportClipboard(report, configs, { 'ana.souza@oglobo.com.br': 'AUDIÊNCIA', 'luan.oliveira@oglobo.com.br': 'CBN' });
    const lines = text.split('\n');

    expect(lines[0]).toBe('Email\tDiretoria\tLicença\tStatus\tAtribuída em\tÚltimo acesso\tÚltimo uso Antigravity');
    expect(lines[1]).toBe('ana.souza@oglobo.com.br\tAUDIÊNCIA\tGemini Enterprise Standard\tSem licença\t16/01/2026\t—\t—');
    expect(lines[2]).toBe('luan.oliveira@oglobo.com.br\tCBN\tGemini Enterprise Standard\tAtribuída\t01/10/2025\t01/10/2025\t—');
  });

  it('acha a Diretoria mesmo com e-mail em maiúsculas vindo do Gemini', () => {
    const report = [{ ...users[1], userPrincipal: 'Ana.Souza@oglobo.com.br' }];
    const { text } = buildUsersReportClipboard(report, configs, { 'ana.souza@oglobo.com.br': 'AUDIÊNCIA' });
    expect(text.split('\n')[1].split('\t')[1]).toBe('AUDIÊNCIA');
  });

  it('escreve "Sem Diretoria" para null e "—" para desconhecido', () => {
    const report = buildUsersReport(users);
    const { text } = buildUsersReportClipboard(report, configs, { 'ana.souza@oglobo.com.br': null });
    const cells = text.split('\n').slice(1).map((l) => l.split('\t')[1]);
    expect(cells).toEqual(['Sem Diretoria', '—']);
  });

  it('escreve "—" em todas as linhas quando a busca de Diretorias falhou', () => {
    const report = buildUsersReport(users);
    const { text } = buildUsersReportClipboard(report, configs, null);
    const cells = text.split('\n').slice(1).map((l) => l.split('\t')[1]);
    expect(cells).toEqual(['—', '—']);
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

  it('traz o Último uso Antigravity, com "Sem uso desde" para quem não usou', () => {
    const report = buildUsersReport(users);
    const antigravity = { since: '2026-11-24', usage: { 'luan.oliveira@oglobo.com.br': { lastUse: '2026-11-25T15:00:00.000Z', activeDays: 1 } } };
    const { text } = buildUsersReportClipboard(report, configs, null, antigravity);
    const cells = text.split('\n').slice(1).map((l) => l.split('\t')[6]);
    expect(cells).toEqual(['Sem uso desde 24/11/2026', '25/11/2026']);
  });
});
