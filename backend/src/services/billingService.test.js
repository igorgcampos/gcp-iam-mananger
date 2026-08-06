const { categorizeCosts } = require('./billingService');

describe('categorizeCosts', () => {
  test('soma Gemini, Infra e Não categorizado, e eles fecham com o total', () => {
    const rows = [
      { service: 'Vertex AI Search', cost: 1696.14, currency: 'BRL' },
      { service: 'Cloud Run', cost: 42.5, currency: 'BRL' },
      { service: 'Artifact Registry', cost: 3.2, currency: 'BRL' },
      { service: 'Cloud Storage', cost: 7.1, currency: 'BRL' }, // não está em nenhuma lista
    ];

    const result = categorizeCosts(rows);

    expect(result.gemini).toBe(1696.14);
    expect(result.infra).toBe(45.7);
    expect(result.uncategorized).toBe(7.1);
    expect(result.total).toBeCloseTo(1748.94, 2);
    expect(result.total).toBeCloseTo(result.gemini + result.infra + result.uncategorized, 2);
  });

  test('usa a moeda da primeira linha', () => {
    const result = categorizeCosts([{ service: 'Cloud Run', cost: 10, currency: 'USD' }]);
    expect(result.currency).toBe('USD');
  });

  test('retorna zeros e moeda padrão BRL para lista vazia', () => {
    const result = categorizeCosts([]);
    expect(result).toEqual({
      gemini: 0, infra: 0, uncategorized: 0, total: 0, currency: 'BRL',
    });
  });

  test('arredonda para 2 casas decimais mesmo com soma de ponto flutuante imprecisa', () => {
    const rows = [
      { service: 'Vertex AI Search', cost: 0.1, currency: 'BRL' },
      { service: 'Vertex AI Search', cost: 0.2, currency: 'BRL' },
    ];
    expect(categorizeCosts(rows).gemini).toBe(0.3);
  });
});
