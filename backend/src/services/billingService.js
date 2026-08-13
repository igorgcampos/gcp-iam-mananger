const { bigquery } = require('./gcpClients');

// Listas de service.description (schema do BigQuery Billing Export) que
// compõem cada categoria — editar aqui quando a aplicação passar a usar (ou
// parar de usar) um serviço GCP. Ver Task 2 (backend/scripts/list-billing-services.js)
// para descobrir os nomes reais em uso. Qualquer serviço fora das listas
// abaixo cai em "uncategorized" (rótulo "Outros Serviços" na UI) — de propósito, ver
// CONTEXT.md ("Outros Serviços") e ADR 0009.
//
// LICENSE_SERVICES e API_SERVICES eram uma lista única (GEMINI_SERVICES) até a
// ADR 0011, que as separou em duas categorias de domínio — Custo de Licenças
// (assinatura) e Custo de API (consumo) — porque a distinção entre elas vai
// ficar cada vez mais relevante. Continuam sendo tratadas juntas sempre que o
// motivo for técnico e não de domínio (ex: a exceção de project.id nulo do
// ADR 0008, ou a query cross-project do ADR 0010).
const LICENSE_SERVICES = ['Vertex AI Search'];
const API_SERVICES = ['Vertex AI'];
const VERTEX_SERVICES = [...LICENSE_SERVICES, ...API_SERVICES];

// INFRA_SERVICES é a infraestrutura "clássica" de nuvem (compute, storage,
// banco, rede, segurança, devops, observabilidade, mensageria) — não se
// restringe ao que esta aplicação usa hoje (ver ADR 0009, que revisa esse
// critério em relação à ADR 0006). Serviços de dados/analytics (Dataflow,
// Dataproc, Looker etc.) ficam de fora de propósito e caem em "Outros
// Serviços" se aparecerem.
const INFRA_SERVICES = [
  // Compute
  'Compute Engine', 'Google Kubernetes Engine', 'App Engine', 'Cloud Run', 'Cloud Functions',
  // Storage
  'Cloud Storage', 'Filestore',
  // Banco de dados
  'Cloud SQL', 'Cloud Spanner', 'Firestore', 'Cloud Bigtable', 'Memorystore',
  // Rede
  'Networking', 'Cloud DNS', 'Cloud CDN', 'Cloud VPN', 'Cloud Interconnect', 'Cloud Load Balancing',
  // Segurança / identidade
  'Secret Manager', 'Cloud KMS', 'Cloud Armor', 'Certificate Manager',
  // DevOps / CI-CD
  'Artifact Registry', 'Cloud Build', 'Container Registry',
  // Observabilidade
  'Cloud Logging', 'Cloud Monitoring', 'Cloud Trace', 'Error Reporting', 'Cloud Profiler',
  // Mensageria / orquestração serverless
  'Pub/Sub', 'Cloud Tasks', 'Cloud Scheduler', 'Eventarc',
  // Dados (exceção deliberada — ver Custo de Infra no CONTEXT.md)
  'BigQuery',
];

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
  const buckets = {
    licenses: [], vertexApi: [], infra: [], uncategorized: [],
  };
  let currency = null;

  rows.forEach((row) => {
    currency = currency || row.currency;
    if (LICENSE_SERVICES.includes(row.service)) {
      buckets.licenses.push(row);
    } else if (API_SERVICES.includes(row.service)) {
      buckets.vertexApi.push(row);
    } else if (INFRA_SERVICES.includes(row.service)) {
      buckets.infra.push(row);
    } else {
      buckets.uncategorized.push(row);
    }
  });

  const items = {
    licenses: groupByServiceAndSku(buckets.licenses),
    vertexApi: groupByServiceAndSku(buckets.vertexApi),
    infra: groupByServiceAndSku(buckets.infra),
    uncategorized: groupByServiceAndSku(buckets.uncategorized),
  };

  const licenses = round2(items.licenses.reduce((sum, s) => sum + s.cost, 0));
  const vertexApi = round2(items.vertexApi.reduce((sum, s) => sum + s.cost, 0));
  const infra = round2(items.infra.reduce((sum, s) => sum + s.cost, 0));
  const uncategorized = round2(items.uncategorized.reduce((sum, s) => sum + s.cost, 0));

  return {
    licenses,
    vertexApi,
    infra,
    uncategorized,
    total: round2(licenses + vertexApi + infra + uncategorized),
    currency: currency || 'BRL',
    items,
  };
}

// Custo (Licenças ou API) por projeto, cross-project (ver ADR 0010): mesmo
// critério de VERTEX_SERVICES, mas sem filtro de project.id — cobre a Billing
// Account inteira, ao contrário de queryCostByService/categorizeCosts, que
// continuam escopados a homeProjectId. Linhas com project.id nulo (assinaturas
// faturadas no nível da Billing Account, ver ADR 0008) somam ao bucket de
// homeProjectId — mesmo critério que a query escopada já usa hoje, não um
// bucket à parte. Função genérica: usada separadamente para Licenças e para
// API (ver ADR 0011), cada chamada já recebendo só as linhas do seu Serviço.
function groupCostByProject(rows, homeProjectId) {
  const rowsByProject = new Map();
  rows.forEach((row) => {
    const key = row.projectId || homeProjectId;
    if (!rowsByProject.has(key)) rowsByProject.set(key, []);
    rowsByProject.get(key).push(row);
  });

  const byProject = {};
  let total = 0;
  rowsByProject.forEach((projectRows, key) => {
    const items = groupByServiceAndSku(projectRows);
    const projectTotal = round2(items.reduce((sum, s) => sum + s.cost, 0));
    byProject[key] = { label: key, total: projectTotal, items };
    total = round2(total + projectTotal);
  });

  return { total, byProject };
}

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4h — export do GCP só atualiza 1x/dia (ver ADR 0006)
let cache = { data: null, fetchedAt: 0, inflight: null };

