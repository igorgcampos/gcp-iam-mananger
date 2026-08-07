# Deploy manual no Cloud Run — primeiro deploy

Passo a passo para o primeiro deploy manual do painel (backend + frontend) como dois serviços Cloud Run independentes. Depois deste primeiro deploy, os próximos ficam a cargo de um workflow de CI/CD no GitHub Actions (fora do escopo deste documento).

Pré-requisitos de arquitetura já decididos e documentados: [ADR 0007](adr/0007-adc-e-secret-manager-para-credenciais.md) (ADC sem chave estática, Secret Manager para os segredos reais) e a seção [Docker](../README.md#docker) do README (containers, nginx reverse-proxy, dois serviços Cloud Run). Este documento não reabre essas decisões — só executa o deploy.

## Variáveis usadas neste guia

```bash
export PROJECT_ID=agentspace-469418
export REGION=us-east4
export SA=SEU_SA@agentspace-469418.iam.gserviceaccount.com   # mesma SA já usada em dev
export AR_REPO=gcp-iam-manager

gcloud config set project $PROJECT_ID
```

Pré-requisito de quem roda estes comandos: sua conta precisa de `roles/run.admin`, `roles/artifactregistry.writer` e `roles/iam.serviceAccountUser` sobre a SA (essa última é o que permite anexar a SA a um serviço Cloud Run via `--service-account`).

---

## 1. Habilitar as APIs necessárias

Além da IAM API e Discovery Engine API (já habilitadas conforme o README):

```bash
gcloud services enable \
  artifactregistry.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com \
  --project=$PROJECT_ID
```

---

## 2. Artifact Registry — criar o repositório de imagens

Um repositório Docker só, guardando as duas imagens (`backend` e `frontend`):

```bash
gcloud artifacts repositories create $AR_REPO \
  --repository-format=docker \
  --location=$REGION \
  --project=$PROJECT_ID \
  --description="Imagens do painel GCP IAM Manager (backend/frontend)"

# Autentica o docker CLI local contra esse registry
gcloud auth configure-docker $REGION-docker.pkg.dev
```

---

## 3. Secret Manager — confirmar acesso da SA

Os secrets já existem no Secret Manager do projeto (criados manualmente no Console), com nome igual ao nome da env var — **não** há sufixo `-dev`/`-prod`; hoje é um único valor de cada, compartilhado entre dev e produção (débito técnico registrado no [ADR 0007](adr/0007-adc-e-secret-manager-para-credenciais.md#atualização-primeiro-deploy) e em [`sso-pedidos-time-ad.md`](sso-pedidos-time-ad.md)):

- `GCP_PROJECT_ID`
- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_ALLOWED_GROUP_ID`
- `AZURE_CLIENT_SECRET` — só este e o próximo são segredos de verdade (credenciais)
- `SESSION_JWT_SECRET`

Só falta garantir que a SA consegue ler todos eles (comando idempotente — pode rodar de novo sem problema mesmo se o binding já existir):

```bash
for secret in GCP_PROJECT_ID AZURE_TENANT_ID AZURE_CLIENT_ID AZURE_ALLOWED_GROUP_ID AZURE_CLIENT_SECRET SESSION_JWT_SECRET; do
  gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:$SA" \
    --role="roles/secretmanager.secretAccessor" \
    --project=$PROJECT_ID
done
```

> `BILLING_EXPORT_TABLE` e `FRONTEND_BASE_URL` **não** são secrets — não são sensíveis, e vão via `--set-env-vars` no deploy (passo 5). `FRONTEND_BASE_URL` em especial muda logo depois do deploy do frontend (passo 7); mantê-lo como secret exigiria criar uma versão nova a cada atualização, mais trabalho que `gcloud run services update`.

---

## 4. Build e push das imagens

```bash
# Backend
docker build -t $REGION-docker.pkg.dev/$PROJECT_ID/$AR_REPO/backend:v1 ./backend
docker push $REGION-docker.pkg.dev/$PROJECT_ID/$AR_REPO/backend:v1

# Frontend — VITE_GCP_PROJECT_ID é embutido no bundle estático em build-time
docker build -t $REGION-docker.pkg.dev/$PROJECT_ID/$AR_REPO/frontend:v1 \
  --build-arg VITE_GCP_PROJECT_ID=$PROJECT_ID \
  ./frontend
docker push $REGION-docker.pkg.dev/$PROJECT_ID/$AR_REPO/frontend:v1
```

> Tag `v1` só para este primeiro deploy — nos próximos, use algo rastreável (`v2`, ou o SHA curto do commit, que é provavelmente o que o CI/CD vai fazer).

---

## 5. Deploy do backend (primeira vez)

Backend e frontend têm uma dependência circular de URL (o backend precisa da URL do frontend para `FRONTEND_BASE_URL`; o frontend precisa da URL do backend para `BACKEND_URL`) — resolve-se fazendo o backend primeiro com um placeholder, corrigido no passo 7.

**Sobre `--allow-unauthenticated`:** o frontend fala com o backend via reverse proxy do nginx (`proxy_pass`), sem anexar nenhum token de identidade do Google — então o backend precisa aceitar tráfego não autenticado a nível de rede/Cloud Run. A proteção real das rotas `/api/*` continua sendo o `requireAuth` (cookie de sessão SSO) já implementado no código — isso não muda com o Cloud Run.

```bash
gcloud run deploy gcp-iam-manager-backend \
  --image=$REGION-docker.pkg.dev/$PROJECT_ID/$AR_REPO/backend:v1 \
  --region=$REGION \
  --project=$PROJECT_ID \
  --service-account=$SA \
  --allow-unauthenticated \
  --set-env-vars="BILLING_EXPORT_TABLE=infra-bi-355620.billing_standard.gcp_billing_export_v1_01779C_55AF20_FD92F6,FRONTEND_BASE_URL=https://PLACEHOLDER-ATUALIZAR-NO-PASSO-7" \
  --update-secrets="GCP_PROJECT_ID=GCP_PROJECT_ID:latest,AZURE_TENANT_ID=AZURE_TENANT_ID:latest,AZURE_CLIENT_ID=AZURE_CLIENT_ID:latest,AZURE_ALLOWED_GROUP_ID=AZURE_ALLOWED_GROUP_ID:latest,AZURE_CLIENT_SECRET=AZURE_CLIENT_SECRET:latest,SESSION_JWT_SECRET=SESSION_JWT_SECRET:latest"
```

Não defina `PORT` — o Cloud Run injeta essa variável sozinho, e `index.js` já lê `process.env.PORT` com fallback.

Capture a URL gerada:

```bash
BACKEND_URL=$(gcloud run services describe gcp-iam-manager-backend \
  --region=$REGION --project=$PROJECT_ID --format='value(status.url)')
echo $BACKEND_URL
```

---

## 6. Deploy do frontend

```bash
gcloud run deploy gcp-iam-manager-frontend \
  --image=$REGION-docker.pkg.dev/$PROJECT_ID/$AR_REPO/frontend:v1 \
  --region=$REGION \
  --project=$PROJECT_ID \
  --service-account=$SA \
  --allow-unauthenticated \
  --set-env-vars="BACKEND_URL=$BACKEND_URL"
```

> **Sobre a SA no frontend:** o container do frontend é só nginx servindo estáticos + fazendo proxy — nunca chama nenhuma API do Google, então tecnicamente não precisa de nenhuma das permissões dessa SA. Reaproveitar a mesma SA em ambos, por simplicidade operacional, é mais permissão do que o frontend estritamente precisa; se um dia quiser apertar isso, o certo seria uma SA nova, sem nenhuma role, só para ele.

Capture a URL do frontend:

```bash
FRONTEND_URL=$(gcloud run services describe gcp-iam-manager-frontend \
  --region=$REGION --project=$PROJECT_ID --format='value(status.url)')
echo $FRONTEND_URL
```

---

## 7. Corrigir o `FRONTEND_BASE_URL` do backend

```bash
gcloud run services update gcp-iam-manager-backend \
  --region=$REGION --project=$PROJECT_ID \
  --update-env-vars="FRONTEND_BASE_URL=$FRONTEND_URL"
```

---

## 8. Cadastrar o Redirect URI no Entra ID

O [`docs/sso-pedidos-time-ad.md`](sso-pedidos-time-ad.md) já tem `https://gcp-admin.edglobo.com.br/auth/callback` cadastrado como URI de produção (assumindo o domínio customizado mapeado — passo 9). Enquanto o domínio não estiver mapeado, o painel só responde no `$FRONTEND_URL` efêmero do Cloud Run — então **cadastre também `$FRONTEND_URL/auth/callback`** como Redirect URI adicional no App Registration (Entra ID → seu app → Authentication → Redirect URIs), só para este teste inicial. Sem isso, `/auth/callback` falha com `AADSTS50011` (documentado no Troubleshooting do README).

---

## 9. (Recomendado) Mapear o domínio customizado

Para não depender da URL efêmera do Cloud Run e bater com o que já está cadastrado no Entra ID:

```bash
gcloud run domain-mappings create \
  --service=gcp-iam-manager-frontend \
  --domain=gcp-admin.edglobo.com.br \
  --region=$REGION --project=$PROJECT_ID
```

Isso devolve um registro DNS (CNAME ou A/AAAA, dependendo da região) para cadastrar no provedor de DNS da EdGlobo. Depois de propagar, repita o passo 7 com `FRONTEND_BASE_URL=https://gcp-admin.edglobo.com.br` e remova o Redirect URI temporário do `$FRONTEND_URL` no Entra ID.

---

## 10. Verificar

```bash
curl -s $BACKEND_URL/api/health
# esperado: {"status":"ok"}
```

Abra `$FRONTEND_URL` (ou o domínio, se já mapeado) no navegador e teste o login "Entrar com Microsoft" de ponta a ponta.

---

## Próximos deploys

Para atualizar uma versão depois (antes do CI/CD existir): repita o passo 4 com uma tag nova (`:v2`) e rode `gcloud run deploy` de novo apontando para a imagem nova — não precisa repetir `--update-secrets`/`--set-env-vars` se não mudou nada nisso, o Cloud Run mantém a config da revisão anterior.

## CI/CD (fora de escopo aqui)

Quando o GitHub Actions entrar em cena, ele vai precisar de uma identidade para publicar no Artifact Registry e fazer `gcloud run deploy` sem chave estática também — Workload Identity Federation é o caminho recomendado, mesmo espírito do [ADR 0007](adr/0007-adc-e-secret-manager-para-credenciais.md).
