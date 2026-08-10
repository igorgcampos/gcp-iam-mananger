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
// gcpAuth.js), no ID indicado por `secretIdEnvVar` e, na ausência dele,
// no próprio nome de `envVar` — por convenção, o secret no Secret Manager
// tem o mesmo nome da env var (ver README), então `*_ID` só precisa ser
// setado em backend/.env quando um dev quiser apontar para um secret com
// nome diferente. O valor resolvido é gravado de volta em
// process.env[envVar] — o resto do código (msalClient.js, sessionToken.js)
// continua lendo process.env sem saber de onde veio.
async function resolveSecret(envVar, secretIdEnvVar) {
  if (process.env[envVar]) {
    return process.env[envVar];
  }

  const secretId = process.env[secretIdEnvVar] || envVar;
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

// Resolve os 5 valores da aplicação que vivem no Secret Manager — chamada
// uma vez, no boot (backend/src/index.js), antes de app.listen(). Só
// AZURE_CLIENT_SECRET/SESSION_JWT_SECRET são segredos "de verdade"; os
// outros 3 (tenant/client/group do Entra ID) foram promovidos ao Secret
// Manager também (ver docs/deploy-cloud-run-manual.md, que já injeta os 6
// em produção via --update-secrets) — resolveSecret() não distingue os
// dois casos, então reaproveitá-la aqui é só seguir a mesma convenção.
// GCP_PROJECT_ID fica de fora: é necessário para montar o resource name
// dos secrets acima, então não pode vir de lá (ovo e galinha).
//
// Em paralelo (Promise.all), não em sequência: os 5 são independentes entre
// si — cada um escreve numa env var diferente, nenhum depende do valor
// resolvido por outro — então não há razão pra pagar o tempo de rede de 5
// chamadas somado em vez do tempo da mais lenta delas. Isso importa
// especialmente em dev local (sem Cloud Run injetando nada, toda vez busca
// as 5 no Secret Manager via ADC impersonada); em produção nenhuma delas
// chega a chamar a API — process.env já vem populado pelo Cloud Run.
async function resolveAppSecrets() {
  await Promise.all([
    resolveSecret('AZURE_CLIENT_SECRET', 'AZURE_CLIENT_SECRET_ID'),
    resolveSecret('SESSION_JWT_SECRET', 'SESSION_JWT_SECRET_ID'),
    resolveSecret('AZURE_TENANT_ID', 'AZURE_TENANT_ID_ID'),
    resolveSecret('AZURE_CLIENT_ID', 'AZURE_CLIENT_ID_ID'),
    resolveSecret('AZURE_ALLOWED_GROUP_ID', 'AZURE_ALLOWED_GROUP_ID_ID'),
  ]);
}

module.exports = { resolveSecret, resolveAppSecrets };
