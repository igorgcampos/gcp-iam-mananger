# Custo Gemini inclui assinaturas Gemini/Agentspace com `project.id` nulo

Investigando uma licença Gemini Enterprise Standard contratada (visível na tela Gemini, 47/47 slots) que nunca aparecia no Custo Gemini da página de Billing, descobrimos que o SKU dela (`"Gemini Enterprise Standard: Subscription - one year term"`) é faturado pelo Google no nível da **Billing Account inteira**, com `project.id` nulo no Billing Export — diferente do `"Agentspace Enterprise Plus"`, que consome com `project.id = agentspace-469418` normalmente. A query original (`WHERE project.id = @projectId`) descartava essa linha silenciosamente, sem cair nem em "Não Categorizado" (o filtro de projeto acontece antes de qualquer categorização).

Decidimos ampliar a query pra incluir `project.id IS NULL` **só quando o Serviço está na lista `GEMINI_SERVICES`** (`Vertex AI Search`, `Vertex AI`), dobrando esse custo pra dentro do Custo Gemini existente. Infra e Não Categorizado continuam estritamente por `project.id = agentspace-469418`.

## Considered Options

- **Card separado "Assinaturas de conta"**: preservaria a definição original de "Custo do Projeto" (100% atribuível ao projeto) sem reescrevê-la, ao custo de mais um card na UI e de o usuário ter que somar dois números pra saber o gasto real com Gemini. Descartada — a pergunta que motivou essa investigação era justamente "por que meu contrato de licença não bate com o card Gemini", e um card separado teria o mesmo problema de novo.
- **Não fazer nada**: manter a query como estava, aceitando que assinaturas faturadas no nível da conta nunca aparecem no painel. Descartada — mascara um custo real e relevante (~R$ 10-13 mil/mês nesse caso), justamente o tipo de coisa que a página de Custos existe pra vigiar.

## Consequences

- "Custo do Projeto" deixa de ser, na prática, 100% "atribuível ao projeto" — passa a incluir assinaturas de Billing Account inteira quando o Serviço é Gemini/Agentspace. A definição no `CONTEXT.md` foi atualizada pra refletir isso explicitamente, com a ressalva.
- Risco aceito: se outro time, em outro dos ~71 projetos dessa Billing Account, também tiver uma assinatura `Vertex AI Search`/`Vertex AI` faturada com `project.id` nulo, o custo dela entraria no Custo Gemini deste painel também — não há campo de projeto pra desambiguar linhas sem `project.id`. Mitigação: a lista `GEMINI_SERVICES` é curta e deliberada (2 serviços), reduzindo a chance de colisão; se acontecer, aparecerá como um salto inesperado no valor do card, mesmo sinal que já usamos hoje pra "Não Categorizado" crescer sem explicação.
- Infra e Não Categorizado não ganharam a mesma exceção — só Gemini, porque foi o caso concreto observado. Se um serviço de Infra também vier a ser faturado sem `project.id` no futuro, essa decisão precisa ser revisitada.
