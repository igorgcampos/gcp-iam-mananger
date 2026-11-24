# Último uso Antigravity lido de um sink do Cloud Logging no BigQuery

O Antigravity substitui o Code Assist para quem tem Licença do Gemini Enterprise. Ele pode ser usado pela IDE própria ou pela extensão do VS Code, e precisamos saber quem de fato está usando. O "Último acesso" que a tela Gemini já mostra vem da Discovery Engine API e mede o uso do Gemini Enterprise (Agentspace), não do Antigravity. Com o logging de metadados ligado em *AI developer tools → Compliance* (o de prompts e respostas continua desligado), cada uso gera logs `businessaicode.googleapis.com/*` no projeto `agentspace-469418`, com `labels.user_id = "user:<email>"`.

Decidimos **exportar esses logs com um sink do Cloud Logging (`ai-dev-tools-bq`, filtro `resource.type="businessaicode.googleapis.com/BAICInstance"`, tabelas particionadas) para o dataset `ai_dev_tools_logs` no projeto `infra-bi-355620`**, ao lado do Billing Export, e fazer a aplicação agregar por e-mail com uma consulta ao BigQuery (`GET /api/antigravity/usage`, cache de 1h em memória). O job roda no `agentspace-469418`, como as consultas de Custos (ADR 0006).

## Considered Options

- **Consultar o Cloud Logging direto (`entries.list`) a cada carga**: descartada. O bucket `_Default` guarda só 30 dias, então quem usou há 40 dias apareceria como "sem uso". Além disso, agregar "último uso por pessoa" exige paginar todos os logs do período a cada consulta.
- **Dataset no próprio `agentspace-469418`**: descartada. O projeto não tem BigQuery em uso; os dados de BI e custo da empresa ficam no `infra-bi-355620`, e o FinOps pode cruzar o uso com o custo lá.
- **Separar uso da IDE e da extensão do VS Code**: não é possível com os logs atuais. As duas chegam com `client_name = "antigravity_hub"`; só a versão (`client_version`) varia.
- **Usar a CustomRole do Code Assist como sinal de uso**: descartada. Ela indica quem tem permissão, não quem usa.

## Consequences

- O sink não faz backfill: só há dado a partir da criação dele, **24/11/2026 às 16:32 (horário de Brasília)**. Quem não aparece nos logs é exibido como "Sem uso desde 24/11/2026", nunca "Nunca usou". No relatório de inatividade por Antigravity, a referência é a mais recente entre o último uso (ou, sem uso, essa data) e a atribuição, para que uma licença reatribuída não apareça como inativa há meses.
- Permissões no **dataset**, não no projeto `infra-bi-355620`: o writer do sink (`service-789570275871@gcp-sa-logging.iam.gserviceaccount.com`) tem `BigQuery Data Editor`, e a SA da aplicação tem `BigQuery Data Viewer`. Um `dataEditor` no projeto daria escrita no Billing Export.
- As partições não expiram: o volume é pequeno (metadados, uma linha por interação) e o histórico permite responder "quem usou nos últimos N meses".
- Só entra o uso no projeto `agentspace-469418` com a conta corporativa. Uso com conta pessoal ou em outro projeto não aparece.
- Se o BigQuery falhar (permissão, dataset removido), só a coluna "Último uso Antigravity" degrada para "—"; o resto da tela Gemini Enterprise funciona.
- O dataset fica no código (`infra-bi-355620.ai_dev_tools_logs`) e pode ser trocado por `ANTIGRAVITY_LOGS_DATASET`, sem precisar mudar o deploy.
