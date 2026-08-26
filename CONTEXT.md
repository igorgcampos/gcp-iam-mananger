# GCP IAM Manager

Painel web que permite administrar, sem usar o console do GCP diretamente, quem tem acesso ao Agentspace (via papel IAM, incluindo Papéis Complementares como o Code Assist) e quem possui licença Gemini Enterprise.

## Language

**Licença (License)**:
Um tier de assinatura do Gemini Enterprise/Agentspace atribuído a um usuário do Workspace. Hoje existem dois tiers: **Gemini Enterprise Standard** e **Agentspace Enterprise Plus**.
_Avoid_: Subscription tier, plano

**Renovação Automática** (`autoRenew`):
Atributo de uma Licença que indica se ela se renova sozinha ao fim do período de assinatura, sem depender de ação do Operador. Uma Licença com Renovação Automática nunca é tratada como expirando/expirada pela UI — nenhum Aviso de Expiração, Janela de Carência ou corte por data se aplica a ela, mesmo que sua data de expiração esteja no passado.
_Avoid_: Renovação (sem qualificar "automática" — toda Licença tem data de expiração, mas nem toda se renova sozinha)

**Licença Expirada**:
Uma Licença sem Renovação Automática cuja data de expiração já passou. Continua existindo e suas Atribuições continuam válidas — usuários mantêm acesso e contam nos totais — até serem removidas manualmente; expirar não revoga nada sozinho, só muda o que o Aviso de Expiração decide mostrar.
_Avoid_: Licença vencida (usar sempre "expirada", consistente com o campo `endDate`/rótulo "Expira em" já usados na UI)

**Janela de Carência** (de expiração):
O período de 5 dias corridos após a data de expiração de uma Licença Expirada durante o qual ela ainda aparece no Aviso de Expiração; passada a Janela de Carência, a Licença some dessas superfícies — mas não das que listam ou filtram Atribuições existentes (ver Aviso de Expiração).
_Avoid_: Grace period (usar o termo em português), "tolerância" sozinho sem "janela"

**Aviso de Expiração**:
O conjunto de superfícies de UI que refletem o estado de expiração de uma Licença: o Alert de expiração, o card "Licenças por camada" no Dashboard, o card "Slots livres" no Dashboard, e o resumo por camada e o seletor de nível no formulário de nova Atribuição na tela Gemini Enterprise. Uma Licença Expirada além da Janela de Carência desaparece de todas essas superfícies — inclusive dos Slots livres somados, já que um slot livre numa Licença Expirada não pode mais ser oferecido a um novo usuário. Deliberadamente **não inclui** o total de Licenças atribuídas nem o badge de total (GeminiPage) nem o filtro/linhas da tabela de Atribuições — esses continuam refletindo a Licença Expirada normalmente, porque servem para localizar quem ainda precisa migrar, não para decidir se a Licença deve ser oferecida a novos usuários.
_Avoid_: Alerta de licença (ambíguo com **Alerta de Custo**, conceito não relacionado, de Billing)

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
O total gasto, dentro da Billing Account "Projetos Editora Globo", atribuível ao projeto `agentspace-469418` **mais as assinaturas Gemini/Agentspace cobradas no nível da Billing Account** (ver exceção no Custo de Licenças, abaixo) — na prática, o gasto que este painel existe para vigiar, mesmo quando uma parcela dele não carrega `project.id`. Escopo da página de Billing: não inclui outros projetos nem as outras 2 Billing Accounts da organização, **com uma única exceção**: as visões "Todos os projetos" do Custo de Licenças e do Custo de API (ver abaixo), cada uma deliberadamente cross-project e independente da outra. Calculado sempre como `Custo de Licenças + Custo de API + Custo de Infra + Outros Serviços` — as quatro parcelas sempre somam o total, nunca deixam resto escondido. Essa soma vale para o Custo de Licenças e o Custo de API **escopados a `agentspace-469418`**; quando qualquer um dos dois está exibindo "Todos os projetos" (ou outro projeto específico), ele não entra nessa soma — é uma vista adicional, não uma parcela do Custo do Projeto.
_Avoid_: Custo total (ambíguo — total de quê), gasto do projeto

