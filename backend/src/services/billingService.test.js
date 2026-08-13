const {
  categorizeCosts, groupCostByProject, LICENSE_SERVICES, API_SERVICES,
} = require('./billingService');

const OLD_ENV = process.env;
const VERTEX_SERVICES = [...LICENSE_SERVICES, ...API_SERVICES];

jest.mock('./gcpClients', () => ({
  bigquery: { jobs: { query: jest.fn() } },
}));

function mockQueryResult(rows) {
  return {
    data: {
      schema: { fields: [{ name: 'service' }, { name: 'sku' }, { name: 'cost' }, { name: 'currency' }] },
      rows: rows.map(({
        service, sku, cost, currency,
      }) => ({
        f: [{ v: service }, { v: sku }, { v: String(cost) }, { v: currency }],
      })),
    },
  };
}

function mockProjectQueryResult(rows) {
  return {
    data: {
      schema: { fields: [{ name: 'projectId' }, { name: 'service' }, { name: 'sku' }, { name: 'cost' }, { name: 'currency' }] },
      rows: rows.map(({
        projectId, service, sku, cost, currency,
      }) => ({
        f: [{ v: projectId }, { v: service }, { v: sku }, { v: String(cost) }, { v: currency }],
      })),
    },
  };
}

function hasProjectIdParam(args) {
  return args.requestBody.queryParameters.some((p) => p.name === 'projectId');
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
      { service: 'Vertex AI Search', sku: 'Query API', cost: 100, currency: 'BRL' },
      { service: 'Cloud Run', sku: 'CPU Allocation Time', cost: 10, currency: 'BRL' },
    ]));

    const summary = await getBillingSummary();

    expect(summary).toMatchObject({
      licenses: 100, vertexApi: 0, infra: 10, uncategorized: 0, total: 110, currency: 'BRL',
    });
    expect(summary.items.licenses).toEqual([{ service: 'Vertex AI Search', cost: 100, skus: [{ sku: 'Query API', cost: 100 }] }]);
    expect(summary.updatedAt).toBeDefined();
    expect(queryMock).toHaveBeenCalledTimes(2);
    const [call] = queryMock.mock.calls.find(([args]) => hasProjectIdParam(args));
    expect(call.projectId).toBe('agentspace-469418');
    expect(call.requestBody.queryParameters[0].parameterValue.value).toBe('agentspace-469418');
  });

  test('a query passa LICENSE_SERVICES + API_SERVICES como parâmetro, pra pegar assinaturas sem project.id', async () => {
    queryMock.mockResolvedValue(mockQueryResult([{
      service: 'Cloud Run', sku: 'CPU Allocation Time', cost: 1, currency: 'BRL',
    }]));

    await getBillingSummary();

    const [call] = queryMock.mock.calls[0];
    const geminiParam = call.requestBody.queryParameters.find((p) => p.name === 'geminiServices');
    expect(geminiParam.parameterType).toEqual({ type: 'ARRAY', arrayType: { type: 'STRING' } });
    expect(geminiParam.parameterValue.arrayValues).toEqual(
      VERTEX_SERVICES.map((v) => ({ value: v })),
    );
  });

  test('usa o cache em chamadas subsequentes dentro do TTL', async () => {
    queryMock.mockResolvedValue(mockQueryResult([{
      service: 'Cloud Run', sku: 'CPU Allocation Time', cost: 1, currency: 'BRL',
    }]));

    await getBillingSummary();
    await getBillingSummary();

    // 2 chamadas (query escopada + query cross-project) num único fetch, não 4
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  test('refaz as duas queries depois que o TTL do cache expira', async () => {
    queryMock.mockResolvedValue(mockQueryResult([{
      service: 'Cloud Run', sku: 'CPU Allocation Time', cost: 1, currency: 'BRL',
    }]));

    await getBillingSummary();
    jest.advanceTimersByTime(5 * 60 * 60 * 1000); // 5h > TTL de 4h
    await getBillingSummary();

    expect(queryMock).toHaveBeenCalledTimes(4);
  });

  test('chamadas concorrentes com cache vazio compartilham a mesma query em andamento', async () => {
    queryMock.mockResolvedValue(mockQueryResult([{
      service: 'Cloud Run', sku: 'CPU Allocation Time', cost: 1, currency: 'BRL',
    }]));

    const [a, b] = await Promise.all([getBillingSummary(), getBillingSummary()]);

    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(a).toEqual(b);
  });

  test('usa "Outros" quando sku.description vem nulo do BigQuery', async () => {
    queryMock.mockResolvedValue(mockQueryResult([
      { service: 'Cloud Run', sku: null, cost: 5, currency: 'BRL' },
    ]));

    const summary = await getBillingSummary();

    expect(summary.items.infra).toEqual([{ service: 'Cloud Run', cost: 5, skus: [{ sku: 'Outros', cost: 5 }] }]);
  });

  test('também consulta o custo Vertex por projeto, sem filtro de project.id, e devolve dividido em licensesByProject/apiByProject (ADR 0011)', async () => {
    queryMock.mockImplementation((args) => {
      if (hasProjectIdParam(args)) {
        return Promise.resolve(mockQueryResult([
          { service: 'Vertex AI Search', sku: 'Query API', cost: 100, currency: 'BRL' },
        ]));
      }
      return Promise.resolve(mockProjectQueryResult([
        { projectId: 'agentspace-469418', service: 'Vertex AI Search', sku: 'Query API', cost: 100, currency: 'BRL' },
        { projectId: 'outro-projeto', service: 'Vertex AI', sku: 'Online Prediction', cost: 15, currency: 'BRL' },
      ]));
    });

    const summary = await getBillingSummary();

    expect(summary.licensesByProject.total).toBe(100);
    expect(summary.licensesByProject.byProject['agentspace-469418']).toEqual({
      label: 'agentspace-469418',
      total: 100,
      items: [{ service: 'Vertex AI Search', cost: 100, skus: [{ sku: 'Query API', cost: 100 }] }],
    });
    expect(summary.licensesByProject.byProject['outro-projeto']).toBeUndefined();

    expect(summary.apiByProject.total).toBe(15);
    expect(summary.apiByProject.byProject['outro-projeto']).toEqual({
      label: 'outro-projeto',
      total: 15,
      items: [{ service: 'Vertex AI', cost: 15, skus: [{ sku: 'Online Prediction', cost: 15 }] }],
    });
    expect(summary.apiByProject.byProject['agentspace-469418']).toBeUndefined();
  });

  test('linhas sem project.id na query cross-project somam ao bucket do agentspace-469418 (projeto desta app)', async () => {
    queryMock.mockImplementation((args) => {
      if (hasProjectIdParam(args)) return Promise.resolve(mockQueryResult([]));
      return Promise.resolve(mockProjectQueryResult([
        { projectId: null, service: 'Vertex AI Search', sku: 'Gemini Enterprise Standard: Subscription - one year term', cost: 1000, currency: 'BRL' },
        { projectId: 'agentspace-469418', service: 'Vertex AI Search', sku: 'Query API', cost: 100, currency: 'BRL' },
      ]));
    });

    const summary = await getBillingSummary();

    expect(summary.licensesByProject.byProject['agentspace-469418'].total).toBe(1100);
    expect(Object.keys(summary.licensesByProject.byProject)).toEqual(['agentspace-469418']);
  });

  test('a query cross-project não envia project.id como parâmetro, só geminiServices', async () => {
    queryMock.mockResolvedValue(mockQueryResult([]));

    await getBillingSummary();

    const call = queryMock.mock.calls.find(([args]) => !hasProjectIdParam(args));
    expect(call).toBeDefined();
    const [args] = call;
    expect(args.requestBody.queryParameters).toEqual([
      {
        name: 'geminiServices',
        parameterType: { type: 'ARRAY', arrayType: { type: 'STRING' } },
        parameterValue: { arrayValues: VERTEX_SERVICES.map((v) => ({ value: v })) },
      },
    ]);
  });
});

