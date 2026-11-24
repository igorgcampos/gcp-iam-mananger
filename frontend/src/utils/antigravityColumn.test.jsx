import {
  beforeAll, describe, test, expect,
} from 'vitest';
import {
  fireEvent, render, screen, within,
} from '@testing-library/react';
import { Table } from 'antd';
import { buildAntigravityColumn } from './antigravityColumn';
import { ANTIGRAVITY_LAST_USE_INFO } from './antigravity';

// jsdom não implementa matchMedia; a Table do antd usa (mesmo polyfill de
// InactivityReportModal.test.jsx).
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

const antigravity = {
  since: '2026-11-24',
  usage: {
    'usou@x.com': { lastUse: '2026-11-25T15:00:00.000Z', activeDays: 3 },
    'outro@x.com': { lastUse: '2026-11-26T15:00:00.000Z', activeDays: 1 },
  },
};

const users = [
  { userPrincipal: 'usou@x.com' },
  { userPrincipal: 'nunca@x.com' },
  { userPrincipal: 'outro@x.com' },
];

const renderTable = (data) => render(
  <Table
    dataSource={users}
    columns={[{ title: 'Email', dataIndex: 'userPrincipal', key: 'email' }, buildAntigravityColumn(data)]}
    rowKey="userPrincipal"
    pagination={false}
  />,
);

const emailsInOrder = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent);

describe('buildAntigravityColumn', () => {
  test('título "Último uso Antigravity" com ícone que explica o dado', async () => {
    renderTable(antigravity);
    expect(screen.getByText('Último uso Antigravity')).toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByRole('img', { name: 'info-circle' }));
    expect(await screen.findByText(ANTIGRAVITY_LAST_USE_INFO)).toBeInTheDocument();
  });

  test('passar o mouse no título mostra só a explicação, sem o tooltip de ordenação junto', async () => {
    renderTable(antigravity);

    fireEvent.mouseEnter(screen.getByRole('img', { name: 'info-circle' }));
    await screen.findByText(ANTIGRAVITY_LAST_USE_INFO);

    expect(screen.queryByText(/sort/i)).not.toBeInTheDocument();
  });

  test('mostra a data para quem usou e "Sem uso desde" para quem não usou', () => {
    renderTable(antigravity);
    expect(screen.getByText('25/11/2026')).toBeInTheDocument();
    expect(screen.getByText('Sem uso desde 24/11/2026')).toBeInTheDocument();
  });

  test('tooltip da data mostra os dias com uso', async () => {
    renderTable(antigravity);
    fireEvent.mouseEnter(screen.getByText('25/11/2026'));
    expect(await screen.findByText('3 dias com uso desde 24/11/2026')).toBeInTheDocument();
  });

  test('"—" em todas as linhas quando o dado está indisponível', () => {
    renderTable(null);
    expect(screen.getAllByText('—')).toHaveLength(3);
  });

  test('ordena por último uso, com quem não usou sempre no fim', () => {
    renderTable(antigravity);
    fireEvent.click(screen.getByText('Último uso Antigravity'));
    expect(emailsInOrder()).toEqual(['usou@x.com', 'outro@x.com', 'nunca@x.com']);
    fireEvent.click(screen.getByText('Último uso Antigravity'));
    expect(emailsInOrder()).toEqual(['outro@x.com', 'usou@x.com', 'nunca@x.com']);
  });

  test('ordenar com o dado indisponível não quebra', () => {
    renderTable(null);
    fireEvent.click(screen.getByText('Último uso Antigravity'));
    expect(emailsInOrder()).toHaveLength(3);
  });

  test('filtros "Usou" e "Sem uso"', () => {
    const column = buildAntigravityColumn(antigravity);
    expect(column.filters).toEqual([{ text: 'Usou', value: 'usou' }, { text: 'Sem uso', value: 'sem-uso' }]);
    expect(users.filter((u) => column.onFilter('sem-uso', u)).map((u) => u.userPrincipal)).toEqual(['nunca@x.com']);
    expect(users.filter((u) => column.onFilter('usou', u)).map((u) => u.userPrincipal)).toEqual(['usou@x.com', 'outro@x.com']);
  });

  test('sem filtros quando o dado está indisponível', () => {
    expect(buildAntigravityColumn(null).filters).toBeUndefined();
  });
});
