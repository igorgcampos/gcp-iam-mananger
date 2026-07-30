# Remoção de Licença também revoga o acesso IAM

Hoje a Remoção de Licença (ver `CONTEXT.md`) só chama a API do Discovery Engine — o papel IAM `discoveryengine.user` do usuário continua concedido mesmo sem Licença. Decidimos que `geminiService.removeLicense` passa a chamar `iamService.removeUser` **antes** de remover a Licença: se a revogação do IAM falhar por um motivo real (diferente de "role/binding inexistente", que já é o caso comum de usuários sem esse papel), a Licença **não** é removida — evitando o estado inconsistente "sem Licença, mas ainda com acesso IAM". Se o usuário simplesmente não tiver o papel IAM, isso é tratado como sucesso e a remoção da Licença prossegue normalmente. O acoplamento é unidirecional: remover o papel IAM pela tela de IAM não remove a Licença Gemini.

## Considered Options

- **Licença primeiro, IAM depois (best-effort)**: descartada — deixaria a Licença já removida mesmo que a revogação do IAM falhasse, exigindo reconciliação manual depois.
- **Acoplamento nos dois sentidos** (remover no IAM também remove a Licença): descartada — a tela de IAM é usada para outros fins administrativos não necessariamente ligados a licenciamento; acoplar nos dois sentidos criaria efeito colateral surpreendente lá.
- **Orquestração no frontend** (duas chamadas HTTP sequenciais do client): descartada — duplicaria a lógica de erro/atomicidade no cliente; as duas telas que removem usuário já compartilham a mesma função `handleRemove`, então o backend é o único lugar onde a regra precisa existir.

## Consequences

- `geminiService.js` passa a depender de `iamService.js` — antes eram módulos independentes.
- A Remoção de Licença agora faz até três chamadas de API do GCP em sequência (`getIamPolicy`, `setIamPolicy`, `batchUpdateUserLicenses`) em vez de uma; uma falha no IAM impede a remoção da Licença mesmo que o Discovery Engine estivesse disponível.
- Erros de IAM durante a Remoção de Licença agora aparecem para o administrador com mensagem específica mencionando IAM, não mais a mensagem genérica de "erro ao remover".
