const { GoogleAuth } = require('google-auth-library');

// Sem `keyFile`: a credencial vem sempre da cadeia padrão de Application
// Default Credentials — metadata server no Cloud Run (SA anexada
// diretamente ao serviço) em produção, ADC impersonada da mesma SA
// (`gcloud auth application-default login --impersonate-service-account=...`)
// em dev local. Nenhum caminho de fallback para chave estática existe mais
// — ver docs/adr/0007-adc-e-secret-manager-para-credenciais.md.
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

async function getAccessToken() {
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token;
}

module.exports = { auth, getAccessToken };