**Custo de Licenças** (anteriormente parte do "Custo Gemini" — separado na [ADR 0011](docs/adr/0011-separacao-custo-licencas-e-api.md)):
Subcategoria do Custo do Projeto: soma dos Serviços cujo `service.description` é `"Vertex AI Search"` (lista `LICENSE_SERVICES`, `backend/src/services/billingService.js`) — as licenças Gemini Enterprise Standard/Agentspace Enterprise Plus faturadas pelo provedor. É custo de *consumo do provedor*, distinto da **Licença** (que é o vínculo de atribuição a um usuário, já definida acima) — o Custo de Licenças é o valor em R$ cobrado pela Billing Account por essas assinaturas, não o registro de quem está usando a vaga.
_Exceção de `project.id`_: nem toda linha de Custo de Licenças tem `project.id = agentspace-469418`. Assinaturas anuais (SKU tipo `"...Subscription - one year term"`) às vezes são faturadas no nível da Billing Account inteira, com `project.id` nulo — ex: `"Gemini Enterprise Standard"` é assim, enquanto `"Agentspace Enterprise Plus"` tem `project.id` preenchido normalmente. A query inclui explicitamente linhas com `project.id IS NULL` desde que o Serviço esteja em `LICENSE_SERVICES` (ver `queryCostByService` em `backend/src/services/billingService.js`) — decisão registrada, não filtra por engano nem é heurística automática; Custo de API, Infra e Outros Serviços continuam estritamente por `project.id = agentspace-469418`.
_Escopo por projeto_: o card de Licenças na página de Billing tem um seletor de projeto próprio (padrão: "Todos os projetos"), independente do seletor do card de API. Fora do escopo `agentspace-469418`, o Custo de Licenças é levantado agrupando por `project.id` os resultados da mesma query cross-project que também alimenta o Custo de API — uma única query no BigQuery, dividida em memória por Serviço (ver [ADR 0010](docs/adr/0010-custo-gemini-cross-project.md) e [ADR 0011](docs/adr/0011-separacao-custo-licencas-e-api.md)). Linhas sem `project.id` somam ao bucket de `agentspace-469418` nesse seletor, pelo mesmo critério da exceção acima — não existe um projeto "sem dono" à parte.
_Avoid_: Custo Gemini (termo aposentado pela ADR 0011)

**Custo de API** (anteriormente parte do "Custo Gemini" — separado na [ADR 0011](docs/adr/0011-separacao-custo-licencas-e-api.md)):
Subcategoria do Custo do Projeto: soma dos Serviços cujo `service.description` está em `["Vertex AI", "Gemini API"]` (lista `API_SERVICES`, `backend/src/services/billingService.js`) — o consumo de modelo/LLM, cobrado por uso (não por assinatura). `Vertex AI` é a API enterprise subjacente ao Gemini Enterprise/Agentspace; `Gemini API` é um produto GCP diferente (a API "direta" do Gemini, tipo AI Studio, tipicamente usada em projetos de teste/POC) — os dois entram na mesma categoria de domínio porque representam o mesmo tipo de custo (consumo de modelo), ver [ADR 0013](docs/adr/0013-gemini-api-entra-em-custo-de-api.md). Contraparte do Custo de Licenças: mesma origem de dados (Billing Export) e mesma família de produto, mas natureza de custo diferente — por isso vive em card próprio desde a ADR 0011.
_Escopo por projeto_: o card de API na página de Billing tem um seletor de projeto próprio (padrão: "Todos os projetos"), independente do seletor do card de Licenças. Fora do escopo `agentspace-469418`, segue o mesmo mecanismo do Custo de Licenças — mesma query cross-project, dividida em memória por Serviço.
_Avoid_: Custo Gemini (termo aposentado pela ADR 0011)

**Custo de Infra**:
Subcategoria do Custo do Projeto: soma dos Serviços cujo `service.description` está numa lista explícita e nomeada de infraestrutura "clássica" de nuvem — compute, storage, banco, rede, segurança, devops, observabilidade, mensageria (ver a lista completa em `INFRA_SERVICES`, `backend/src/services/billingService.js`). Diferente da definição original (ver [ADR 0009](docs/adr/0009-criterio-de-infra-e-outros-servicos.md)), o critério **não é mais** "o que esta aplicação usa" — é infraestrutura genérica de nuvem, esteja ou não em uso por esta app hoje. Serviços de dados/analytics (ex: `Dataflow`, `Dataproc`, `Looker`) ficam de fora de propósito e caem em Outros Serviços. Contraparte do Custo de Licenças e do Custo de API — juntos, mais Outros Serviços, formam o Custo do Projeto. `BigQuery` é a exceção deliberada da categoria "dados": entra na lista tanto pela natureza recursiva (o próprio custo das queries que a aplicação roda contra o `billing_standard` aparece como Serviço `BigQuery` no dia seguinte) quanto por já ser tratado como infra desde a decisão original.
_Avoid_: Custo GCP ADMIN (nome do app, não da categoria — confunde com o card de UI), custo de aplicação (ambíguo com Custo do Projeto)

**Outros Serviços** (anteriormente "Não Categorizado" — renomeado na [ADR 0009](docs/adr/0009-criterio-de-infra-e-outros-servicos.md)):
Subcategoria do Custo do Projeto: soma dos Serviços cujo `service.description` não está em nenhuma das listas de Custo de Licenças, Custo de API nem Custo de Infra. Existe para garantir que a soma das quatro parcelas sempre feche com o Custo do Projeto — é o alerta natural de que surgiu um serviço novo que precisa ser classificado (agora com menos falsos positivos, já que Custo de Infra cobre infraestrutura genérica, não só o que a app usa).
_Avoid_: "Outros" sozinho (colide com o rótulo de SKU sem descrição, `IFNULL(sku.description, 'Outros')` — usar sempre o nome completo "Outros Serviços"), Não Categorizado (nome anterior, mantido só como referência histórica na ADR 0009)

