import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InactivityReportModal from './InactivityReportModal';

// jsdom does not implement matchMedia; Ant Design's responsive Grid/Table
// utilities call it internally, so it needs a minimal polyfill in tests.
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

const configs = [
  { name: 'configs/enterprise', subscriptionTier: 'SUBSCRIPTION_TIER_ENTERPRISE' },
];

const users = [
  {
    userPrincipal: 'caio.rosa@oglobo.com.br',
    licenseConfig: 'configs/enterprise',
    licenseAssignmentState: 'ASSIGNED',
    createTime: '2026-06-08T00:00:00',
    lastLoginTime: null,
  },
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
    licenseAssignmentState: 'ASSIGNED',
    createTime: '2026-01-16T00:00:00',
    lastLoginTime: '2026-01-16T00:00:00',
  },
];

describe('InactivityReportModal', () => {
  it('renders a trigger button and no modal content until clicked', () => {
    render(<InactivityReportModal users={users} configs={configs} onRemove={() => {}} />);
    expect(screen.getByRole('button', { name: /relatório de inatividade/i })).toBeInTheDocument();
    expect(screen.queryByText('luan.oliveira@oglobo.com.br')).not.toBeInTheDocument();
  });

  it('shows only ASSIGNED users past the default 2-month threshold, most inactive first, with a summary count', async () => {
    const user = userEvent.setup();
    render(<InactivityReportModal users={users} configs={configs} onRemove={() => {}} />);

    await user.click(screen.getByRole('button', { name: /relatório de inatividade/i }));

    expect(screen.getByText(/2 de 3 usuários inativos/i)).toBeInTheDocument();
    expect(screen.queryByText('caio.rosa@oglobo.com.br')).not.toBeInTheDocument();

    const rows = screen.getAllByRole('row').slice(1); // drop header row
    expect(within(rows[0]).getByText('luan.oliveira@oglobo.com.br')).toBeInTheDocument();
    expect(within(rows[1]).getByText('ana.souza@oglobo.com.br')).toBeInTheDocument();
  });

  it('recomputes the list when the month threshold changes', async () => {
    const user = userEvent.setup();
    render(<InactivityReportModal users={users} configs={configs} onRemove={() => {}} />);
    await user.click(screen.getByRole('button', { name: /relatório de inatividade/i }));

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByText('12 meses'));

    expect(screen.getByText(/0 de 3 usuários inativos/i)).toBeInTheDocument();
    expect(screen.queryByText('luan.oliveira@oglobo.com.br')).not.toBeInTheDocument();
  });

  it('calls onRemove with the userPrincipal after confirming removal', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<InactivityReportModal users={users} configs={configs} onRemove={onRemove} />);
    await user.click(screen.getByRole('button', { name: /relatório de inatividade/i }));

    const rows = screen.getAllByRole('row').slice(1);
    await user.click(within(rows[0]).getByRole('button', { name: /remover/i }));
    await user.click(await screen.findByRole('button', { name: /^remover$/i }));

    expect(onRemove).toHaveBeenCalledWith('luan.oliveira@oglobo.com.br');
  });
});
