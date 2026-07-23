# Validação de Principal via probe descartável na policy real

Antes de conceder `roles/discoveryengine.user` a um email, o backend precisa saber se esse email já tem Identidade Sincronizada (ver `CONTEXT.md`) — sem isso, o binding do Workforce Pool é criado mas nunca concede acesso de fato, e hoje o administrador só descobre isso testando manualmente no console do GCP.

A alternativa mais direta — consultar o diretório do Cloud Identity/Workspace via Admin SDK Directory API ou People API — exige Domain-Wide Delegation, autorizada por um Super Admin do `admin.google.com`. O administrador deste projeto tem controle total do lado do GCP (IAM, projetos, APIs), mas nenhum acesso ao `admin.google.com`, e não há expectativa de conseguir esse acesso. Essa rota foi descartada.

Decidimos, em vez disso, reproduzir a própria checagem que o console do GCP faz: tentar gravar um binding de teste com o principal na forma `user:<email>` numa **custom role dedicada e sem poder real** (`iamValidationProbe`, permissão única `resourcemanager.projects.get`, distinta da role de produção `discoveryengine.user`), e observar se a API do Resource Manager aceita ou rejeita o principal. O binding de teste é removido em seguida; como rede de segurança contra falha da remoção (rede, timeout etc.), ele carrega uma IAM Condition com expiração automática (~5 minutos). A custom role em si é auto-provisionada pelo backend na primeira vez que for necessária (idempotente), consistente com a proposta do app de administrar o projeto sem depender de setup manual fora dele.

O backend diferencia dois motivos de falha do probe: principal inexistente (mostra "não sincronizado, fale com o AD") vs qualquer outro erro técnico (mensagem genérica de falha, sem envolver o time de AD). Do lado da UI, a validação é transparente — o botão "Adicionar" já dispara validação + concessão em uma única chamada, sem passo extra visível.

## Considered Options

- **Admin SDK Directory API / People API com Domain-Wide Delegation**: descartada — exige Super Admin do Workspace, que o administrador não tem.
- **Fluxo semi-manual** (app abre a tela do console pré-preenchida, admin confirma visualmente): descartada — não elimina o trabalho manual que a funcionalidade existe para remover.
- **Probe reaproveitando a própria role `discoveryengine.user`** (sem role dedicada): descartada — mistura o resultado do teste com a concessão real, deixando o sistema em estado ambíguo se uma falha ocorrer entre as duas etapas.

## Consequences

- Cada tentativa de adicionar um usuário gera uma escrita adicional (e possivelmente duas) na IAM policy do projeto — mais entradas no audit log do que uma concessão simples geraria.
- Se o projeto GCP for recriado ou a funcionalidade for portada para outro projeto, a service account precisa da role `roles/iam.roleAdmin` (além do que já tinha) para que o auto-provisionamento da custom role funcione.
