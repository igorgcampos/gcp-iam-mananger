const OLD_ENV = process.env;

jest.mock('./gcpClients', () => ({
  bigquery: { jobs: { query: jest.fn() } },
}));

// Formato real do jobs.query: TIMESTAMP vem como segundos (às vezes em
// notação científica) e INT64 como string.
function mockUsageResult(rows) {
  return {
    data: {
      schema: { fields: [{ name: 'email' }, { name: 'ultimo_uso' }, { name: 'dias_com_uso' }] },
      rows: rows.map(({ email, ts, dias }) => ({ f: [{ v: email }, { v: ts }, { v: dias }] })),
    },
  };
}

describe('antigravityService', () => {
  let service;
  let queryMock;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, GCP_PROJECT_ID: 'agentspace-469418' };
    delete process.env.ANTIGRAVITY_LOGS_DATASET;
    // eslint-disable-next-line global-require
    ({ bigquery: { jobs: { query: queryMock } } } = require('./gcpClients'));
    // eslint-disable-next-line global-require
    service = require('./antigravityService');
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  describe('buildUsageQuery', () => {
    test('lê as tabelas businessaicode do dataset padrão no infra-bi', () => {
      const sql = service.buildUsageQuery(service.DEFAULT_DATASET);
      expect(service.DEFAULT_DATASET).toBe('infra-bi-355620.ai_dev_tools_logs');
      expect(sql).toContain('`infra-bi-355620.ai_dev_tools_logs.businessaicode_googleapis_com_*`');
    });

    test('normaliza o e-mail (minúsculas, sem prefixo user:) e agrega último uso e dias com uso', () => {
      const sql = service.buildUsageQuery(service.DEFAULT_DATASET);
      expect(sql).toContain("REGEXP_REPLACE(LOWER(labels.user_id), r'^user:', '')");
      expect(sql).toContain('MAX(timestamp)');
      expect(sql).toContain("COUNT(DISTINCT DATE(timestamp, 'America/Sao_Paulo'))");
      expect(sql).toContain("timestamp >= TIMESTAMP('2026-11-24')");
    });
  });

  describe('parseUsageRows', () => {
    test('converte timestamp em notação científica e dias em número', () => {
      const { data } = mockUsageResult([{ email: 'fulano@edglobo.com.br', ts: '1.795549196544E9', dias: '3' }]);
      expect(service.parseUsageRows(data)).toEqual({
        'fulano@edglobo.com.br': { lastUse: '2026-11-24T19:39:56.544Z', activeDays: 3 },
      });
    });

    test('aceita timestamp em decimal simples', () => {
      const { data } = mockUsageResult([{ email: 'a@x.com', ts: '1795549196.544', dias: '1' }]);
      expect(service.parseUsageRows(data)['a@x.com'].lastUse).toBe('2026-11-24T19:39:56.544Z');
    });

    test('sem rows devolve objeto vazio', () => {
      expect(service.parseUsageRows({ schema: { fields: [] } })).toEqual({});
    });
  });

  describe('getAntigravityUsage', () => {
    test('roda o job no GCP_PROJECT_ID, em US, e devolve since + usage', async () => {
      queryMock.mockResolvedValue(mockUsageResult([{ email: 'a@x.com', ts: '1.795549196544E9', dias: '2' }]));

      const result = await service.getAntigravityUsage();

      expect(result).toEqual({
        since: '2026-11-24',
        usage: { 'a@x.com': { lastUse: '2026-11-24T19:39:56.544Z', activeDays: 2 } },
      });
      const args = queryMock.mock.calls[0][0];
      expect(args.projectId).toBe('agentspace-469418');
      expect(args.requestBody).toMatchObject({ useLegacySql: false, location: 'US' });
    });

    test('ANTIGRAVITY_LOGS_DATASET troca o dataset consultado', async () => {
      process.env.ANTIGRAVITY_LOGS_DATASET = 'outro-proj.outro_ds';
      queryMock.mockResolvedValue(mockUsageResult([]));

      await service.getAntigravityUsage();

      expect(queryMock.mock.calls[0][0].requestBody.query).toContain('`outro-proj.outro_ds.businessaicode_googleapis_com_*`');
    });

    test('usa o cache por 1h e consulta de novo depois', async () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
      queryMock.mockResolvedValue(mockUsageResult([]));

      await service.getAntigravityUsage();
      nowSpy.mockReturnValue(1_000_000 + service.ANTIGRAVITY_CACHE_TTL_MS - 1);
      await service.getAntigravityUsage();
      expect(queryMock).toHaveBeenCalledTimes(1);

      nowSpy.mockReturnValue(1_000_000 + service.ANTIGRAVITY_CACHE_TTL_MS);
      await service.getAntigravityUsage();
      expect(queryMock).toHaveBeenCalledTimes(2);
      expect(service.ANTIGRAVITY_CACHE_TTL_MS).toBe(60 * 60 * 1000);
      nowSpy.mockRestore();
    });

    test('job que não terminou no prazo é erro, não "ninguém usou", e não é cacheado', async () => {
      queryMock.mockResolvedValueOnce({ data: { jobComplete: false } });
      await expect(service.getAntigravityUsage()).rejects.toThrow(/não terminou/);

      queryMock.mockResolvedValueOnce(mockUsageResult([]));
      await expect(service.getAntigravityUsage()).resolves.toEqual({ since: '2026-11-24', usage: {} });
      expect(queryMock).toHaveBeenCalledTimes(2);
    });

    test('resposta paginada (resultado incompleto) é erro', async () => {
      queryMock.mockResolvedValueOnce({ data: { ...mockUsageResult([]).data, pageToken: 'abc' } });
      await expect(service.getAntigravityUsage()).rejects.toThrow(/incompleto/);
    });

    test('erro do BigQuery propaga e não é cacheado', async () => {
      queryMock.mockRejectedValueOnce(new Error('Not found: Dataset'));
      await expect(service.getAntigravityUsage()).rejects.toThrow('Not found: Dataset');

      queryMock.mockResolvedValueOnce(mockUsageResult([]));
      await expect(service.getAntigravityUsage()).resolves.toEqual({ since: '2026-11-24', usage: {} });
      expect(queryMock).toHaveBeenCalledTimes(2);
    });
  });
});
