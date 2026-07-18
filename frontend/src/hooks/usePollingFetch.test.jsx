import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePollingFetch } from './usePollingFetch';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePollingFetch', () => {
  test('chama fetchFn na montagem', async () => {
    const fetchFn = vi.fn().mockResolvedValue(undefined);
    renderHook(() => usePollingFetch(fetchFn));

    await act(async () => { await Promise.resolve(); });

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  test('loading é true durante fetch e false após', async () => {
    let resolve;
    const fetchFn = vi.fn().mockReturnValue(new Promise((r) => { resolve = r; }));

    const { result } = renderHook(() => usePollingFetch(fetchFn));

    expect(result.current.loading).toBe(true);

    await act(async () => { resolve(); await Promise.resolve(); });

    expect(result.current.loading).toBe(false);
  });

  test('lastUpdated é null antes do primeiro fetch e Date após', async () => {
    const fetchFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePollingFetch(fetchFn));

    expect(result.current.lastUpdated).toBeNull();

    await act(async () => { await Promise.resolve(); });

    expect(result.current.lastUpdated).toBeInstanceOf(Date);
  });

  test('polling repete fetchFn no intervalo configurado', async () => {
    const fetchFn = vi.fn().mockResolvedValue(undefined);
    renderHook(() => usePollingFetch(fetchFn, { interval: 5000 }));

    await act(async () => { await Promise.resolve(); });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  test('polling usa intervalo padrão de 30 segundos', async () => {
    const fetchFn = vi.fn().mockResolvedValue(undefined);
    renderHook(() => usePollingFetch(fetchFn));

    await act(async () => { await Promise.resolve(); });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(29_999);
      await Promise.resolve();
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  test('chama onError quando fetchFn falha', async () => {
    const error = new Error('falha de rede');
    const fetchFn = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();

    renderHook(() => usePollingFetch(fetchFn, { onError }));
    await act(async () => { await Promise.resolve(); });

    expect(onError).toHaveBeenCalledWith(error);
  });

  test('loading fica false mesmo quando fetchFn falha', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('erro'));
    const { result } = renderHook(() => usePollingFetch(fetchFn, { onError: () => {} }));

    await act(async () => { await Promise.resolve(); });

    expect(result.current.loading).toBe(false);
  });

  test('reload aciona fetchFn manualmente', async () => {
    const fetchFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePollingFetch(fetchFn));

    await act(async () => { await Promise.resolve(); });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.reload();
      await Promise.resolve();
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  test('cancela o intervalo ao desmontar o componente', async () => {
    const fetchFn = vi.fn().mockResolvedValue(undefined);
    const { unmount } = renderHook(() => usePollingFetch(fetchFn, { interval: 5000 }));

    await act(async () => { await Promise.resolve(); });
    unmount();

    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  test('usa a versão mais recente de fetchFn sem reiniciar o polling', async () => {
    let version = 'v1';
    const fetchFn = vi.fn().mockImplementation(async () => version);
    const { rerender } = renderHook(() => usePollingFetch(fetchFn, { interval: 5000 }));

    await act(async () => { await Promise.resolve(); });

    version = 'v2';
    rerender();

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
