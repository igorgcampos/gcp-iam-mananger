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

function categorizeCosts(rows) {
  let gemini = 0;
  let infra = 0;
  let uncategorized = 0;
  let currency = null;

  rows.forEach((row) => {
    currency = currency || row.currency;
    if (GEMINI_SERVICES.includes(row.service)) {
      gemini += row.cost;
    } else if (INFRA_SERVICES.includes(row.service)) {
      infra += row.cost;
    } else {
      uncategorized += row.cost;
    }
  });

  return {
    gemini: round2(gemini),
    infra: round2(infra),
    uncategorized: round2(uncategorized),
    total: round2(gemini + infra + uncategorized),
    currency: currency || 'BRL',
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
    return { service: obj.service, cost: parseFloat(obj.cost) || 0, currency: obj.currency };
  });
}

async function queryCostByService() {
  const projectId = process.env.GCP_PROJECT_ID;
  const table = process.env.BILLING_EXPORT_TABLE;

  const query = `
    SELECT
      service.description AS service,
      SUM(cost) + IFNULL(SUM((SELECT SUM(c.amount) FROM UNNEST(credits) AS c)), 0) AS cost,
      ANY_VALUE(currency) AS currency
    FROM \`${table}\`
    WHERE project.id = @projectId
      AND usage_start_time >= TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MONTH)
    GROUP BY service
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
