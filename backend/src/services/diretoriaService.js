const axios = require('axios');
const { getGraphAppToken } = require('./graphGroupCheck');

// Diretoria do Usuário = extensionAttribute4 do Entra ID (AD), lido via
// Microsoft Graph — ver docs/adr/0014-diretoria-lida-do-entra-id.md. Exige a
// permissão de aplicação User.Read.All: com só User.ReadBasic.All o Graph não
// dá erro, apenas devolve onPremisesExtensionAttributes como null.

const GRAPH_BATCH_URL = 'https://graph.microsoft.com/v1.0/$batch';
const GRAPH_BATCH_SIZE = 20; // limite do $batch do Graph
const DIRETORIA_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas
const SELECT = '$select=mail,onPremisesExtensionAttributes';

// Cache em memória por instância — não é persistência: some num restart, e
// cada réplica do Cloud Run tem o seu. email -> { value, expiresAt }
const cache = new Map();

function _resetCache() {
  cache.clear();
}

function readCache(email, now) {
  const entry = cache.get(email);
  if (!entry || entry.expiresAt <= now) return undefined;
  return entry;
}

// 200 → valor (vazio/espaços vira null); 404 → null (não está no Entra);
// qualquer outro status → undefined (falha transitória: fica de fora do
// resultado e não é cacheado, para ser tentado de novo).
// Com User.Read.All, um usuário sem valor vem como objeto de nulls; o objeto
// inteiro null significa permissão ausente — também undefined, senão todo
// mundo viraria "Sem Diretoria" (e ficaria assim no cache por 6h).
function resolveResponse(response) {
  if (response.status === 200) {
    const attributes = response.body?.onPremisesExtensionAttributes;
    if (!attributes) return undefined;
    const raw = attributes.extensionAttribute4;
    return (typeof raw === 'string' && raw.trim()) || null;
  }
  if (response.status === 404) return null;
  return undefined;
}

async function fetchBatch(emails, token) {
  const requests = emails.map((email, i) => ({
    id: String(i),
    method: 'GET',
    url: `/users/${encodeURIComponent(email)}?${SELECT}`,
  }));
  const { data } = await axios.post(
    GRAPH_BATCH_URL,
    { requests },
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return (data?.responses ?? []).map((response) => ({
    email: emails[Number(response.id)],
    value: resolveResponse(response),
  }));
}

async function getDiretorias(emails) {
  const normalized = [...new Set(emails.map((e) => e.trim().toLowerCase()))];
  const result = {};
  const misses = [];
  const now = Date.now();

  normalized.forEach((email) => {
    const entry = readCache(email, now);
    if (entry) result[email] = entry.value;
    else misses.push(email);
  });

  if (!misses.length) return result;

  const token = await getGraphAppToken();
  // Lotes em sequência, não em paralelo — evita estourar o throttling do Graph.
  for (let i = 0; i < misses.length; i += GRAPH_BATCH_SIZE) {
    // eslint-disable-next-line no-await-in-loop
    const resolved = await fetchBatch(misses.slice(i, i + GRAPH_BATCH_SIZE), token);
    resolved.forEach(({ email, value }) => {
      if (email === undefined || value === undefined) return;
      result[email] = value;
      cache.set(email, { value, expiresAt: Date.now() + DIRETORIA_CACHE_TTL_MS });
    });
  }

  return result;
}

module.exports = {
  getDiretorias, _resetCache, DIRETORIA_CACHE_TTL_MS, GRAPH_BATCH_SIZE,
};
