const {
  categorizeCosts, groupCostByProject, computeCostAlerts, getAlertReferenceDate, LICENSE_SERVICES, API_SERVICES,
} = require('./billingService');

const OLD_ENV = process.env;
const VERTEX_SERVICES = [...LICENSE_SERVICES, ...API_SERVICES];

jest.mock('./gcpClients', () => ({
  bigquery: { jobs: { query: jest.fn() } },
}));

// `date` é opcional nos dois helpers (default null) — só os testes de Alerta
// de Custo precisam preenchê-lo; os demais continuam funcionando como antes,
// já que uma row sem `date` é simplesmente ignorada por computeCostAlerts.
function mockQueryResult(rows) {
  return {
    data: {
      schema: { fields: [{ name: 'service' }, { name: 'sku' }, { name: 'date' }, { name: 'cost' }, { name: 'currency' }] },
      rows: rows.map(({
        service, sku, date, cost, currency,
      }) => ({
        f: [{ v: service }, { v: sku }, { v: date ?? null }, { v: String(cost) }, { v: currency }],
      })),
    },
  };
}

function mockProjectQueryResult(rows) {
  return {
    data: {
      schema: { fields: [{ name: 'projectId' }, { name: 'service' }, { name: 'sku' }, { name: 'date' }, { name: 'cost' }, { name: 'currency' }] },
      rows: rows.map(({
        projectId, service, sku, date, cost, currency,
      }) => ({
        f: [{ v: projectId }, { v: service }, { v: sku }, { v: date ?? null }, { v: String(cost) }, { v: currency }],
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

  test('monta summary.alerts a partir das duas queries, sem contar Licenças/API de agentspace-469418 duas vezes (ADR 0012)', async () => {
    jest.setSystemTime(new Date('2026-08-19T12:00:00Z')); // Dia de Referência do Alerta = 2026-08-18
    queryMock.mockImplementation((args) => {
      if (hasProjectIdParam(args)) {
        // queryCostByService: escopada a agentspace-469418, inclui Licenças
        // (Vertex AI Search) — não deve ser somada de novo em alertRows.
        return Promise.resolve(mockQueryResult([
          {
            service: 'Vertex AI Search', sku: 'Gemini Enterprise: Data Index', date: '2026-08-18', cost: 1886.70, currency: 'BRL',
          },
          {
            service: 'Cloud Run', sku: 'CPU Allocation Time', date: '2026-08-11', cost: 50, currency: 'BRL',
          },
          {
            service: 'Cloud Run', sku: 'CPU Allocation Time', date: '2026-08-12', cost: 50, currency: 'BRL',
          },
          {
            service: 'Cloud Run', sku: 'CPU Allocation Time', date: '2026-08-13', cost: 50, currency: 'BRL',
          },
          {
            service: 'Cloud Run', sku: 'CPU Allocation Time', date: '2026-08-18', cost: 900, currency: 'BRL',
          },
        ]));
      }
      return Promise.resolve(mockProjectQueryResult([
        {
          projectId: 'agentspace-469418', service: 'Vertex AI Search', sku: 'Gemini Enterprise: Data Index', date: '2026-08-18', cost: 1886.70, currency: 'BRL',
        },
      ]));
    });

    const summary = await getBillingSummary();

    expect(summary.alerts).toHaveLength(2);
    const [top] = summary.alerts;
    expect(top).toMatchObject({
      tipo: 'novo_sku', projectId: 'agentspace-469418', category: 'licenses', sku: 'Gemini Enterprise: Data Index', cost: 1886.70,
    });
    const cloudRunAlert = summary.alerts.find((a) => a.sku === 'CPU Allocation Time');
    expect(cloudRunAlert).toMatchObject({
      tipo: 'aumento_sku', projectId: 'agentspace-469418', category: 'infra', cost: 900, baseline: 50,
    });
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

describe('getAlertReferenceDate', () => {
  test('devolve o dia anterior ao "now" passado, sempre em UTC (Dia de Referência do Alerta — ver CONTEXT.md)', () => {
    expect(getAlertReferenceDate(new Date('2026-08-19T12:00:00Z'))).toBe('2026-08-18');
  });

  test('vira o mês corretamente', () => {
    expect(getAlertReferenceDate(new Date('2026-09-01T00:00:01Z'))).toBe('2026-08-31');
  });

  test('nunca é o dia corrente, mesmo perto da virada (23:59 UTC)', () => {
    expect(getAlertReferenceDate(new Date('2026-08-19T23:59:00Z'))).toBe('2026-08-18');
  });
});

describe('computeCostAlerts', () => {
  const REF = '2026-08-18'; // Dia de Referência do Alerta

  function row(overrides) {
    return {
      projectId: 'agentspace-469418', service: 'Vertex AI', sku: 'Online Prediction', date: REF, cost: 0, currency: 'BRL', ...overrides,
    };
  }

  // 7 dias de baseline "normais" antes de REF (2026-08-11 a 2026-08-17)
  function baselineRows(cost, overrides = {}) {
    const dates = ['2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16', '2026-08-17'];
    return dates.map((date) => row({ date, cost, ...overrides }));
  }

  test('dispara "aumento_sku" quando o custo do Dia de Referência passa R$300 E 50% da média dos 7 dias anteriores', () => {
    const rows = [...baselineRows(100), row({ cost: 500 })]; // +R$400 (>300) e +400% (>50%)

    const alerts = computeCostAlerts(rows, REF);

    expect(alerts).toEqual([{
      tipo: 'aumento_sku',
      category: 'vertexApi',
      projectId: 'agentspace-469418',
      service: 'Vertex AI',
      sku: 'Online Prediction',
      date: REF,
      cost: 500,
      baseline: 100,
      deltaAbsolute: 400,
      deltaPercent: 400,
      currency: 'BRL',
    }]);
  });

  test('não dispara quando só o limiar percentual passa, mas o absoluto não (R$2 → R$8, 300%)', () => {
    const rows = [...baselineRows(2), row({ cost: 8 })];
    expect(computeCostAlerts(rows, REF)).toEqual([]);
  });

  test('não dispara quando só o limiar absoluto passa, mas o percentual não (R$5.000 → R$5.400, +8%)', () => {
    const rows = [...baselineRows(5000), row({ cost: 5400 })];
    expect(computeCostAlerts(rows, REF)).toEqual([]);
  });

  test('dispara "novo_sku" quando não há nenhum custo nos 7 dias anteriores', () => {
    const rows = [row({ cost: 50 })]; // só o Dia de Referência, sem baseline nenhuma

    const alerts = computeCostAlerts(rows, REF);

    expect(alerts).toEqual([{
      tipo: 'novo_sku',
      category: 'vertexApi',
      projectId: 'agentspace-469418',
      service: 'Vertex AI',
      sku: 'Online Prediction',
      date: REF,
      cost: 50,
      currency: 'BRL',
    }]);
  });

  test('não avalia (nem aumento, nem novo) quando há histórico mas abaixo do mínimo de 3 dias', () => {
    const rows = [
      row({ date: '2026-08-17', cost: 10 }),
      row({ date: '2026-08-16', cost: 10 }),
      row({ cost: 500 }), // só 2 dias de baseline — abaixo de ALERT_MIN_BASELINE_DAYS
    ];
    expect(computeCostAlerts(rows, REF)).toEqual([]);
  });

  test('ignora a SKU quando não há custo nenhum no Dia de Referência', () => {
    const rows = baselineRows(100); // sem nenhuma row em REF
    expect(computeCostAlerts(rows, REF)).toEqual([]);
  });

  test('ignora rows fora da janela de 8 dias (ex: mês inteiro trazido pela query alargada)', () => {
    const rows = [...baselineRows(100), row({ cost: 500 }), row({ date: '2026-08-01', cost: 999999 })];
    const alerts = computeCostAlerts(rows, REF);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].baseline).toBe(100); // a row de 08-01 não entrou na média
  });

  test('trata projetos diferentes como grupos separados, mesmo Serviço/SKU (Licenças/API cross-project — ADR 0012)', () => {
    const rows = [
      ...baselineRows(100, { projectId: 'projeto-a' }),
      row({ projectId: 'projeto-a', cost: 500 }),
      ...baselineRows(20, { projectId: 'projeto-b' }),
      row({ projectId: 'projeto-b', cost: 25 }), // não dispara (abaixo dos limiares)
    ];

    const alerts = computeCostAlerts(rows, REF);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].projectId).toBe('projeto-a');
  });

  test('ordena por custo decrescente', () => {
    const rows = [
      ...baselineRows(100, { sku: 'A' }), row({ sku: 'A', cost: 1000 }),
      ...baselineRows(100, { sku: 'B' }), row({ sku: 'B', cost: 2000 }),
    ];
    const alerts = computeCostAlerts(rows, REF);
    expect(alerts.map((a) => a.sku)).toEqual(['B', 'A']);
  });

  test('lista vazia não gera alertas', () => {
    expect(computeCostAlerts([], REF)).toEqual([]);
  });
});
