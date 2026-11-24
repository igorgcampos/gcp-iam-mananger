import {
  afterEach, beforeAll, beforeEach, describe, expect, it, vi,
} from 'vitest';
import { render, screen } from '@testing-library/react';
import DashboardPage from './DashboardPage';

// jsdom não implementa matchMedia; o Grid/Table do antd usa (mesmo polyfill
// de InactivityReportModal.test.jsx).
beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2027-03-01T12:00:00'));
});

afterEach(() => {
  vi.useRealTimers();
});

// Os dois sem acesso ao Gemini Enterprise desde 2025 (≥ 3 meses).
const geminiUsers = [
  {
    userPrincipal: 'dev@x.com', licenseConfig: 'configs/e', licenseAssignmentState: 'ASSIGNED',
    createTime: '2025-01-01T00:00:00', lastLoginTime: '2025-06-01T00:00:00',
  },
  {
    userPrincipal: 'parado@x.com', licenseConfig: 'configs/e', licenseAssignmentState: 'ASSIGNED',
    createTime: '2025-01-01T00:00:00', lastLoginTime: '2025-06-01T00:00:00',
  },
];

const renderDashboard = (props) => render(
  <DashboardPage
    iamUsers={[]}
    iamLoading={false}
    reloadIam={() => {}}
    geminiUsers={geminiUsers}
    configs={[]}
    geminiLoading={false}
    reloadGemini={() => {}}
    {...props}
  />,
);

const inactiveCardValue = () => screen.getByText('Usuários inativos').closest('.stat-card').querySelector('.ant-statistic-content').textContent;

describe('DashboardPage — Usuários inativos', () => {
  it('não conta quem usou o Antigravity recentemente', () => {
    renderDashboard({
      antigravity: { since: '2026-11-24', usage: { 'dev@x.com': { lastUse: '2027-02-28T15:00:00.000Z', activeDays: 30 } } },
    });
    expect(inactiveCardValue()).toBe('1');
  });

  it('sem o dado do Antigravity mostra "—", não um 0', () => {
    renderDashboard({ antigravity: null });
    expect(inactiveCardValue()).toBe('—');
  });
});
