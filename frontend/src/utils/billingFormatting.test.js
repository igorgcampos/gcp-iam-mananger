import { describe, expect, it } from 'vitest';
import { formatCurrency } from './billingFormatting';

describe('formatCurrency', () => {
  it('formata em BRL por padrão', () => {
    expect(formatCurrency(1234.5)).toMatch(/R\$\s?1\.234,50/);
  });

  it('formata zero', () => {
    expect(formatCurrency(0)).toMatch(/R\$\s?0,00/);
  });

  it('usa zero quando o valor é undefined/null', () => {
    expect(formatCurrency(undefined)).toMatch(/R\$\s?0,00/);
    expect(formatCurrency(null)).toMatch(/R\$\s?0,00/);
  });

  it('respeita uma moeda diferente', () => {
    expect(formatCurrency(10, 'USD')).toMatch(/US\$\s?10,00/);
  });
});
