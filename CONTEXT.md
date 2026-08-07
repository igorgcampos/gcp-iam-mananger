# GCP IAM Manager

Painel web que permite administrar, sem usar o console do GCP diretamente, quem tem acesso ao Agentspace (via papel IAM, incluindo Papéis Complementares como o Code Assist) e quem possui licença Gemini Enterprise.

## Language

**Licença (License)**:
Um tier de assinatura do Gemini Enterprise/Agentspace atribuído a um usuário do Workspace. Hoje existem dois tiers: **Gemini Enterprise Standard** e **Agentspace Enterprise Plus**.
_Avoid_: Subscription tier, plano

**Atribuição (License Assignment)**:
O vínculo entre um usuário e uma Licença, criado em uma data (`Atribuída em`) e com um Status próprio. É o registro central sobre o qual se avalia uso e inatividade.
_Avoid_: User license, binding

**Status da Atribuição**:
O estado atual de uma Atribuição. **Atribuída** significa que o usuário ocupa uma Licença agora. **Sem licença** significa que o usuário tentou acessar mas não tem uma Licença ocupada — não conta como uso de vaga.
_Avoid_: Assignment state, license state

**Data de Referência**:
A data usada para medir uso de uma Atribuição: o Último acesso do usuário, ou — quando ele nunca acessou a ferramenta — a própria data de Atribuição. É sempre "a última vez que sabemos que essa licença foi tocada".
_Avoid_: Last activity, anchor date

**Usuário Inativo**:
Um usuário com Atribuição em Status "Atribuída" cuja Data de Referência está mais distante do que o Limite de Inatividade escolhido. Representa uma Licença possivelmente ociosa, candidata a ser liberada para outra pessoa.
_Avoid_: Inactive user (ok em código), usuário ocioso

**Limite de Inatividade**:
O número de meses, escolhido pelo administrador no momento da consulta, usado para decidir se a Data de Referência de uma Atribuição é antiga demais. Não é um valor fixo do sistema — varia por consulta.
_Avoid_: Inactivity threshold (ok em código), corte, cutoff

**Remoção de Licença**:
A ação administrativa (disponível nas telas "Gemini Enterprise" e "Relatório de Usuários Inativos") que encerra a Atribuição de um usuário. Além de remover a Licença, hoje ela também revoga o papel IAM `discoveryengine.user` do mesmo usuário, se ele existir — as duas coisas são, para o administrador, uma única operação de "tirar o acesso desse usuário". O acoplamento é unidirecional: revogar o papel IAM diretamente pela tela de IAM não remove a Licença.
_Avoid_: Remover usuário (ambíguo sobre o que exatamente é removido — a Licença, o papel IAM, ou ambos)

**Operador**:
Quem loga no painel e executa ações administrativas (adicionar/remover Usuário, conceder/revogar Papel Complementar, atribuir/remover Licença), autenticado via SSO (Entra ID) e autorizado por pertencer a um grupo específico do AD (ver [ADR 0005](docs/adr/0005-sso-entra-id-para-acesso-ao-painel.md)). Distinto de **Usuário**: o Operador é quem opera a ferramenta; o Usuário é quem é gerenciado por ela (via IAM/Licenças Gemini). Não há tiers entre Operadores — pertencer ao grupo já concede acesso total.
_Avoid_: Admin (ambíguo com "Super Admin" do Workspace, que é outro papel, fora do escopo deste painel), usuário administrador

### Provisionamento de Identidade (Entra → Cloud Identity)

**Identidade Sincronizada**:
Um objeto de usuário provisionado no diretório do Cloud Identity/Workspace da organização, originado do Entra ID (AD) por um conector de provisionamento administrado pelo time de AD. É pré-requisito para que um email seja resolvível como principal no IAM do GCP, seja como principal do Workforce Pool (`principal://...`) ou como membro direto do Cloud Identity (`user:<email>`) — sem ela, o binding é criado mas nunca concede acesso de fato.
_Avoid_: Usuário sincronizado (é o objeto no diretório, não a pessoa), conta do AD, usuário do Entra

