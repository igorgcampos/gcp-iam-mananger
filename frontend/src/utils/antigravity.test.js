import { describe, test, expect } from 'vitest';
import {
  getAntigravityUse, antigravityText, formatSince, ANTIGRAVITY_LAST_USE_INFO, GEMINI_LAST_ACCESS_INFO,
} from './antigravity';

const antigravity = {
  since: '2026-11-24',
  usage: { 'fulano@edglobo.com.br': { lastUse: '2026-11-25T15:00:00.000Z', activeDays: 2 } },
};

describe('getAntigravityUse', () => {
  test('casa o e-mail ignorando maiúsculas e espaços', () => {
    expect(getAntigravityUse(' Fulano@EdGlobo.com.br ', antigravity)).toEqual({ lastUse: '2026-11-25T15:00:00.000Z', activeDays: 2 });
  });

  test('null quando o usuário não tem uso registrado', () => {
    expect(getAntigravityUse('ciclano@edglobo.com.br', antigravity)).toBeNull();
  });

  test('undefined quando o dado está indisponível', () => {
    expect(getAntigravityUse('fulano@edglobo.com.br', null)).toBeUndefined();
  });
});

describe('antigravityText', () => {
  test('data pt-BR para quem usou', () => {
    expect(antigravityText('fulano@edglobo.com.br', antigravity)).toBe('25/11/2026');
  });

  test('"Sem uso desde" a data de início do rastreamento para quem não usou', () => {
    expect(antigravityText('ciclano@edglobo.com.br', antigravity)).toBe('Sem uso desde 24/11/2026');
  });

  test('"—" quando o dado está indisponível', () => {
    expect(antigravityText('fulano@edglobo.com.br', null)).toBe('—');
  });
});

describe('formatSince', () => {
  // Sem passar por new Date: '2026-11-24' em UTC viraria 23/11 em UTC-3.
  test('formata YYYY-MM-DD como dd/mm/aaaa sem deslocar o dia', () => {
    expect(formatSince('2026-11-24')).toBe('24/11/2026');
  });
});

describe('textos de ajuda das colunas', () => {
  test('explicam a diferença entre Gemini Enterprise e Antigravity', () => {
    expect(GEMINI_LAST_ACCESS_INFO).toBe('Última vez que o usuário usou o Gemini Enterprise (Agentspace).');
    expect(ANTIGRAVITY_LAST_USE_INFO).toBe(
      'Última vez que o usuário usou o Antigravity (IDE ou extensão do VS Code). '
      + 'Conta só o uso no projeto agentspace-469418 com a conta corporativa. Dados a partir de 24/11/2026.',
    );
  });
});
