// Listas de service.description (schema do BigQuery Billing Export) que
// compõem cada categoria — editar aqui quando a aplicação passar a usar (ou
// parar de usar) um serviço GCP. Ver Task 2 (backend/scripts/list-billing-services.js)
// para descobrir os nomes reais em uso. Qualquer serviço fora das duas listas
// cai em "uncategorized" — de propósito, ver CONTEXT.md ("Não Categorizado").
const GEMINI_SERVICES = ['Vertex AI Search'];
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

module.exports = { categorizeCosts, GEMINI_SERVICES, INFRA_SERVICES };
