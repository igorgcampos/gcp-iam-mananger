jest.mock('axios', () => ({ post: jest.fn() }));
jest.mock('./graphGroupCheck', () => ({ getGraphAppToken: jest.fn() }));

const axios = require('axios');
const { getGraphAppToken } = require('./graphGroupCheck');
const {
  getDiretorias, _resetCache, DIRETORIA_CACHE_TTL_MS, GRAPH_BATCH_SIZE,
} = require('./diretoriaService');

const BATCH_URL = 'https://graph.microsoft.com/v1.0/$batch';

// Resposta do $batch do Graph: cada item ecoa o id do request.
function batch(responses) {
  return { data: { responses } };
}

function ok(id, extensionAttribute4) {
  return { id, status: 200, body: { onPremisesExtensionAttributes: { extensionAttribute4 } } };
}

// Responde cada request do lote com o valor que `valueFor(url)` devolver.
function respondPerRequest(valueFor) {
  axios.post.mockImplementation(async (url, { requests }) => batch(
    requests.map((r) => ok(r.id, valueFor(r.url))),
  ));
}

beforeEach(() => {
  _resetCache();
  getGraphAppToken.mockResolvedValue('tok');
});

afterEach(() => {
  jest.useRealTimers();
});

test('devolve extensionAttribute4 indexado pelo e-mail em minúsculas', async () => {
  axios.post.mockResolvedValue(batch([ok('0', 'ESTRATÉGIA DIGITAL')]));

  await expect(getDiretorias(['ACottet@EdGlobo.com.br']))
    .resolves.toEqual({ 'acottet@edglobo.com.br': 'ESTRATÉGIA DIGITAL' });

  expect(axios.post).toHaveBeenCalledWith(
    BATCH_URL,
    { requests: [{ id: '0', method: 'GET', url: '/users/acottet%40edglobo.com.br?$select=mail,onPremisesExtensionAttributes' }] },
    { headers: { Authorization: 'Bearer tok' } },
  );
});

test('atributo vazio, só espaços ou ausente vira null', async () => {
  axios.post.mockResolvedValue(batch([
    ok('0', ''),
    ok('1', '   '),
    { id: '2', status: 200, body: { onPremisesExtensionAttributes: null } },
    ok('3', '  TECNOLOGIA  '),
  ]));

  await expect(getDiretorias(['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com'])).resolves.toEqual({
    'a@x.com': null,
    'b@x.com': null,
    'c@x.com': null,
    'd@x.com': 'TECNOLOGIA',
  });
});

test('404 do Graph vira null (Sem Diretoria)', async () => {
  axios.post.mockResolvedValue(batch([{ id: '0', status: 404, body: { error: { code: 'Request_ResourceNotFound' } } }]));

  await expect(getDiretorias(['sumiu@x.com'])).resolves.toEqual({ 'sumiu@x.com': null });
});

test('429/500 num item deixa o e-mail ausente e não cacheia', async () => {
  axios.post.mockResolvedValueOnce(batch([
    ok('0', 'CBN'),
    { id: '1', status: 429, body: { error: { code: 'TooManyRequests' } } },
    { id: '2', status: 500, body: {} },
  ]));

  await expect(getDiretorias(['a@x.com', 'b@x.com', 'c@x.com']))
    .resolves.toEqual({ 'a@x.com': 'CBN' });

  axios.post.mockResolvedValueOnce(batch([ok('0', 'TECNOLOGIA'), ok('1', 'AUDIÊNCIA')]));
  await expect(getDiretorias(['a@x.com', 'b@x.com', 'c@x.com'])).resolves.toEqual({
    'a@x.com': 'CBN',
    'b@x.com': 'TECNOLOGIA',
    'c@x.com': 'AUDIÊNCIA',
  });

  // Só os dois que falharam voltam ao Graph — o que deu certo veio do cache.
  const segundaChamada = axios.post.mock.calls[1][1].requests.map((r) => r.url);
  expect(segundaChamada).toEqual([
    '/users/b%40x.com?$select=mail,onPremisesExtensionAttributes',
    '/users/c%40x.com?$select=mail,onPremisesExtensionAttributes',
  ]);
});

test('quebra em lotes de 20', async () => {
  respondPerRequest(() => 'TI');
  const emails = Array.from({ length: 45 }, (_, i) => `u${i}@x.com`);

  const result = await getDiretorias(emails);

  expect(GRAPH_BATCH_SIZE).toBe(20);
  expect(axios.post).toHaveBeenCalledTimes(3);
  expect(axios.post.mock.calls.map((c) => c[1].requests.length)).toEqual([20, 20, 5]);
  expect(Object.keys(result)).toHaveLength(45);
  expect(result['u44@x.com']).toBe('TI');
});

test('deduplica e-mails antes de consultar', async () => {
  axios.post.mockResolvedValue(batch([ok('0', 'CBN')]));

  await expect(getDiretorias(['a@x.com', ' A@X.com '])).resolves.toEqual({ 'a@x.com': 'CBN' });

  expect(axios.post.mock.calls[0][1].requests).toHaveLength(1);
});

test('usa o cache dentro do TTL e reconsulta depois', async () => {
  jest.useFakeTimers({ now: 0 });
  respondPerRequest(() => 'CBN');

  await getDiretorias(['a@x.com']);
  jest.setSystemTime(DIRETORIA_CACHE_TTL_MS - 1);
  await getDiretorias(['a@x.com']);
  expect(axios.post).toHaveBeenCalledTimes(1);

  jest.setSystemTime(DIRETORIA_CACHE_TTL_MS + 1);
  await getDiretorias(['a@x.com']);
  expect(axios.post).toHaveBeenCalledTimes(2);
});

test('cacheia null (Sem Diretoria) como qualquer outro valor resolvido', async () => {
  respondPerRequest(() => '');

  await getDiretorias(['a@x.com']);
  await expect(getDiretorias(['a@x.com'])).resolves.toEqual({ 'a@x.com': null });

  expect(axios.post).toHaveBeenCalledTimes(1);
});

test('lista vazia não chama o Graph', async () => {
  await expect(getDiretorias([])).resolves.toEqual({});
  expect(axios.post).not.toHaveBeenCalled();
  expect(getGraphAppToken).not.toHaveBeenCalled();
});

test('falha do $batch inteiro propaga o erro', async () => {
  axios.post.mockRejectedValue(new Error('Graph fora do ar'));

  await expect(getDiretorias(['a@x.com'])).rejects.toThrow('Graph fora do ar');
});