// projectId vem undefined (→ null) para queries cujo schema não tem essa
// coluna (queryCostByService) — inofensivo, ninguém lê esse campo ali.
function parseRows(data) {
  if (!data.rows) return [];
  const fields = data.schema.fields.map((f) => f.name);
  return data.rows.map((row) => {
    const obj = {};
    row.f.forEach((cell, i) => { obj[fields[i]] = cell.v; });
    return {
      projectId: obj.projectId ?? null,
      service: obj.service,
      sku: obj.sku ?? 'Outros',
      cost: parseFloat(obj.cost) || 0,
      currency: obj.currency,
    };
  });
}

async function queryCostByService() {
  const projectId = process.env.GCP_PROJECT_ID;
  const table = process.env.BILLING_EXPORT_TABLE;

  const query = `
    SELECT
      service.description AS service,
      IFNULL(sku.description, 'Outros') AS sku,
      SUM(cost) + IFNULL(SUM((SELECT SUM(c.amount) FROM UNNEST(credits) AS c)), 0) AS cost,
      ANY_VALUE(currency) AS currency
    FROM \`${table}\`
    WHERE (
        project.id = @projectId
        -- Assinaturas Gemini/Agentspace (ex: "Gemini Enterprise Standard: Subscription
        -- - one year term") às vezes vêm faturadas no nível da Billing Account, com
        -- project.id nulo, em vez de atreladas a um projeto específico — diferente do
        -- consumo normal (ex: "Agentspace Enterprise Plus"), que tem project.id
        -- preenchido. Sem esta cláusula extra, essas assinaturas somem silenciosamente
        -- da categoria Licenças (ver CONTEXT.md, "Custo de Licenças").
        OR (project.id IS NULL AND service.description IN UNNEST(@geminiServices))
      )
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
        {
          name: 'geminiServices',
          parameterType: { type: 'ARRAY', arrayType: { type: 'STRING' } },
          parameterValue: { arrayValues: VERTEX_SERVICES.map((v) => ({ value: v })) },
        },
      ],
    },
  });

  return parseRows(res.data);
}

// Uma única query cross-project pras duas SKUs Vertex (Licenças + API) — ver
// ADR 0011: os dois cards têm seletor de projeto independente, mas os dados
// vêm da mesma query, divididos em memória por Serviço em getBillingSummary.
async function queryVertexCostByProject() {
  const projectId = process.env.GCP_PROJECT_ID;
  const table = process.env.BILLING_EXPORT_TABLE;

  const query = `
    SELECT
      project.id AS projectId,
      service.description AS service,
      IFNULL(sku.description, 'Outros') AS sku,
      SUM(cost) + IFNULL(SUM((SELECT SUM(c.amount) FROM UNNEST(credits) AS c)), 0) AS cost,
      ANY_VALUE(currency) AS currency
    FROM \`${table}\`
    WHERE service.description IN UNNEST(@geminiServices)
      AND usage_start_time >= TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MONTH)
    GROUP BY projectId, service, sku
  `;

  const res = await bigquery.jobs.query({
    projectId,
    requestBody: {
      query,
      useLegacySql: false,
      parameterMode: 'NAMED',
      queryParameters: [
        {
          name: 'geminiServices',
          parameterType: { type: 'ARRAY', arrayType: { type: 'STRING' } },
          parameterValue: { arrayValues: VERTEX_SERVICES.map((v) => ({ value: v })) },
        },
      ],
    },
  });

  return parseRows(res.data);
}

async function getBillingSummary() {
  const isFresh = cache.data && (Date.now() - cache.fetchedAt) < CACHE_TTL_MS;
  if (isFresh) return cache.data;

  if (cache.inflight) return cache.inflight;

  const inflight = Promise.all([queryCostByService(), queryVertexCostByProject()])
    .then(([rows, vertexProjectRows]) => {
      const homeProjectId = process.env.GCP_PROJECT_ID;
      const summary = {
        ...categorizeCosts(rows),
        licensesByProject: groupCostByProject(
          vertexProjectRows.filter((r) => LICENSE_SERVICES.includes(r.service)),
          homeProjectId,
        ),
        apiByProject: groupCostByProject(
          vertexProjectRows.filter((r) => API_SERVICES.includes(r.service)),
          homeProjectId,
        ),
        updatedAt: new Date().toISOString(),
      };
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
  categorizeCosts,
  groupCostByProject,
  getBillingSummary,
  LICENSE_SERVICES,
  API_SERVICES,
  INFRA_SERVICES,
};
