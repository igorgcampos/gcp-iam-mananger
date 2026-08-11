import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

// buildInactivityReport() usa `new Date()` como "agora" por padrão (ver
// utils/inactivity.js), então os cenários abaixo — escritos para uma data
// fixa, como em inactivity.test.js — ficam dependentes de quando o teste
// roda de verdade. Só o relógio (`Date`) é congelado, não os timers
// (setTimeout/setInterval), pra não travar as esperas internas do userEvent.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-07-16T00:00:00'));
});

afterEach(() => {
  vi.useRealTimers();
});

const configs = [
  { name: 'configs/enterprise', subscriptionTier: 'SUBSCRIPTION_TIER_ENTERPRISE' },
];

function readBlobText(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}

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

  it('copies the report as an HTML table plus tab-separated text when "Copiar tabela" is clicked', async () => {
    const user = userEvent.setup();
    const writeMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { write: writeMock }, configurable: true });
    window.ClipboardItem = class {
      constructor(items) {
        this.items = items;
      }
    };

    render(<InactivityReportModal users={users} configs={configs} onRemove={() => {}} />);
    await user.click(screen.getByRole('button', { name: /relatório de inatividade/i }));
    await user.click(screen.getByRole('button', { name: /copiar tabela/i }));

    expect(writeMock).toHaveBeenCalledTimes(1);
    const clipboardItem = writeMock.mock.calls[0][0][0];
    const [text, html] = await Promise.all([
      readBlobText(clipboardItem.items['text/plain']),
      readBlobText(clipboardItem.items['text/html']),
    ]);
    expect(text).toContain('luan.oliveira@oglobo.com.br');
    expect(html).toContain('<table');

    expect(await screen.findByText(/tabela copiada/i)).toBeInTheDocument();
  });

  it('falls back to plain-text copy when the rich clipboard API is unavailable', async () => {
    const user = userEvent.setup();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: writeTextMock }, configurable: true });
    delete window.ClipboardItem;

    render(<InactivityReportModal users={users} configs={configs} onRemove={() => {}} />);
    await user.click(screen.getByRole('button', { name: /relatório de inatividade/i }));
    await user.click(screen.getByRole('button', { name: /copiar tabela/i }));

    expect(writeTextMock).toHaveBeenCalledTimes(1);
    expect(writeTextMock.mock.calls[0][0]).toContain('luan.oliveira@oglobo.com.br');
  });

  it('disables the copy button when there are no inactive users to report', async () => {
    const user = userEvent.setup();
    render(<InactivityReportModal users={users} configs={configs} onRemove={() => {}} />);
    await user.click(screen.getByRole('button', { name: /relatório de inatividade/i }));

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByText('12 meses'));

    expect(screen.getByRole('button', { name: /copiar tabela/i })).toBeDisabled();
  });
});