describe('groupCostByProject', () => {
  test('agrupa por project.id, com total e items por Serviço/SKU dentro de cada projeto', () => {
    const rows = [
      { projectId: 'projeto-a', service: 'Vertex AI', sku: 'Online Prediction', cost: 30, currency: 'BRL' },
      { projectId: 'projeto-b', service: 'Vertex AI Search', sku: 'Query API', cost: 20, currency: 'BRL' },
    ];

    const result = groupCostByProject(rows, 'agentspace-469418');

    expect(result.total).toBe(50);
    expect(result.byProject['projeto-a']).toEqual({
      label: 'projeto-a',
      total: 30,
      items: [{ service: 'Vertex AI', cost: 30, skus: [{ sku: 'Online Prediction', cost: 30 }] }],
    });
    expect(result.byProject['projeto-b']).toEqual({
      label: 'projeto-b',
      total: 20,
      items: [{ service: 'Vertex AI Search', cost: 20, skus: [{ sku: 'Query API', cost: 20 }] }],
    });
  });

  test('linhas com project.id nulo somam ao bucket do projeto desta app (homeProjectId), igual à query escopada (ADR 0008)', () => {
    const rows = [
      {
        projectId: null,
        service: 'Vertex AI Search',
        sku: 'Gemini Enterprise Standard: Subscription - one year term',
        cost: 1000,
        currency: 'BRL',
      },
      { projectId: 'agentspace-469418', service: 'Vertex AI Search', sku: 'Query API', cost: 50, currency: 'BRL' },
      { projectId: 'projeto-a', service: 'Vertex AI Search', sku: 'Query API', cost: 30, currency: 'BRL' },
    ];

    const result = groupCostByProject(rows, 'agentspace-469418');

    expect(Object.keys(result.byProject).sort()).toEqual(['agentspace-469418', 'projeto-a']);
    expect(result.byProject['agentspace-469418'].total).toBe(1050);
    expect(result.byProject['projeto-a'].total).toBe(30);
    expect(result.total).toBe(1080);
  });

  test('lista vazia retorna total zero e nenhum projeto', () => {
    expect(groupCostByProject([], 'agentspace-469418')).toEqual({ total: 0, byProject: {} });
  });
});

