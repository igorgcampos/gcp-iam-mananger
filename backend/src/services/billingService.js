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
//
// API_SERVICES tem dois Serviços GCP distintos — "Vertex AI" (a API
// enterprise, usada pelo Agentspace) e "Gemini API" (a API "direta" do
// Gemini, tipo AI Studio, tipicamente usada em projetos de POC) — porque a
// ADR 0013 decidiu que os dois representam o mesmo conceito de domínio
// (consumo de modelo/LLM), mesmo sendo produtos GCP diferentes. O nome
// VERTEX_SERVICES continua usado nas queries/campos por conveniência
// (ver ADR 0013), mesmo incluindo um Serviço que não é Vertex.
const LICENSE_SERVICES = ['Vertex AI Search'];
const API_SERVICES = ['Vertex AI', 'Gemini API'];
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

// Limiares do Alerta de Custo (ver CONTEXT.md e ADR 0012) — constantes por
// enquanto, não configuráveis por usuário, no mesmo espírito de
// LICENSE_SERVICES/API_SERVICES/INFRA_SERVICES acima.
const ALERT_BASELINE_WINDOW_DAYS = 7;
const ALERT_MIN_BASELINE_DAYS = 3;
const ALERT_ABSOLUTE_THRESHOLD = 300; // R$
const ALERT_PERCENT_THRESHOLD = 0.5; // 50%

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Extraído de categorizeCosts pra ser reaproveitado por computeCostAlerts —
// mesmo critério de categorização (Custo de Licenças/API/Infra/Outros
// Serviços), num só lugar.
function categoryForService(service) {
  if (LICENSE_SERVICES.includes(service)) return 'licenses';
  if (API_SERVICES.includes(service)) return 'vertexApi';
  if (INFRA_SERVICES.includes(service)) return 'infra';
  return 'uncategorized';
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
    const category = categoryForService(row.service);
    // categoryForService devolve 'vertexApi' (chave do resumo); o bucket de
    // categorização interno usa o mesmo nome.
    buckets[category].push(row);
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
      date: obj.date ?? null,
      cost: parseFloat(obj.cost) || 0,
      currency: obj.currency,
    };
  });
}

// Limite inferior do WHERE das duas queries: cobre tanto o mês corrente
// (pros totais que os cards já mostram) quanto os últimos
// ALERT_BASELINE_WINDOW_DAYS + 1 dias completos (pro Alerta de Custo) — o
// menor dos dois, calculado uma vez e reaproveitado pelas duas queries (ver
// ADR 0012, "Opção B": enriquecer as queries existentes em vez de criar
// novas). O limite superior continua sem restrição, como já era.
const ALERT_WINDOW_LOWER_BOUND_SQL = `LEAST(
      TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MONTH),
      TIMESTAMP_SUB(TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), DAY), INTERVAL ${ALERT_BASELINE_WINDOW_DAYS + 1} DAY)
    )`;

