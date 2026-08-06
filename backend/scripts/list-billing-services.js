// backend/scripts/list-billing-services.js
//
// Lista, com custo agregado, todo `service.description` que apareceu no
// projeto GCP_PROJECT_ID no mês corrente, segundo o BigQuery Billing Export.
// Rodar sempre que "Não categorizado" (ver CONTEXT.md) aparecer com um valor
// inesperado, para decidir se o serviço novo entra em GEMINI_SERVICES ou
// INFRA_SERVICES em backend/src/services/billingService.js.

require('dotenv').config();
const { bigquery } = require('../src/services/gcpClients');

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const TABLE = process.env.BILLING_EXPORT_TABLE;

async function main() {
  const query = `
    SELECT service.description AS service, ROUND(SUM(cost), 2) AS cost
    FROM \`${TABLE}\`
    WHERE project.id = @projectId
      AND usage_start_time >= TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MONTH)
    GROUP BY service
    ORDER BY cost DESC
  `;

  const res = await bigquery.jobs.query({
    projectId: PROJECT_ID,
    requestBody: {
      query,
      useLegacySql: false,
      parameterMode: 'NAMED',
      queryParameters: [
        { name: 'projectId', parameterType: { type: 'STRING' }, parameterValue: { value: PROJECT_ID } },
      ],
    },
  });

  const fields = (res.data.schema?.fields || []).map((f) => f.name);
  const rows = (res.data.rows || []).map(
    (row) => Object.fromEntries(row.f.map((cell, i) => [fields[i], cell.v]))
  );

  console.table(rows);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
