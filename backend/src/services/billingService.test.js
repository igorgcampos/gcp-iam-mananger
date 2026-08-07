const { categorizeCosts } = require('./billingService');

const OLD_ENV = process.env;

jest.mock('./gcpClients', () => ({
  bigquery: { jobs: { query: jest.fn() } },
}));

function mockQueryResult(rows) {
  return {
    data: {
      schema: { fields: [{ name: 'service' }, { name: 'cost' }, { name: 'currency' }] },
      rows: rows.map(({ service, cost, currency }) => ({
        f: [{ v: service }, { v: String(cost) }, { v: currency }],
      })),
    },
  };
}

describe('getBillingSummary', () => {
  let getBillingSummary;
  let queryMock;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    process.env = { ...OLD_ENV, GCP_PROJECT_ID: 'agentspace-469418', BILLING_EXPORT_TABLE: 'proj.ds.tbl' };
    // eslint-disable-next-line global-require
    ({ bigquery: { jobs: { query: queryMock } } } = require('./gcpClients'));
    // eslint-disable-next-line global-require
    ({ getBillingSummary } = require('./billingService'));
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env = OLD_ENV;
  });

  test('consulta o BigQuery filtrando pelo projeto e devolve o resumo categorizado', async () => {
    queryMock.mockResolvedValue(mockQueryResult([
      { service: 'Vertex AI Search', cost: 100, currency: 'BRL' },
      { service: 'Cloud Run', cost: 10, currency: 'BRL' },
    ]));

    const summary = await getBillingSummary();

    expect(summary).toMatchObject({
      gemini: 100, infra: 10, uncategorized: 0, total: 110, currency: 'BRL',
    });
    expect(summary.updatedAt).toBeDefined();
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [call] = queryMock.mock.calls[0];
    expect(call.projectId).toBe('agentspace-469418');
    expect(call.requestBody.queryParameters[0].parameterValue.value).toBe('agentspace-469418');
  });

  test('usa o cache em chamadas subsequentes dentro do TTL', async () => {
    queryMock.mockResolvedValue(mockQueryResult([{ service: 'Cloud Run', cost: 1, currency: 'BRL' }]));

    await getBillingSummary();
    await getBillingSummary();

    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  test('refaz a query depois que o TTL do cache expira', async () => {
    queryMock.mockResolvedValue(mockQueryResult([{ service: 'Cloud Run', cost: 1, currency: 'BRL' }]));

    await getBillingSummary();
    jest.advanceTimersByTime(5 * 60 * 60 * 1000); // 5h > TTL de 4h
    await getBillingSummary();

    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  test('chamadas concorrentes com cache vazio compartilham a mesma query em andamento', async () => {
    queryMock.mockResolvedValue(mockQueryResult([{ service: 'Cloud Run', cost: 1, currency: 'BRL' }]));

    const [a, b] = await Promise.all([getBillingSummary(), getBillingSummary()]);

    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });
});

describe('categorizeCosts', () => {
  test('soma Gemini, Infra e Não categorizado, e eles fecham com o total', () => {
    const rows = [
      { service: 'Vertex AI Search', sku: 'Vertex AI Search Query API', cost: 1696.14, currency: 'BRL' },
      { service: 'Cloud Run', sku: 'Cloud Run - CPU Allocation Time', cost: 42.5, currency: 'BRL' },
      { service: 'Artifact Registry', sku: 'Artifact Registry Storage', cost: 3.2, currency: 'BRL' },
      { service: 'Cloud Storage', sku: 'Standard Storage', cost: 7.1, currency: 'BRL' }, // não está em nenhuma lista
    ];

    const result = categorizeCosts(rows);

    expect(result.gemini).toBe(1696.14);
    expect(result.infra).toBe(45.7);
    expect(result.uncategorized).toBe(7.1);
    expect(result.total).toBeCloseTo(1748.94, 2);
    expect(result.total).toBeCloseTo(result.gemini + result.infra + result.uncategorized, 2);
  });

  test('usa a moeda da primeira linha', () => {
    const result = categorizeCosts([{ service: 'Cloud Run', sku: 'Cloud Run - CPU Allocation Time', cost: 10, currency: 'USD' }]);
    expect(result.currency).toBe('USD');
  });

  test('retorna zeros, moeda padrão BRL e items vazios para lista vazia', () => {
    const result = categorizeCosts([]);
    expect(result).toEqual({
      gemini: 0,
      infra: 0,
      uncategorized: 0,
      total: 0,
      currency: 'BRL',
      items: { gemini: [], infra: [], uncategorized: [] },
    });
  });

  test('arredonda para 2 casas decimais mesmo com soma de ponto flutuante imprecisa', () => {
    const rows = [
      { service: 'Vertex AI Search', sku: 'Vertex AI Search Query API', cost: 0.1, currency: 'BRL' },
      { service: 'Vertex AI Search', sku: 'Vertex AI Search Query API', cost: 0.2, currency: 'BRL' },
    ];
    expect(categorizeCosts(rows).gemini).toBe(0.3);
  });

  test('categoriza "Vertex AI" (sem "Search") também como Gemini', () => {
    const result = categorizeCosts([{ service: 'Vertex AI', sku: 'Vertex AI Online Prediction', cost: 40.73, currency: 'BRL' }]);
    expect(result.gemini).toBe(40.73);
    expect(result.uncategorized).toBe(0);
  });

  test('agrupa items por Serviço e, dentro de cada um, por SKU', () => {
    const rows = [
      { service: 'Vertex AI Search', sku: 'Query API', cost: 100, currency: 'BRL' },
      { service: 'Vertex AI Search', sku: 'Storage', cost: 50, currency: 'BRL' },
      { service: 'Vertex AI', sku: 'Online Prediction', cost: 30, currency: 'BRL' },
    ];

    const { items } = categorizeCosts(rows);

    expect(items.gemini).toEqual([
      {
        service: 'Vertex AI Search',
        cost: 150,
        skus: [
          { sku: 'Query API', cost: 100 },
          { sku: 'Storage', cost: 50 },
        ],
      },
      { service: 'Vertex AI', cost: 30, skus: [{ sku: 'Online Prediction', cost: 30 }] },
    ]);
    expect(items.infra).toEqual([]);
    expect(items.uncategorized).toEqual([]);
  });

  test('ordena Serviços e SKUs por custo decrescente', () => {
    const rows = [
      { service: 'Cloud Run', sku: 'Requests', cost: 5, currency: 'BRL' },
      { service: 'Cloud Run', sku: 'CPU Allocation Time', cost: 20, currency: 'BRL' },
      { service: 'BigQuery', sku: 'Analysis', cost: 40, currency: 'BRL' },
    ];

    const { items } = categorizeCosts(rows);

    expect(items.infra.map((s) => s.service)).toEqual(['BigQuery', 'Cloud Run']);
    expect(items.infra[1].skus.map((s) => s.sku)).toEqual(['CPU Allocation Time', 'Requests']);
  });

  test('soma linhas repetidas do mesmo Serviço+SKU (defesa contra duplicidade)', () => {
    const rows = [
      { service: 'Cloud Run', sku: 'Requests', cost: 5, currency: 'BRL' },
      { service: 'Cloud Run', sku: 'Requests', cost: 2.5, currency: 'BRL' },
    ];

    const { items } = categorizeCosts(rows);

    expect(items.infra).toEqual([{ service: 'Cloud Run', cost: 7.5, skus: [{ sku: 'Requests', cost: 7.5 }] }]);
  });
});