async function queryCostByService() {
  const projectId = process.env.GCP_PROJECT_ID;
  const table = process.env.BILLING_EXPORT_TABLE;

  const query = `
    SELECT
      service.description AS service,
      IFNULL(sku.description, 'Outros') AS sku,
      DATE(usage_start_time) AS date,
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
      AND usage_start_time >= ${ALERT_WINDOW_LOWER_BOUND_SQL}
    GROUP BY service, sku, date
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
      DATE(usage_start_time) AS date,
      SUM(cost) + IFNULL(SUM((SELECT SUM(c.amount) FROM UNNEST(credits) AS c)), 0) AS cost,
      ANY_VALUE(currency) AS currency
    FROM \`${table}\`
    WHERE service.description IN UNNEST(@geminiServices)
      AND usage_start_time >= ${ALERT_WINDOW_LOWER_BOUND_SQL}
    GROUP BY projectId, service, sku, date
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

// "Hoje" pra fins de Alerta de Custo é sempre ontem (nunca o dia corrente em
// andamento) — o Billing Export só atualiza 1x/dia, então o dia corrente
// estaria com dados incompletos (ver CONTEXT.md, "Dia de Referência do
// Alerta"). Calculado em UTC, mesmo fuso que as duas queries já usam
// (CURRENT_TIMESTAMP() sem TIMEZONE explícito).
function getAlertReferenceDate(now = new Date()) {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10); // 'YYYY-MM-DD', mesmo formato de DATE() no BigQuery
}

function daysBefore(dateStr, referenceDate) {
  const oneDayMs = 24 * 60 * 60 * 1000;
  return Math.round((Date.parse(`${referenceDate}T00:00:00Z`) - Date.parse(`${dateStr}T00:00:00Z`)) / oneDayMs);
}

// Alerta de Custo (ver CONTEXT.md e ADR 0012): agrupa rows (já com `date` e
// `projectId` resolvido — sem `null`, ver getBillingSummary) por
// projeto+serviço+SKU, separa o Dia de Referência do custo dos até
// ALERT_BASELINE_WINDOW_DAYS dias anteriores, e decide entre Alerta de
// Aumento do SKU e Novo SKU no Billing. `rows` pode conter dias fora da
// janela de 8 dias (o WHERE das queries também cobre o mês corrente) — são
// ignorados aqui, não só "não é o dia de referência".
function computeCostAlerts(rows, referenceDate) {
  const groups = new Map();

  rows.forEach((row) => {
    if (!row.date) return;
    const daysAgo = daysBefore(row.date, referenceDate);
    if (daysAgo < 0 || daysAgo > ALERT_BASELINE_WINDOW_DAYS) return;

    const key = [row.projectId, row.service, row.sku].join(' ');
    if (!groups.has(key)) {
      groups.set(key, {
        projectId: row.projectId,
        service: row.service,
        sku: row.sku,
        currency: row.currency,
        current: 0,
        hasCurrent: false,
        baselineSum: 0,
        baselineDays: 0,
      });
    }
    const g = groups.get(key);
    if (daysAgo === 0) {
      g.current += row.cost;
      g.hasCurrent = true;
    } else {
      g.baselineSum += row.cost;
      g.baselineDays += 1;
    }
  });

  const alerts = [];
  groups.forEach((g) => {
    if (!g.hasCurrent || g.current <= 0) return; // nada aconteceu no Dia de Referência

    if (g.baselineDays === 0) {
      alerts.push({
        tipo: 'novo_sku',
        category: categoryForService(g.service),
        projectId: g.projectId,
        service: g.service,
        sku: g.sku,
        date: referenceDate,
        cost: round2(g.current),
        currency: g.currency,
      });
      return;
    }

    if (g.baselineDays < ALERT_MIN_BASELINE_DAYS) return; // histórico curto demais pra avaliar

    const baseline = g.baselineSum / g.baselineDays;
    const deltaAbsolute = g.current - baseline;
    const deltaPercent = baseline !== 0 ? deltaAbsolute / baseline : Infinity;

    if (deltaAbsolute > ALERT_ABSOLUTE_THRESHOLD && deltaPercent > ALERT_PERCENT_THRESHOLD) {
      alerts.push({
        tipo: 'aumento_sku',
        category: categoryForService(g.service),
        projectId: g.projectId,
        service: g.service,
        sku: g.sku,
        date: referenceDate,
        cost: round2(g.current),
        baseline: round2(baseline),
        deltaAbsolute: round2(deltaAbsolute),
        deltaPercent: round2(deltaPercent * 100),
        currency: g.currency,
      });
    }
  });

  return alerts.sort((a, b) => b.cost - a.cost);
}

async function getBillingSummary() {
  const isFresh = cache.data && (Date.now() - cache.fetchedAt) < CACHE_TTL_MS;
  if (isFresh) return cache.data;

  if (cache.inflight) return cache.inflight;

  const inflight = Promise.all([queryCostByService(), queryVertexCostByProject()])
    .then(([rows, vertexProjectRows]) => {
      const homeProjectId = process.env.GCP_PROJECT_ID;
      const referenceDate = getAlertReferenceDate();

      // Alerta de Custo cobre Licenças/API cross-project (ADR 0012) — usa
      // vertexProjectRows (que já cobre todos os projetos) pra essas duas
      // categorias, e `rows` só pro que não é Vertex, pra não somar a mesma
      // linha (agentspace-469418) duas vezes.
      const nonVertexRows = rows.filter((r) => !VERTEX_SERVICES.includes(r.service));
      const alertRows = [...nonVertexRows, ...vertexProjectRows]
        .map((r) => ({ ...r, projectId: r.projectId || homeProjectId }));

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
        alerts: computeCostAlerts(alertRows, referenceDate),
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
  computeCostAlerts,
  getAlertReferenceDate,
  getBillingSummary,
  LICENSE_SERVICES,
  API_SERVICES,
  INFRA_SERVICES,
};
