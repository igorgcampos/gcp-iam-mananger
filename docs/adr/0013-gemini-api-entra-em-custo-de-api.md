# "Gemini API" entra em Custo de API, junto com "Vertex AI"

O card Custo de API (ADR 0011) só reconhecia `service.description = "Vertex AI"`. Um custo real do Serviço `"Gemini API"` — produto GCP diferente do Vertex AI (a API "direta" do Gemini, tipo AI Studio, tipicamente usada em projetos de teste/POC como `api-gemini-poc`) — não aparecia em lugar nenhum da página de Billing: nem em Custo de API (fora da lista `API_SERVICES`), nem em Outros Serviços (a query que alimenta Infra/Outros é escopada a `agentspace-469418`, e o projeto do exemplo é outro). Decidimos tratar `"Gemini API"` como Custo de API: adicionamos o Serviço a `API_SERVICES` em `backend/src/services/billingService.js`, o que automaticamente também o inclui em `VERTEX_SERVICES` — resolvendo as duas lacunas de uma vez, sem query nova, já que `VERTEX_SERVICES` já alimenta a query cross-project (ADR 0010) usada por `apiByProject`.

## Considered Options

- **Tratar como Outros Serviços, cross-project**: descartada — exigiria estender o escopo cross-project (hoje exclusivo do card de API/Licenças) também para Outros Serviços, mudança de arquitetura maior que o problema motivador pedia.
- **Deixar fora de escopo** (o painel é deliberadamente escopado a `agentspace-469418`, com exceção só para Vertex AI/Vertex AI Search — ADR 0006/0010): descartada — o consumo de modelo/LLM em `Gemini API` é o mesmo tipo de custo que Custo de API já rastreia (`Vertex AI`), só que outro produto GCP; não faz sentido ficar cego a ele.
- **Renomear `VERTEX_SERVICES`/`queryVertexCostByProject`/`summary.vertexApi`** para um nome que não sugira exclusividade Vertex: descartada por ora — o nome fica tecnicamente impreciso (a lista mistura produtos Vertex e não-Vertex), mas o custo de renomear em vários arquivos (backend, frontend, testes) não se justifica só por essa mudança; revisar se um terceiro Serviço de API aparecer.

## Consequences

- `API_SERVICES` deixa de ser uma lista de um Serviço Vertex só — passa a agrupar qualquer Serviço GCP que represente consumo de modelo/LLM, mesmo que o nome do produto não seja "Vertex".
- `VERTEX_SERVICES`, `queryVertexCostByProject` e `summary.vertexApi` continuam com o nome "Vertex" mesmo incluindo `Gemini API`, que não é um produto Vertex — nome tecnicamente impreciso, aceito deliberadamente (ver Considered Options).
- Um projeto de POC/teste que use `Gemini API` passa a contribuir para o total de Custo de API na visão "Todos os projetos" — e a aparecer como opção no seletor de projeto do card de API — mesmo sem nenhuma relação com licenças Gemini Enterprise/Agentspace.