**Validação de Principal**:
A checagem que confirma se um email já possui Identidade Sincronizada, feita antes de conceder qualquer Papel Complementar. Se válida, a concessão prossegue; se inválida, a concessão é bloqueada e o email precisa ser encaminhado ao time de AD para ser incluído no grupo de sincronização.
_Avoid_: Validar email (é o principal que é validado, não o formato do email)

**Papel Complementar**:
Um papel IAM gerenciável na tela "IAM — Discovery Engine User" além do `discoveryengine.user`, concedido por opção do administrador a um usuário que já tem `discoveryengine.user`. Hoje existe um: **Code Assist**. Um Papel Complementar nunca existe isolado — revogar `discoveryengine.user` de um usuário revoga também todos os seus Papéis Complementares.
_Avoid_: Role adicional, permissão extra

**Code Assist**:
O único Papel Complementar existente hoje: uma role IAM customizada (`projects/agentspace-469418/roles/CustomRole`) com permissões específicas de assistência de código. Ao contrário do `discoveryengine.user` — concedido via principal do Workforce Pool — o Code Assist é concedido via membro direto do Cloud Identity (`user:<email>`).
_Avoid_: Code assist role, custom role (ambíguo — a Validação de Principal usa outra role customizada, descartável, só para teste de existência)

_Nota de implementação_: o e-mail no principal do Workforce Pool preserva a capitalização enviada pelo Entra ID; o e-mail no membro do Cloud Identity é normalizado pelo GCP para a capitalização canônica da conta. As duas fontes podem divergir em maiúsculas/minúsculas para o mesmo usuário sem que isso signifique falha na concessão — qualquer código que cruze os dois vínculos (como `listUsers`) precisa comparar e-mails de forma case-insensitive.

### Billing (custos GCP)

**Billing Account**:
Recurso do GCP, existente no nível da organização, ao qual projetos são vinculados para cobrança. A organização da Editora Globo tem 3, mas o painel só olha para a que cobre o projeto `agentspace-469418`: **"Projetos Editora Globo"** (ID `01779C-55AF20-FD92F6`). Diferente de **Organização**: a Organização é o nó raiz do GCP; a Billing Account é um recurso específico dentro dela, e um projeto se vincula a exatamente uma Billing Account por vez.
_Avoid_: Conta de faturamento (ok em português na UI), conta de billing

**Custo do Projeto**:
O total gasto, dentro da Billing Account "Projetos Editora Globo", atribuível ao projeto `agentspace-469418` **mais as assinaturas Gemini/Agentspace cobradas no nível da Billing Account** (ver exceção no Custo Gemini, abaixo) — na prática, o gasto que este painel existe para vigiar, mesmo quando uma parcela dele não carrega `project.id`. Escopo da página de Billing: não inclui outros projetos nem as outras 2 Billing Accounts da organização. Calculado sempre como `Custo Gemini + Custo de Infra + Não Categorizado` — as três parcelas sempre somam o total, nunca deixam resto escondido.
_Avoid_: Custo total (ambíguo — total de quê), gasto do projeto

**Custo Gemini**:
Subcategoria do Custo do Projeto: soma dos Serviços cujo `service.description` está numa lista explícita e nomeada de serviços de billing relacionados a Gemini/Agentspace (confirmado via GCP Billing Console: `"Vertex AI Search"` — licenças Gemini Enterprise/Agentspace Enterprise Plus — e `"Vertex AI"` — consumo de modelo/LLM subjacente). É custo de *consumo do provedor*, distinto da **Licença** (que é o vínculo de atribuição a um usuário, já definida acima) — o Custo Gemini é o valor em R$ cobrado pela Billing Account por esse consumo, não o registro de quem está usando a vaga.
_Exceção de `project.id`_: nem toda linha de Custo Gemini tem `project.id = agentspace-469418`. Assinaturas anuais (SKU tipo `"...Subscription - one year term"`) às vezes são faturadas no nível da Billing Account inteira, com `project.id` nulo — ex: `"Gemini Enterprise Standard"` é assim, enquanto `"Agentspace Enterprise Plus"` tem `project.id` preenchido normalmente. A query inclui explicitamente linhas com `project.id IS NULL` desde que o Serviço esteja na lista Gemini (ver `queryCostByService` em `backend/src/services/billingService.js`) — decisão registrada, não filtra por engano nem é heurística automática; Infra e Não Categorizado continuam estritamente por `project.id = agentspace-469418`.
_Avoid_: Custo de licenças (mistura com o conceito de Licença)

