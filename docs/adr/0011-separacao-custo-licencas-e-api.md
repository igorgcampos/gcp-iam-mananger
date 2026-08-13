# Custo Gemini se divide em Custo de Licenças e Custo de API, dois cards de primeira classe

Até aqui, `Vertex AI Search` e `Vertex AI` eram tratados como uma única categoria de billing ("Custo Gemini"), com um card e um seletor de projeto compartilhado na página de Billing. Como consumo de licença (assinatura) e consumo de API (uso de modelo) vão evoluir de formas independentes daqui pra frente, decidimos separá-los em categorias de domínio próprias — **Custo de Licenças** (`Vertex AI Search`) e **Custo de API** (`Vertex AI`) — cada uma com seu card, seu seletor de projeto ("Todos os projetos"/projeto específico) e sua entrada no `CONTEXT.md`. O termo "Custo Gemini" é aposentado.

## Considered Options

- **Split só na apresentação**, mantendo `summary.gemini`/`geminiByProject` como um bucket único no backend e recortando por `service` na tela: descartada — perpetuaria "Custo Gemini" como o conceito real do domínio, com a separação existindo só como corte visual; não escala se no futuro surgir mais de um serviço de licença ou de API.
- **Duas queries cross-project independentes** (uma por serviço) em vez de dividir em memória o resultado de uma única query: descartada — dobraria o número de queries no BigQuery a cada refresh sem ganho nenhum, já que a query existente já retorna `service` por linha (mesmo raciocínio de custo de bytes escaneados da ADR 0010).
- **Seletor de projeto único, compartilhado pelos dois cards**: descartada — Licenças e API são conceitos de domínio independentes agora; um projeto pode ter licença sem uso de API relevante, ou vice-versa, e um seletor compartilhado voltaria a acoplar os dois.

## Consequences

- `GEMINI_SERVICES` vira `LICENSE_SERVICES = ['Vertex AI Search']` e `API_SERVICES = ['Vertex AI']`; `summary.gemini`/`summary.items.gemini` viram `summary.licenses`/`summary.items.licenses`, e o equivalente de API vira `summary.vertexApi`/`summary.items.vertexApi` (prefixo `vertex` só nesse campo, pra não ser confundido com "a API deste backend"; o de licenças não precisou do prefixo).
- `geminiByProject` (ADR 0010) vira duas estruturas, `licensesByProject` e `apiByProject`, derivadas da **mesma** query cross-project existente — sem query nova no BigQuery.
- A exceção de `project.id IS NULL` da ADR 0008 continua valendo, mas hoje só é observada na prática em `LICENSE_SERVICES` (é onde as assinaturas anuais faturadas na Billing Account inteira acontecem); a query mantém o critério por lista, não por comportamento observado, então se `Vertex AI` também passar a faturar sem `project.id` no futuro, o Custo de API herda a mesma exceção automaticamente.
- A invariante do Custo do Projeto passa de 3 para 4 parcelas: `Custo de Licenças + Custo de API + Custo de Infra + Outros Serviços`.
- As ADRs 0008 e 0010 continuam corretas como registro histórico da decisão daquele momento e não foram reescritas; o `CONTEXT.md` é que reflete o vocabulário atual.