**Serviço** (`service.description`):
Campo do Billing Export que identifica o produto GCP cobrado (ex: `"Vertex AI"`, `"Cloud Run"`) — é o nível de granularidade usado para classificar cada linha de custo em Custo de Licenças, Custo de API, Custo de Infra ou Outros Serviços (ver `LICENSE_SERVICES`/`API_SERVICES`/`INFRA_SERVICES` em `backend/src/services/billingService.js`). Mais grosso que **SKU**: um Serviço agrupa vários SKUs.
_Avoid_: SKU (é outro campo, mais granular — ver **SKU**)

**SKU** (`sku.description`):
Campo do Billing Export mais granular que **Serviço** — identifica o item de cobrança específico dentro de um Serviço (ex: dentro do Serviço `"Vertex AI Search"`, SKUs distintos por tipo de uso). Cada linha do Billing Export tem exatamente um Serviço e um SKU. Usado no drill-down por card da página de Billing: ao expandir um card de categoria, a lista exibida chega ao nível de SKU, agrupada em dois níveis (Serviço, e dentro de cada um os SKUs dele), preservando a categorização (Licenças/API/Infra/Outros Serviços) que continua sendo feita por Serviço.
_Avoid_: usar "SKU" para o que na verdade é Serviço (confusão histórica deste glossário — corrigida nesta entrada)

**Billing Export (Standard usage cost)**:
Mecanismo do GCP, já habilitado na Billing Account "Projetos Editora Globo", que grava diariamente o custo por SKU de todos os projetos da Billing Account (71 no momento desta decisão) numa tabela do BigQuery: `infra-bi-355620.billing_standard.gcp_billing_export_v1_01779C_55AF20_FD92F6` — o sufixo do nome da tabela é o ID da Billing Account, não de um projeto. É a fonte de dados de toda a página de Billing; consultada diretamente (schema padrão do Google), sem depender das tabelas/views internas de FinOps (`tbCusto*`, `vwResultadoMes*`) que outro time mantém no mesmo dataset. Distinto de **Detailed usage cost** (outro tipo de export, desabilitado, que adicionaria granularidade por recurso individual — não usado por esta feature).
_Avoid_: Billing export genérico (especificar sempre "Standard usage cost" quando a distinção importar), export de faturamento

**Alerta de Custo** (ver [ADR 0012](docs/adr/0012-alerta-de-aumento-de-custo-por-sku.md)):
Aviso exibido na página de Custos quando uma SKU foge do padrão recente de gasto, calculado sobre as quatro subcategorias do Custo do Projeto (Licenças, API, Infra, Outros Serviços) e sempre atribuído a um projeto específico — nunca ao agregado "Todos os projetos" das visões cross-project de Licenças/API. Tem dois subtipos, **Alerta de Aumento do SKU** e **Novo SKU no Billing**; a lista completa vive em `summary.alerts`, recalculada junto do resto do resumo (mesmo cache de 4h do backend) — não existe estado de "visto"/"dispensado", o alerta sempre reflete a situação atual.
_Avoid_: Spike, notificação de custo

**Dia de Referência do Alerta**:
O dia tratado como "hoje" para fins de Alerta de Custo — sempre o dia anterior ao momento da consulta, nunca o dia corrente em andamento, porque o Billing Export só atualiza 1x/dia e o dia corrente estaria com dados incompletos.
_Avoid_: Hoje (ambíguo nesse contexto — em Alerta de Custo, nunca é o dia corrente)

**Alerta de Aumento do SKU**:
Subtipo de Alerta de Custo: dispara quando o custo de uma SKU já existente, no Dia de Referência do Alerta e em um projeto específico, supera ao mesmo tempo dois limiares em relação à média móvel dos 7 dias anteriores (exige um mínimo de 3 dias de histórico pra ser avaliado): +R$300 em valor absoluto E +50% em termos percentuais. Os dois critérios valem juntos — só percentual gera ruído em SKUs pequenas, só absoluto ignora crescimento proporcional relevante em SKUs caras.
_Avoid_: Spike de SKU, pico de custo

**Novo SKU no Billing**:
Subtipo de Alerta de Custo: dispara quando uma SKU tem custo maior que zero no Dia de Referência do Alerta, mas nenhum custo em nenhum dos 7 dias anteriores, no mesmo projeto — tratado à parte do Alerta de Aumento do SKU porque não há média válida pra comparar (divisão por zero), e porque semanticamente é uma cobrança nova, não um aumento.
_Avoid_: SKU nova sozinho sem contexto (ambíguo com "SKU nova esse mês")
