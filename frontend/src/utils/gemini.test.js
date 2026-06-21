import { describe, test, expect } from 'vitest';
import { tierName, tierColor, formatDate } from './gemini';

describe('tierName', () => {
  test('retorna nome legível para ENTERPRISE', () => {
    expect(tierName('SUBSCRIPTION_TIER_ENTERPRISE')).toBe('Gemini Enterprise Standard');
  });

  test('retorna nome legível para SEARCH_AND_ASSISTANT', () => {
    expect(tierName('SUBSCRIPTION_TIER_SEARCH_AND_ASSISTANT')).toBe('Agentspace Enterprise Plus');
  });

  test('retorna o próprio valor para tier desconhecido', () => {
    expect(tierName('SUBSCRIPTION_TIER_UNKNOWN')).toBe('SUBSCRIPTION_TIER_UNKNOWN');
  });

  test('retorna "Licença" quando tier é undefined', () => {
    expect(tierName(undefined)).toBe('Licença');
  });

  test('retorna "Licença" quando tier é string vazia', () => {
    expect(tierName('')).toBe('Licença');
  });
});

describe('tierColor', () => {
  test('retorna "purple" para licença Plus', () => {
    expect(tierColor('Agentspace Enterprise Plus')).toBe('purple');
  });

  test('retorna "blue" para licença Standard', () => {
    expect(tierColor('Gemini Enterprise Standard')).toBe('blue');
  });

  test('retorna "default" para nome desconhecido', () => {
    expect(tierColor('Outro Plano')).toBe('default');
  });

  test('retorna "default" quando chamado sem argumento', () => {
    expect(tierColor()).toBe('default');
  });
});

describe('formatDate', () => {
  test('formata objeto de data GCP corretamente', () => {
    expect(formatDate({ year: 2025, month: 3, day: 5 })).toBe('05/03/2025');
  });

  test('adiciona zero à esquerda em dia e mês de um dígito', () => {
    expect(formatDate({ year: 2025, month: 1, day: 1 })).toBe('01/01/2025');
  });

  test('retorna null quando d é null', () => {
    expect(formatDate(null)).toBeNull();
  });

  test('retorna null quando d é undefined', () => {
    expect(formatDate(undefined)).toBeNull();
  });

  test('retorna null quando d não tem campo year', () => {
    expect(formatDate({ month: 1, day: 1 })).toBeNull();
  });
});
