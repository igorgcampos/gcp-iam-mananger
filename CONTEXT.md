# GCP IAM Manager

Painel web que permite administrar, sem usar o console do GCP diretamente, quem tem acesso ao Agentspace (via papel IAM) e quem possui licença Gemini Enterprise.

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

### Provisionamento de Identidade (Entra → Cloud Identity)

**Identidade Sincronizada**:
Um objeto de usuário provisionado no diretório do Cloud Identity/Workspace da organização, originado do Entra ID (AD) por um conector de provisionamento administrado pelo time de AD. É pré-requisito para que um email seja resolvível como principal no IAM do GCP — sem ela, o binding do Workforce Pool é criado mas nunca concede acesso de fato.
_Avoid_: Usuário sincronizado (é o objeto no diretório, não a pessoa), conta do AD, usuário do Entra

**Validação de Principal**:
A checagem que confirma se um email já possui Identidade Sincronizada, feita antes de conceder a role `discoveryengine.user`. Se válida, a concessão prossegue; se inválida, a concessão é bloqueada e o email precisa ser encaminhado ao time de AD para ser incluído no grupo de sincronização.
_Avoid_: Validar email (é o principal que é validado, não o formato do email)