describe('categorizeCosts', () => {
  test('soma Licenças, API, Infra e Outros Serviços, e eles fecham com o total', () => {
    const rows = [
      { service: 'Vertex AI Search', sku: 'Vertex AI Search Query API', cost: 1696.14, currency: 'BRL' },
      { service: 'Cloud Run', sku: 'Cloud Run - CPU Allocation Time', cost: 42.5, currency: 'BRL' },
      { service: 'Artifact Registry', sku: 'Artifact Registry Storage', cost: 3.2, currency: 'BRL' },
      { service: 'Dataflow', sku: 'vCPU time', cost: 7.1, currency: 'BRL' }, // dados/analytics — não está em nenhuma lista de propósito (ver ADR 0009)
    ];

    const result = categorizeCosts(rows);

    expect(result.licenses).toBe(1696.14);
    expect(result.vertexApi).toBe(0);
    expect(result.infra).toBe(45.7);
    expect(result.uncategorized).toBe(7.1);
    expect(result.total).toBeCloseTo(1748.94, 2);
    expect(result.total).toBeCloseTo(result.licenses + result.vertexApi + result.infra + result.uncategorized, 2);
  });

  test('categoriza Cloud Storage e Secret Manager como Infra (infra genérica de nuvem, não só o que a app usa — ADR 0009)', () => {
    const rows = [
      { service: 'Cloud Storage', sku: 'Standard Storage', cost: 7.1, currency: 'BRL' },
      { service: 'Secret Manager', sku: 'Active Secret Versions', cost: 1.5, currency: 'BRL' },
    ];

    const result = categorizeCosts(rows);

    expect(result.infra).toBe(8.6);
    expect(result.uncategorized).toBe(0);
  });

  test('usa a moeda da primeira linha', () => {
    const result = categorizeCosts([{ service: 'Cloud Run', sku: 'Cloud Run - CPU Allocation Time', cost: 10, currency: 'USD' }]);
    expect(result.currency).toBe('USD');
  });

  test('retorna zeros, moeda padrão BRL e items vazios para lista vazia', () => {
    const result = categorizeCosts([]);
    expect(result).toEqual({
      licenses: 0,
      vertexApi: 0,
      infra: 0,
      uncategorized: 0,
      total: 0,
      currency: 'BRL',
      items: {
        licenses: [], vertexApi: [], infra: [], uncategorized: [],
      },
    });
  });

  test('arredonda para 2 casas decimais mesmo com soma de ponto flutuante imprecisa', () => {
    const rows = [
      { service: 'Vertex AI Search', sku: 'Vertex AI Search Query API', cost: 0.1, currency: 'BRL' },
      { service: 'Vertex AI Search', sku: 'Vertex AI Search Query API', cost: 0.2, currency: 'BRL' },
    ];
    expect(categorizeCosts(rows).licenses).toBe(0.3);
  });

  test('categoriza "Vertex AI" (sem "Search") como Custo de API, separado de Licenças', () => {
    const result = categorizeCosts([{ service: 'Vertex AI', sku: 'Vertex AI Online Prediction', cost: 40.73, currency: 'BRL' }]);
    expect(result.vertexApi).toBe(40.73);
    expect(result.licenses).toBe(0);
    expect(result.uncategorized).toBe(0);
  });

  test('agrupa items por Serviço e, dentro de cada um, por SKU, em items.licenses e items.vertexApi separados', () => {
    const rows = [
      { service: 'Vertex AI Search', sku: 'Query API', cost: 100, currency: 'BRL' },
      { service: 'Vertex AI Search', sku: 'Storage', cost: 50, currency: 'BRL' },
      { service: 'Vertex AI', sku: 'Online Prediction', cost: 30, currency: 'BRL' },
    ];

    const { items } = categorizeCosts(rows);

    expect(items.licenses).toEqual([
      {
        service: 'Vertex AI Search',
        cost: 150,
        skus: [
          { sku: 'Query API', cost: 100 },
          { sku: 'Storage', cost: 50 },
        ],
      },
    ]);
    expect(items.vertexApi).toEqual([
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
