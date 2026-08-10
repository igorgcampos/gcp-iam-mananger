# Critério de Custo de Infra passa a ser infraestrutura genérica de nuvem, e "Não Categorizado" é renomeado para "Outros Serviços"

A ADR 0006 definiu Custo de Infra como "serviços que rodam esta própria aplicação" — um critério estreito que deixava `Cloud Storage` e `Secret Manager` (este último, apesar de já ser usado pelo backend via `@google-cloud/secret-manager`) caindo em "Não Categorizado". Identificamos isso ao ver custos reais de Cloud Storage aparecendo em "Não Categorizado" e decidimos que o critério deveria ser outro: `INFRA_SERVICES` (`backend/src/services/billingService.js`) passa a listar infraestrutura "clássica" de nuvem — compute, storage, banco, rede, segurança, devops, observabilidade e mensageria — independente de a aplicação já consumir aquele serviço hoje ou não. Serviços de dados/analytics (`Dataflow`, `Dataproc`, `Looker` etc.) ficam de fora de propósito, por serem uma categoria conceitualmente diferente de "infra"; `BigQuery` permanece como exceção deliberada.

A categoria de fechamento (soma de tudo que não é Gemini nem Infra) é renomeada de "Não Categorizado" para **"Outros Serviços"** na UI e no CONTEXT.md — mantendo, internamente no código, a chave `uncategorized` (não é uma mudança de contrato de API, só de rótulo visível). O nome "Outros" sozinho foi descartado por colidir com o rótulo já existente de SKU sem descrição (`IFNULL(sku.description, 'Outros')`).

## Considered Options

- **Manter o critério da ADR 0006** ("o que a app usa"): descartado — exigiria adicionar cada serviço um por um só depois que aparecesse em "Não Categorizado" como surpresa, o que é o comportamento que motivou esta revisão.
- **Infra = tudo que não é Gemini** (sem lista explícita, sem terceira categoria): descartado — elimina o alarme de "serviço novo/inesperado apareceu", que é o propósito original da terceira categoria (ver ADR 0006).
- **Incluir serviços de dados/analytics na lista de Infra**: descartado por ora — mantém a lista menor e mais fácil de revisar; esses serviços caem em "Outros Serviços" se um dia aparecerem, servindo de sinal para decidir na hora.

## Consequences

- A lista `INFRA_SERVICES` fica maior (~25 serviços) e precisa ser revisada de tempos em tempos para continuar cobrindo a infraestrutura "clássica" de nuvem relevante — mesmo critério manual da ADR 0006, só que mais abrangente.
- "Outros Serviços" continua existindo como alarme de serviço novo/inesperado, mas agora com menos falsos positivos (Cloud Storage e Secret Manager, que apareciam ali, agora vão para Infra).
