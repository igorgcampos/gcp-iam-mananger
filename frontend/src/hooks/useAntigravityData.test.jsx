import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAntigravityData } from './useAntigravityData';
import { getAntigravityUsage } from '../api/antigravity';

vi.mock('../api/antigravity', () => ({ getAntigravityUsage: vi.fn() }));

beforeEach(() => {
  getAntigravityUsage.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('useAntigravityData', () => {
  test('busca uma vez ao habilitar e expõe o resultado', async () => {
    const body = { since: '2026-11-24', usage: { 'a@x.com': { lastUse: '2026-11-25T15:00:00.000Z', activeDays: 1 } } };
    getAntigravityUsage.mockResolvedValue(body);

    const { result } = renderHook(() => useAntigravityData());

    await waitFor(() => expect(result.current.antigravity).toEqual(body));
    expect(getAntigravityUsage).toHaveBeenCalledTimes(1);
  });

  test('falha vira null, sem lançar e sem notificação', async () => {
    getAntigravityUsage.mockRejectedValue(new Error('Not found: Dataset'));

    const { result } = renderHook(() => useAntigravityData());

    await waitFor(() => expect(console.warn).toHaveBeenCalled());
    expect(result.current.antigravity).toBeNull();
  });

  test('depois de uma falha, tenta de novo quando refreshToken muda', async () => {
    const body = { since: '2026-11-24', usage: {} };
    getAntigravityUsage.mockRejectedValueOnce(new Error('timeout')).mockResolvedValue(body);

    const { result, rerender } = renderHook(({ token }) => useAntigravityData({ refreshToken: token }), {
      initialProps: { token: 1 },
    });
    await waitFor(() => expect(console.warn).toHaveBeenCalled());

    rerender({ token: 2 });

    await waitFor(() => expect(result.current.antigravity).toEqual(body));
    expect(getAntigravityUsage).toHaveBeenCalledTimes(2);
  });

  test('com o dado em mãos, refreshToken não refaz a busca', async () => {
    getAntigravityUsage.mockResolvedValue({ since: '2026-11-24', usage: {} });
    const { result, rerender } = renderHook(({ token }) => useAntigravityData({ refreshToken: token }), {
      initialProps: { token: 1 },
    });
    await waitFor(() => expect(result.current.antigravity).not.toBeNull());

    rerender({ token: 2 });
    await Promise.resolve();

    expect(getAntigravityUsage).toHaveBeenCalledTimes(1);
  });

  test('não busca enquanto desabilitado', async () => {
    renderHook(() => useAntigravityData({ enabled: false }));
    await Promise.resolve();
    expect(getAntigravityUsage).not.toHaveBeenCalled();
  });
});
