const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

let client;
function getClient() {
  if (!client) {
    client = new SecretManagerServiceClient();
  }
  return client;
}

// Resolve um segredo real com uma regra única, sem branch por ambiente:
// se `envVar` já vier setada em process.env, usa direto — esse é o caminho
// de produção, onde o Cloud Run já injetou o valor via `--update-secrets`,
// sem nenhuma chamada ao Secret Manager feita por este código (ver
// docs/adr/0007-adc-e-secret-manager-para-credenciais.md). Se vier ausente
// — dev local, onde não existe Cloud Run injetando nada — busca a versão
// mais recente do secret no Secret Manager via ADC (a mesma usada por
// gcpAuth.js), no ID indicado por `secretIdEnvVar`, e grava o valor de
// volta em process.env[envVar] — o resto do código (msalClient.js,
// sessionToken.js) continua lendo process.env sem saber de onde veio.
async function resolveSecret(envVar, secretIdEnvVar) {
  if (process.env[envVar]) {
    return process.env[envVar];
  }

  const secretId = process.env[secretIdEnvVar];
  if (!secretId) {
    throw new Error(
      `${envVar} não está definido e ${secretIdEnvVar} também não — configure um `
      + `dos dois em backend/.env (ver README, seção "Segredos no Secret Manager").`,
    );
  }

  const projectId = process.env.GCP_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      'GCP_PROJECT_ID não está definido — necessário para montar o resource name do secret.',
    );
  }

  const name = `projects/${projectId}/secrets/${secretId}/versions/latest`;

  let version;
  try {
    [version] = await getClient().accessSecretVersion({ name });
  } catch (err) {
    throw new Error(
      `Falha ao buscar o secret "${secretId}" (${name}) no Secret Manager: ${err.message}. `
      + 'Confirme que o secret existe e que a ADC ativa '
      + '(gcloud auth application-default login --impersonate-service-account=...) '
      + 'tem roles/secretmanager.secretAccessor nele.',
    );
  }

  const value = version.payload.data.toString('utf8');
  process.env[envVar] = value;
  return value;
}

// Resolve os dois segredos reais da aplicação — chamada uma vez, no boot
// (backend/src/index.js), antes de app.listen().
async function resolveAppSecrets() {
  await resolveSecret('AZURE_CLIENT_SECRET', 'AZURE_CLIENT_SECRET_ID');
  await resolveSecret('SESSION_JWT_SECRET', 'SESSION_JWT_SECRET_ID');
}

module.exports = { resolveSecret, resolveAppSecrets };
