import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CopyUsersReportButton from './CopyUsersReportButton';

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

function readBlobText(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}

describe('CopyUsersReportButton', () => {
  it('copies every user (any status) as an HTML table plus tab-separated text, and reports the count copied', async () => {
    const user = userEvent.setup();
    const writeMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { write: writeMock }, configurable: true });
    window.ClipboardItem = class {
      constructor(items) {
        this.items = items;
      }
    };

    render(<CopyUsersReportButton users={users} configs={configs} />);
    await user.click(screen.getByRole('button', { name: /copiar relatório de usuários/i }));

    expect(writeMock).toHaveBeenCalledTimes(1);
    const clipboardItem = writeMock.mock.calls[0][0][0];
    const [text, html] = await Promise.all([
      readBlobText(clipboardItem.items['text/plain']),
      readBlobText(clipboardItem.items['text/html']),
    ]);
    expect(text).toContain('luan.oliveira@oglobo.com.br');
    expect(text).toContain('ana.souza@oglobo.com.br');
    expect(html).toContain('<table');

    expect(await screen.findByText(/2 usuários copiados/i)).toBeInTheDocument();
  });

  it('falls back to plain-text copy when the rich clipboard API is unavailable', async () => {
    const user = userEvent.setup();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: writeTextMock }, configurable: true });
    delete window.ClipboardItem;

    render(<CopyUsersReportButton users={users} configs={configs} />);
    await user.click(screen.getByRole('button', { name: /copiar relatório de usuários/i }));

    expect(writeTextMock).toHaveBeenCalledTimes(1);
    expect(writeTextMock.mock.calls[0][0]).toContain('luan.oliveira@oglobo.com.br');
  });
});
