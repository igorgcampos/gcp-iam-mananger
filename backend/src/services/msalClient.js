const { ConfidentialClientApplication } = require('@azure/msal-node');

// Autoridade fixada no tenant específico da EdGlobo — NUNCA usar /common ou
// /organizations. Decisão explícita registrada no ADR 0005: só contas desse
// tenant devem conseguir completar o fluxo OIDC.
function buildMsalConfig() {
  return {
    auth: {
      clientId: process.env.AZURE_CLIENT_ID,
      authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
      clientSecret: process.env.AZURE_CLIENT_SECRET,
    },
  };
}

// Uma nova instância por chamada é intencional: o client do MSAL Node é
// leve e sem estado de rede próprio (cache em memória por instância), e criar
// sob demanda evita reter o clientSecret carregado antes das env vars serem
// lidas em testes/bootstrap.
function getMsalClient() {
  return new ConfidentialClientApplication(buildMsalConfig());
}

module.exports = { getMsalClient, buildMsalConfig };
