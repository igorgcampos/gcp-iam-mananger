const { bigquery } = require('./gcpClients');

// Último uso Antigravity — ver docs/adr/0015-uso-do-antigravity-via-sink-no-bigquery.md.
// O sink `ai-dev-tools-bq` (projeto agentspace-469418) grava os logs de
// metadados do Antigravity (IDE e extensão do VS Code — indistinguíveis nos
// logs) num dataset do projeto de BI. Cada log vira uma tabela
// `businessaicode_googleapis_com_<log>`; o wildcard pega todas.

const DEFAULT_DATASET = 'infra-bi-355620.ai_dev_tools_logs';
// O sink não faz backfill: não há dado de uso antes desta data. Quem não
// aparece na consulta é "Sem uso desde" esta data, nunca "Nunca usou".
const TRACKING_SINCE = '2026-11-24';
const ANTIGRAVITY_CACHE_TTL_MS = 60 * 60 * 1000; // 1h

let cache = { data: null, fetchedAt: 0 };

function _resetCache() {
  cache = { data: null, fetchedAt: 0 };
}

function buildUsageQuery(dataset) {
  return `
    SELECT
      REGEXP_REPLACE(LOWER(labels.user_id), r'^user:', '') AS email,
      MAX(timestamp) AS ultimo_uso,
      COUNT(DISTINCT DATE(timestamp, 'America/Sao_Paulo')) AS dias_com_uso
    FROM \`${dataset}.businessaicode_googleapis_com_*\`
    WHERE labels.user_id IS NOT NULL
      AND timestamp >= TIMESTAMP('${TRACKING_SINCE}')
    GROUP BY email
  `;
}

// jobs.query devolve TIMESTAMP como segundos desde a epoch em string —
// às vezes em notação científica ("1.795549196544E9") — e INT64 como string.
function parseUsageRows(data) {
  const usage = {};
  (data.rows ?? []).forEach((row) => {
    const [email, ultimoUso, dias] = row.f.map((cell) => cell.v);
    usage[email] = {
      lastUse: new Date(Math.round(Number(ultimoUso) * 1000)).toISOString(),
      activeDays: Number(dias),
    };
  });
  return usage;
}

async function getAntigravityUsage() {
  if (cache.data && (Date.now() - cache.fetchedAt) < ANTIGRAVITY_CACHE_TTL_MS) {
    return cache.data;
  }

  const dataset = process.env.ANTIGRAVITY_LOGS_DATASET || DEFAULT_DATASET;
  const { data } = await bigquery.jobs.query({
    projectId: process.env.GCP_PROJECT_ID,
    requestBody: { query: buildUsageQuery(dataset), useLegacySql: false, location: 'US' },
  });

  // Sem isto, um job que passou do prazo do jobs.query (vem sem rows) ou um
  // resultado paginado viraria "ninguém usou" — e ficaria 1h no cache,
  // alimentando falsos inativos no relatório que remove licenças.
  if (data.jobComplete === false) {
    throw new Error('A consulta de uso do Antigravity não terminou a tempo no BigQuery');
  }
  if (data.pageToken) {
    throw new Error('Resultado incompleto da consulta de uso do Antigravity (paginado)');
  }

  const result = { since: TRACKING_SINCE, usage: parseUsageRows(data) };
  cache = { data: result, fetchedAt: Date.now() };
  return result;
}

module.exports = {
  getAntigravityUsage,
  buildUsageQuery,
  parseUsageRows,
  _resetCache,
  ANTIGRAVITY_CACHE_TTL_MS,
  TRACKING_SINCE,
  DEFAULT_DATASET,
};
