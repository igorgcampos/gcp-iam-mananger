# Diretoria do Usuário lida do Entra ID, sem banco próprio

O pedido original era um campo "Diretoria" digitável por Usuário na tela Gemini Enterprise, para viabilizar o Rateio por Diretoria (ver `CONTEXT.md`). Hoje, quem faz o rateio baixa a lista de usuários e consulta cada um no AD — ou seja, o AD já é a fonte de verdade da Diretoria. Decidimos **ler a Diretoria do Entra ID via Microsoft Graph** (`onPremisesExtensionAttributes.extensionAttribute4`, `GET /users/{email}` em `$batch` de 20) usando o mesmo App Registration e o mesmo token de aplicação do SSO (`getGraphAppToken`, ver ADR 0005), em vez de guardar um valor editado no painel. A aplicação continua sem banco de dados.

A validação em 24/11/2026, sobre os 100 Usuários com Licença: 100/100 encontrados no Entra (inclusive `@valor.com.br` e `@oglobo.com.br` — mesmo tenant), 94/100 com `extensionAttribute4` preenchido; os 6 sem valor são contas de terceiros (`.rpa`, `.ciee`, `.nscode`).

## Considered Options

- **Campo digitado no painel, persistido numa instância Cloud SQL já existente** (rascunho anterior desta ADR, nunca implementado): descartada — seria o primeiro estado próprio da aplicação (driver SQL, conexão cross-project, migração, segredo de banco) para guardar um dado que já existe no AD; exigiria um Operador digitar ~100 valores consultando o próprio AD (cold start) e mantê-los em sincronia a cada usuário novo ou mudança de área.
- **AD com override manual no painel**: descartada para a v1 — resolve "o AD está errado", mas paga todo o custo de infraestrutura da opção acima. Pode virar incremento futuro se valores errados no AD se mostrarem frequentes na prática.
- **Atributo customizado do Google Workspace (Admin SDK custom schema)**: descartada — exigiria domain-wide delegation e escopo `admin.directory.user` que a Service Account não tem (ver ADR 0007), além de alguém manter o valor lá.
- **Atributo `department` do Entra**: descartado — na EdGlobo ele guarda um código numérico de centro de custo (ex.: `1142225000`), não o nome da Diretoria. `companyName` também é numérico.
- **Enriquecer a resposta de `/api/gemini` com a Diretoria a cada carga**: descartada — acoplaria a tela de Licenças à disponibilidade e à latência do Graph (mesmo racional da ADR 0005 para não chamar o Graph a cada requisição). A Diretoria vem de um endpoint separado, carregado depois da tabela, com cache em memória por instância.

## Consequences

- O App Registration do SSO passou a precisar de `User.Read.All` (Application, com admin consent — concedido em 24/11/2026) além de `User.ReadBasic.All` + `GroupMember.Read.All`. `User.ReadBasic.All` não expõe `onPremisesExtensionAttributes`; sem `User.Read.All` o Graph não dá erro, só devolve o campo como `null`.
- A Diretoria é somente leitura no painel: um valor errado ou ausente se corrige no AD, pelo time de AD/RH, não por um Operador.
- O AD tem grafias inconsistentes para a mesma Diretoria ("Audiencia" × "AUDIÊNCIA"); o agrupamento compara sem maiúsculas/acentos e exibe a grafia mais frequente. Diferenças de nome real ("AUDIÊNCIA ASSINATURAS") não são unificadas — fazê-lo exigiria uma tabela de equivalências mantida no painel, reintroduzindo o estado que esta decisão evita.
- Se o Graph estiver indisponível, só a coluna/card de Diretoria degrada ("—"); o resto da tela Gemini Enterprise funciona normalmente.
