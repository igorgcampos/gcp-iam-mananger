const axios = require('axios');
const { getMsalClient } = require('./msalClient');

const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';

// Client Credentials Flow — token de aplicação, sem usuário interativo.
// Usa o mesmo Client Secret do login, mas é uma chamada MSAL totalmente
// separada da troca de código do /auth/callback.
async function getGraphAppToken() {
  const result = await getMsalClient().acquireTokenByClientCredential({
    scopes: [GRAPH_SCOPE],
  });
  if (!result?.accessToken) {
    throw new Error('Falha ao obter token de aplicação do Microsoft Graph');
  }
  return result.accessToken;
}

// Checagem de grupo via Microsoft Graph — acontece SÓ no momento do login
// (ver ADR 0005). Nunca deve ser chamada por requisição de API subsequente:
// o resultado é embutido na sessão (JWT) emitida logo em seguida.
async function isMemberOfAllowedGroup(oid) {
  const groupId = process.env.AZURE_ALLOWED_GROUP_ID;
  if (!groupId) {
    throw new Error('AZURE_ALLOWED_GROUP_ID não configurado');
  }

  const accessToken = await getGraphAppToken();
  const response = await axios.post(
    `https://graph.microsoft.com/v1.0/users/${oid}/checkMemberGroups`,
    { groupIds: [groupId] },
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  const memberGroupIds = response.data?.value ?? [];
  return memberGroupIds.includes(groupId);
}

module.exports = { isMemberOfAllowedGroup, getGraphAppToken };