**Custo de Infra**:
Subcategoria do Custo do Projeto: soma dos Serviços cujo `service.description` está numa lista explícita e nomeada de serviços de infraestrutura que rodam esta própria aplicação (candidatos: `Cloud Run`, `Artifact Registry`, `Cloud Logging`, `BigQuery`). Contraparte do Custo Gemini — juntos, mais o Não Categorizado, formam o Custo do Projeto. Inclui, por natureza recursiva, o próprio custo das queries que a aplicação roda contra o `billing_standard` (elas rodam no projeto `agentspace-469418`, então aparecem como Serviço `BigQuery` na tabela no dia seguinte — nenhuma instrumentação própria é necessária).
_Avoid_: Custo GCP ADMIN (nome do app, não da categoria — confunde com o card de UI), custo de aplicação (ambíguo com Custo do Projeto)

**Não Categorizado**:
Subcategoria do Custo do Projeto: soma dos Serviços cujo `service.description` não está em nenhuma das listas de Custo Gemini nem Custo de Infra. Existe para garantir que a soma das três parcelas sempre feche com o Custo do Projeto — é o alerta natural de que surgiu um serviço novo que precisa ser classificado.
_Avoid_: Outros (usar em UI é ok, mas no glossário o nome é Não Categorizado — "Outros" é ambíguo com "outros projetos")

**Serviço** (`service.description`):
Campo do Billing Export que identifica o produto GCP cobrado (ex: `"Vertex AI"`, `"Cloud Run"`) — é o nível de granularidade usado para classificar cada linha de custo em Custo Gemini, Custo de Infra ou Não Categorizado (ver `GEMINI_SERVICES`/`INFRA_SERVICES` em `backend/src/services/billingService.js`). Mais grosso que **SKU**: um Serviço agrupa vários SKUs.
_Avoid_: SKU (é outro campo, mais granular — ver **SKU**)

**SKU** (`sku.description`):
Campo do Billing Export mais granular que **Serviço** — identifica o item de cobrança específico dentro de um Serviço (ex: dentro do Serviço `"Vertex AI Search"`, SKUs distintos por tipo de uso). Cada linha do Billing Export tem exatamente um Serviço e um SKU. Usado no drill-down por card da página de Billing: ao expandir um card de categoria, a lista exibida chega ao nível de SKU, agrupada em dois níveis (Serviço, e dentro de cada um os SKUs dele), preservando a categorização (Gemini/Infra/Não Categorizado) que continua sendo feita por Serviço.
_Avoid_: usar "SKU" para o que na verdade é Serviço (confusão histórica deste glossário — corrigida nesta entrada)

**Billing Export (Standard usage cost)**:
Mecanismo do GCP, já habilitado na Billing Account "Projetos Editora Globo", que grava diariamente o custo por SKU de todos os projetos da Billing Account (71 no momento desta decisão) numa tabela do BigQuery: `infra-bi-355620.billing_standard.gcp_billing_export_v1_01779C_55AF20_FD92F6` — o sufixo do nome da tabela é o ID da Billing Account, não de um projeto. É a fonte de dados de toda a página de Billing; consultada diretamente (schema padrão do Google), sem depender das tabelas/views internas de FinOps (`tbCusto*`, `vwResultadoMes*`) que outro time mantém no mesmo dataset. Distinto de **Detailed usage cost** (outro tipo de export, desabilitado, que adicionaria granularidade por recurso individual — não usado por esta feature).
_Avoid_: Billing export genérico (especificar sempre "Standard usage cost" quando a distinção importar), export de faturamento
