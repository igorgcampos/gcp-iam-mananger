# Code Assist é um Papel Complementar acoplado ao discoveryengine.user

Adicionamos o Code Assist (ver `CONTEXT.md`) como o primeiro Papel Complementar gerenciável na tela "IAM — Discovery Engine User". Decidimos acoplá-lo ao `discoveryengine.user` em vez de tratá-lo como uma role independente: ele só pode ser concedido a um usuário que já tem `discoveryengine.user` (via checkbox no modal de adicionar, ou via ação na linha da tabela para usuários existentes), e revogar o `discoveryengine.user` pelo botão "Remover" revoga também o Code Assist — mesmo padrão de cascata do ADR 0003, com erro real de revogação bloqueando a operação inteira e um 404 (usuário sem o Papel Complementar) sendo tratado como sucesso. Também decidimos reaproveitar a mesma Validação de Principal (probe descartável) usada para o `discoveryengine.user`, apesar do Code Assist usar um tipo de binding diferente (`user:<email>`, membro direto do Cloud Identity) em vez do principal do Workforce Pool (`principal://...`) — os dois tipos de binding dependem da mesma Identidade Sincronizada, e o probe já testa exatamente o formato `user:<email>` que o Code Assist usa.

## Considered Options

- **Code Assist como role totalmente independente** (gerenciável mesmo sem `discoveryengine.user`): descartada — nesta ferramenta, Code Assist não tem propósito próprio fora do contexto de Discovery Engine; tratá-lo como independente criaria um fluxo de gestão paralelo (listagem, adição, remoção) sem necessidade real hoje.
- **Revogação não-automática do Code Assist ao remover discoveryengine.user**: descartada — deixaria Code Assist órfão sempre que um admin usasse o botão "Remover" existente sem saber que precisa revogar o Papel Complementar separadamente, repetindo o problema que o ADR 0003 já resolveu para a Licença Gemini.
- **Pular a Validação de Principal para o Code Assist** (conceder direto, sem probe): descartada — o binding falharia silenciosamente (ou com erro genérico do GCP) para emails ainda não sincronizados, perdendo a mensagem amigável já existente para esse caso.

## Consequences

- `iamService.js` ganha um segundo par de funções dedicadas (`addCodeAssistUser`/`removeCodeAssistUser`), com sua própria constante de role e formato de membro, em vez de generalizar `addUser`/`removeUser` para múltiplas roles — mantém o estilo atual do código mas significa que uma terceira role futura provavelmente pede uma revisão dessa decisão.
- `removeUser` (chamado pelo botão "Remover") passa a fazer uma chamada adicional ao GCP para revogar o Code Assist antes de revogar o `discoveryengine.user`, na mesma linha do que `removeLicense` já faz para o IAM.
- Uma falha ao conceder o Code Assist durante o "Adicionar ao IAM" (com o checkbox marcado) não desfaz o `discoveryengine.user` já concedido — o admin vê os dois resultados separadamente e pode tentar o Code Assist de novo pela ação na linha, sem precisar remover e readicionar o usuário inteiro.
