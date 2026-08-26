# Deploy manual para Cloud Run — provisório até o workflow do GitHub Actions ficar pronto.
# Ver docs/deploy-cloud-run-manual.md para o passo a passo completo (primeiro deploy,
# secrets, domínio custom). Este Makefile cobre só o ciclo do dia a dia:
# build -> push -> gcloud run deploy.

PROJECT_ID       ?= agentspace-469418
REGION           ?= us-east4
SA               ?= iam-gemini-logon@agentspace-469418.iam.gserviceaccount.com
AR_REPO          ?= gcp-iam-manager
TAG              ?= $(shell git rev-parse --short HEAD)

BACKEND_SERVICE  ?= gcp-iam-manager-backend
FRONTEND_SERVICE ?= gcp-iam-manager-frontend

BACKEND_IMAGE  := $(REGION)-docker.pkg.dev/$(PROJECT_ID)/$(AR_REPO)/backend:$(TAG)
FRONTEND_IMAGE := $(REGION)-docker.pkg.dev/$(PROJECT_ID)/$(AR_REPO)/frontend:$(TAG)

.DEFAULT_GOAL := help
.PHONY: help auth build-backend push-backend deploy-backend backend \
        build-frontend push-frontend deploy-frontend frontend deploy

help: ## Lista os targets disponíveis
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-18s\033[0m %s\n", $$1, $$2}'

auth: ## Login gcloud + ADC impersonando a SA de deploy (rodar 1x por sessão)
	gcloud auth login
	gcloud auth application-default login --impersonate-service-account=$(SA)

build-backend: ## Builda a imagem do backend (tag = short SHA do git)
	docker build -t $(BACKEND_IMAGE) ./backend

push-backend: ## Push da imagem do backend pro Artifact Registry
	docker push $(BACKEND_IMAGE)

deploy-backend: ## gcloud run deploy do backend com a imagem já pushada
	gcloud run deploy $(BACKEND_SERVICE) \
		--image=$(BACKEND_IMAGE) \
		--region=$(REGION) --project=$(PROJECT_ID) \
		--service-account=$(SA)

backend: build-backend push-backend deploy-backend ## build + push + deploy do backend

build-frontend: ## Builda a imagem do frontend (VITE_GCP_PROJECT_ID embutido no bundle)
	docker build -t $(FRONTEND_IMAGE) \
		--build-arg VITE_GCP_PROJECT_ID=$(PROJECT_ID) \
		./frontend

push-frontend: ## Push da imagem do frontend pro Artifact Registry
	docker push $(FRONTEND_IMAGE)

deploy-frontend: ## gcloud run deploy do frontend com a imagem já pushada
	gcloud run deploy $(FRONTEND_SERVICE) \
		--image=$(FRONTEND_IMAGE) \
		--region=$(REGION) --project=$(PROJECT_ID) \
		--service-account=$(SA)

frontend: build-frontend push-frontend deploy-frontend ## build + push + deploy do frontend

deploy: backend frontend ## Deploy completo (backend + frontend), nessa ordem
