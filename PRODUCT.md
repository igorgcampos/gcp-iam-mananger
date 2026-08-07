# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Usuário primário: membros do time DevSecOps da Editora Globo que pertencem ao grupo do AD `devsecops-gcp-admin` — é o único público, confirmado pelo próprio gate de acesso (login via SSO Microsoft Entra ID, autorizado uma única vez por login checando pertencimento a esse grupo). Não há tiers entre eles: pertencer ao grupo já concede acesso total ao painel (ver **Operador** em CONTEXT.md).

Job a ser feito: administrar, sem abrir o console do GCP, (1) quem tem acesso ao Agentspace via papel IAM `discoveryengine.user` e Papéis Complementares (hoje: Code Assist), (2) quem possui licença Gemini Enterprise (tiers: Gemini Enterprise Standard, Agentspace Enterprise Plus), e (3) acompanhar o custo do projeto `agentspace-469418` na Billing Account "Projetos Editora Globo".

## Product Purpose

Eliminar a necessidade de usar o Cloud Console do GCP para as operações administrativas recorrentes de acesso e licenciamento do Agentspace/Gemini Enterprise, tornando essas operações mais seguras (validação de principal antes de conceder, sem chave estática de credencial) e mais rápidas que o console genérico. Sucesso = o time DevSecOps consegue conceder/revogar acesso, atribuir/remover licença, identificar usuários inativos e visualizar o custo do projeto inteiramente pelo painel, sem precisar de comandos `gcloud` manuais ou navegação no console.

## Positioning

O console do GCP é poderoso e arriscado demais para esta operação estreita e recorrente. O painel restringe a superfície a exatamente as ações necessárias — conceder/revogar IAM, atribuir/remover Licença, consultar Custo — e adiciona garantias que o console não dá de graça: Validação de Principal (via custom role probe descartável) antes de qualquer concessão, autenticação sempre via ADC/impersonation ou identidade anexada ao serviço (nunca chave JSON estática, em dev ou produção — ver ADR 0007), e acoplamento explícito entre remoção de Licença e revogação do papel IAM correspondente (uma única operação administrativa, não duas a lembrar).

## Operating Context

- **Telas:** Dashboard, IAM (Discovery Engine User + Papéis Complementares), Gemini Enterprise (licenças), Custos (Billing), Relatório de Usuários Inativos.
- **Autenticação:** SSO via Microsoft Entra ID (Azure AD); sem acesso anônimo a `/api/iam` e `/api/gemini`; grupo autorizado checado uma vez por login via Microsoft Graph (ADR 0005).
- **Atualização de dados:** IAM e Licenças fazem polling automático a cada 3 minutos + refresh manual, sempre sem cache (dado pode mudar a qualquer momento, custo de buscar é baixo). Custos usa cache em memória de 4 horas porque a fonte (BigQuery Billing Export) só atualiza 1x/dia — refresh manual só dispara nova consulta quando o cache expirou.
- **Fonte de custo:** consulta direta à tabela do BigQuery Billing Export Standard usage cost (`infra-bi-355620.billing_standard.gcp_billing_export_v1_01779C_55AF20_FD92F6`), projeto diferente do que hospeda a aplicação — não a Cloud Billing API (ADR 0006).
- **Identidade:** depende de Identidade Sincronizada (Entra → Cloud Identity) já existir para que um email seja um principal válido no IAM do GCP; quando não existe, a concessão é bloqueada e o email precisa ser encaminhado ao time de AD.
- **Deploy:** produção roda em Cloud Run com a service account anexada diretamente ao serviço (mesma identidade usada em dev via impersonation).

## Capabilities and Constraints

- Frontend React (Vite) + Ant Design (antd); backend Node.js.
- Zero chave estática de service account, em qualquer ambiente (ADR 0007) — toda autenticação com o GCP é via ADC (impersonation em dev, SA anexada em produção).
- Toda concessão de Papel Complementar passa por Validação de Principal antes de acontecer.
- Remoção de Licença acopla (unidirecionalmente) a revogação do papel IAM `discoveryengine.user`; o inverso não é verdadeiro.
- Terminologia de domínio é fixa e documentada em `CONTEXT.md` (Licença, Atribuição, Data de Referência, Papel Complementar, Custo Gemini/Infra/Não Categorizado, etc.) — UI e código devem usar os mesmos termos, não sinônimos.
- Custo do Projeto sempre fecha como `Custo Gemini + Custo de Infra + Não Categorizado`, sem resto escondido; algumas linhas de Custo Gemini (assinaturas anuais faturadas na Billing Account) não carregam `project.id` e são incluídas mesmo assim, por decisão explícita, não heurística.

## Brand Commitments

- Idioma da interface e da documentação: português (pt-BR).
- Nome observado em mais de um lugar sem confirmação de qual é o canônico: título do README é "EdGlobo GCP Admin"; título do CONTEXT.md é "GCP IAM Manager"; `package.json` usa `ed-globo-gcp-admin`. Não inferido — registrar aqui como decisão em aberto até o usuário escolher um nome único.

## Evidence on Hand

Nenhuma evidência de marketing (depoimento, case, prova social) existe nem é aplicável — ferramenta interna, não voltada a persuasão. Trabalho futuro não deve fabricar nenhuma.

## Product Principles

1. O Cloud Console do GCP nunca deve ser necessário para o uso do dia a dia — toda ação administrativa recorrente de IAM/Licença/Custo precisa estar coberta pelo painel.
2. Nenhuma concessão de acesso acontece sem Validação de Principal antes — nunca criar um binding "cego" para um email não sincronizado.
3. Nenhuma chave estática de credencial, em nenhum ambiente — sempre ADC/impersonation ou identidade anexada ao serviço.
4. O vocabulário de domínio definido em `CONTEXT.md` é normativo — UI, código e comunicação usam os mesmos termos, nunca sinônimos ambíguos (ex: "Remoção de Licença" nunca "remover usuário").
5. Acesso ao painel é binário e único: pertencer ao grupo do AD `devsecops-gcp-admin` concede acesso total; não há tiers de Operador a projetar na interface.

## Accessibility & Inclusion

Nenhum requisito formal de acessibilidade foi definido até hoje — confirmado com o usuário. Ferramenta interna de uso restrito ao time DevSecOps, sem necessidade específica conhecida no momento.
