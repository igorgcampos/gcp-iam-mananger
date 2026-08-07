const { bigquery } = require('./gcpClients');

// Listas de service.description (schema do BigQuery Billing Export) que
// compõem cada categoria — editar aqui quando a aplicação passar a usar (ou
// parar de usar) um serviço GCP. Ver Task 2 (backend/scripts/list-billing-services.js)
// para descobrir os nomes reais em uso. Qualquer serviço fora das duas listas
// cai em "uncategorized" — de propósito, ver CONTEXT.md ("Não Categorizado").
const GEMINI_SERVICES = ['Vertex AI Search', 'Vertex AI'];
const INFRA_SERVICES = ['Cloud Run', 'Artifact Registry', 'Cloud Logging', 'BigQuery'];

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function groupByServiceAndSku(rows) {
  const byService = new Map();
  rows.forEach(({ service, sku, cost }) => {
    if (!byService.has(service)) byService.set(service, new Map());
    const skuMap = byService.get(service);
    skuMap.set(sku, (skuMap.get(sku) || 0) + cost);
  });

  return Array.from(byService.entries())
    .map(([service, skuMap]) => {
      const skus = Array.from(skuMap.entries())
        .map(([sku, cost]) => ({ sku, cost: round2(cost) }))
        .sort((a, b) => b.cost - a.cost);
      const cost = round2(skus.reduce((sum, s) => sum + s.cost, 0));
      return { service, cost, skus };
    })
    .sort((a, b) => b.cost - a.cost);
}

function categorizeCosts(rows) {
  const buckets = { gemini: [], infra: [], uncategorized: [] };
  let currency = null;

  rows.forEach((row) => {
    currency = currency || row.currency;
    if (GEMINI_SERVICES.includes(row.service)) {
      buckets.gemini.push(row);
    } else if (INFRA_SERVICES.includes(row.service)) {
      buckets.infra.push(row);
    } else {
      buckets.uncategorized.push(row);
    }
  });

  const items = {
    gemini: groupByServiceAndSku(buckets.gemini),
    infra: groupByServiceAndSku(buckets.infra),
    uncategorized: groupByServiceAndSku(buckets.uncategorized),
  };

  const gemini = round2(items.gemini.reduce((sum, s) => sum + s.cost, 0));
  const infra = round2(items.infra.reduce((sum, s) => sum + s.cost, 0));
  const uncategorized = round2(items.uncategorized.reduce((sum, s) => sum + s.cost, 0));

  return {
    gemini,
    infra,
    uncategorized,
    total: round2(gemini + infra + uncategorized),
    currency: currency || 'BRL',
    items,
  };
}

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4h — export do GCP só atualiza 1x/dia (ver ADR 0006)
let cache = { data: null, fetchedAt: 0, inflight: null };

function parseRows(data) {
  if (!data.rows) return [];
  const fields = data.schema.fields.map((f) => f.name);
  return data.rows.map((row) => {
    const obj = {};
    row.f.forEach((cell, i) => { obj[fields[i]] = cell.v; });
    return {
      service: obj.service, sku: obj.sku, cost: parseFloat(obj.cost) || 0, currency: obj.currency,
    };
  });
}

async function queryCostByService() {
  const projectId = process.env.GCP_PROJECT_ID;
  const table = process.env.BILLING_EXPORT_TABLE;

  const query = `
    SELECT
      service.description AS service,
      sku.description AS sku,
      SUM(cost) + IFNULL(SUM((SELECT SUM(c.amount) FROM UNNEST(credits) AS c)), 0) AS cost,
      ANY_VALUE(currency) AS currency
    FROM \`${table}\`
    WHERE project.id = @projectId
      AND usage_start_time >= TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MONTH)
    GROUP BY service, sku
  `;

  const res = await bigquery.jobs.query({
    projectId,
    requestBody: {
      query,
      useLegacySql: false,
      parameterMode: 'NAMED',
      queryParameters: [
        { name: 'projectId', parameterType: { type: 'STRING' }, parameterValue: { value: projectId } },
      ],
    },
  });

  return parseRows(res.data);
}

async function getBillingSummary() {
  const isFresh = cache.data && (Date.now() - cache.fetchedAt) < CACHE_TTL_MS;
  if (isFresh) return cache.data;

  if (cache.inflight) return cache.inflight;

  const inflight = queryCostByService()
    .then((rows) => {
      const summary = { ...categorizeCosts(rows), updatedAt: new Date().toISOString() };
      cache = { data: summary, fetchedAt: Date.now(), inflight: null };
      return summary;
    })
    .catch((err) => {
      cache = { ...cache, inflight: null };
      throw err;
    });

  cache = { ...cache, inflight };
  return inflight;
}

module.exports = {
  categorizeCosts, getBillingSummary, GEMINI_SERVICES, INFRA_SERVICES,
};
