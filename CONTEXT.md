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
