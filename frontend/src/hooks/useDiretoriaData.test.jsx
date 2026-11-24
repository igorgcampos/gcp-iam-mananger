import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDiretoriaData } from './useDiretoriaData';
import { lookupDiretorias } from '../api/diretoria';

vi.mock('../api/diretoria', () => ({ lookupDiretorias: vi.fn() }));

const u = (userPrincipal) => ({ userPrincipal });

beforeEach(() => {
  lookupDiretorias.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('useDiretoriaData', () => {
  test('busca com os e-mails em minúsculas, deduplicados e ordenados', async () => {
    lookupDiretorias.mockResolvedValue({ 'a@x.com': 'TI', 'b@x.com': null });

    const { result } = renderHook(() => useDiretoriaData([u('B@x.com'), u('a@x.com'), u('b@x.com')]));

    await waitFor(() => expect(result.current.diretorias).toEqual({ 'a@x.com': 'TI', 'b@x.com': null }));
    expect(lookupDiretorias).toHaveBeenCalledTimes(1);
    expect(lookupDiretorias).toHaveBeenCalledWith(['a@x.com', 'b@x.com']);
  });

  test('não refaz a chamada quando chega um array novo com os mesmos e-mails (polling)', async () => {
    lookupDiretorias.mockResolvedValue({ 'a@x.com': 'TI' });
    const { result, rerender } = renderHook(({ users }) => useDiretoriaData(users), {
      initialProps: { users: [u('a@x.com')] },
    });
    await waitFor(() => expect(result.current.diretorias).toEqual({ 'a@x.com': 'TI' }));

    rerender({ users: [u('a@x.com')] });
    await Promise.resolve();

    expect(lookupDiretorias).toHaveBeenCalledTimes(1);
  });

  test('refaz a chamada quando entra um e-mail novo', async () => {
    lookupDiretorias.mockResolvedValue({ 'a@x.com': 'TI', 'b@x.com': 'CBN' });
    const { rerender } = renderHook(({ users }) => useDiretoriaData(users), {
      initialProps: { users: [u('a@x.com')] },
    });
    await waitFor(() => expect(lookupDiretorias).toHaveBeenCalledTimes(1));

    rerender({ users: [u('a@x.com'), u('b@x.com')] });

    await waitFor(() => expect(lookupDiretorias).toHaveBeenCalledTimes(2));
    expect(lookupDiretorias).toHaveBeenLastCalledWith(['a@x.com', 'b@x.com']);
  });

  test('diretorias fica null quando a chamada falha', async () => {
    lookupDiretorias.mockRejectedValue(new Error('502'));

    const { result } = renderHook(() => useDiretoriaData([u('a@x.com')]));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(lookupDiretorias).toHaveBeenCalledTimes(1);
    expect(result.current.diretorias).toBeNull();
  });

  test('não chama nada com enabled=false ou lista vazia', async () => {
    renderHook(() => useDiretoriaData([u('a@x.com')], { enabled: false }));
    renderHook(() => useDiretoriaData([]));
    await Promise.resolve();

    expect(lookupDiretorias).not.toHaveBeenCalled();
  });

  test('depois de uma falha, refaz a chamada quando refreshToken muda com os mesmos e-mails', async () => {
    lookupDiretorias.mockRejectedValueOnce(new Error('502')).mockResolvedValueOnce({ 'a@x.com': 'TI' });
    const { result, rerender } = renderHook(({ token }) => useDiretoriaData([u('a@x.com')], { refreshToken: token }), {
      initialProps: { token: 1 },
    });
    await waitFor(() => expect(lookupDiretorias).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ token: 2 });

    await waitFor(() => expect(result.current.diretorias).toEqual({ 'a@x.com': 'TI' }));
    expect(lookupDiretorias).toHaveBeenCalledTimes(2);
  });

  test('com resultado incompleto (e-mail ausente no mapa), refaz quando refreshToken muda', async () => {
    lookupDiretorias
      .mockResolvedValueOnce({ 'a@x.com': 'TI' })
      .mockResolvedValueOnce({ 'a@x.com': 'TI', 'b@x.com': 'CBN' });
    const users = [u('a@x.com'), u('b@x.com')];
    const { result, rerender } = renderHook(({ token }) => useDiretoriaData(users, { refreshToken: token }), {
      initialProps: { token: 1 },
    });
    await waitFor(() => expect(result.current.diretorias).toEqual({ 'a@x.com': 'TI' }));

    rerender({ token: 2 });

    await waitFor(() => expect(result.current.diretorias).toEqual({ 'a@x.com': 'TI', 'b@x.com': 'CBN' }));
    expect(lookupDiretorias).toHaveBeenCalledTimes(2);
  });

  test('com resultado completo, refreshToken novo não refaz a chamada', async () => {
    lookupDiretorias.mockResolvedValue({ 'a@x.com': 'TI' });
    const { result, rerender } = renderHook(({ token }) => useDiretoriaData([u('a@x.com')], { refreshToken: token }), {
      initialProps: { token: 1 },
    });
    await waitFor(() => expect(result.current.diretorias).toEqual({ 'a@x.com': 'TI' }));

    rerender({ token: 2 });
    await Promise.resolve();

    expect(lookupDiretorias).toHaveBeenCalledTimes(1);
  });
});
