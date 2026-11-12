# Fase 0 — tarefas visíveis: vínculo, espera, recados, chave curta e lembrete

Status: Implemented (fase 0 do plano "tarefas visíveis, controláveis e que não se perdem")
Data: 2026-11-12
Complementa: `2026-11-12-pausa-por-pista-e-adiamento-liberavel-design.md` (item 1).

## Problema (medido numa instalação real, 14 dias)

- 0% das mensagens do agente no transcript diziam de qual issue vinham; `GetIssueDetail.routedMessages` era sempre vazio. Mais da metade do que as pessoas escrevem num grupo é resposta citada a uma mensagem do agente.
- Uma issue retida dias por uma janela de limite do provedor aparecia como `WORKING` comum.
- Um steer só tinha "enviado" e "turno terminou", com mediana de 23 min e p90 de 3 h entre os dois. Ninguém sabia se ele estava na fila ou sendo trabalhado.
- Chaves eram um slug dos 40 primeiros caracteres do objetivo, longas e impossíveis de dizer de volta no chat. O título era o objetivo truncado, que costuma começar com quem pediu e quando.
- ~75 issues por semana terminavam um turno em prosa (tipicamente pedindo um ok) sem declarar nada. A varredura estacionava todas com o mesmo texto: issue saudável esperando ok e issue morta no meio ficavam iguais.

## Decisões

### Item 2 — "esperando cota até" na issue
- `GetIssuesOverview` e `GetIssueDetail` expõem `waitingForProviderUntil` (ISO), **lido** do item adiado na fila (`issue/utils/providerWaitByIssue`): runnable, lease futuro, sem holder. Nunca gravado — some sozinho quando o adiamento é liberado.
- Edge `issue → agent` declarado em `issue/context.ts` (leitura de `agent_mailbox` só para exibir).
- Console: selo com dia **e** hora (a janela pode ser semanal).

### Item 3 — vínculo mensagem↔issue
- `integration.orchestrator.replied` já tinha `issueId` no contrato; agora ele é preenchido quando o turno compõe um `ISSUE_RESULT` (o payload do resultado passa a carregar `issueId`) e gravado pelo `RecordOrchestratorReply`.
- Anexos enviados por uma issue (`SendArtifact` → `DeliverChannelAttachment`), avisos de stop (`RaiseStop`) e mensagens diretas de uma issue (`SendDirectMessage`, pela identidade da execução) gravam a issue.
- Mensagem recebida que cita uma mensagem de issue herda o `issueId` e é classificada `REPLY_QUOTE` (`IngestChannelMessage`). Só registra — rotear é a fase 2.

### Item 3b — enviado / entregue / lido
- `agent_mailbox.first_claimed_at` (migração 0032): gravado pelo **primeiro** claim (`COALESCE`), um retry não move. `consumed_at` é o "lido".
- `GetIssueDetail.steers` + lista "Orientações enviadas" no detalhe.

### Item 4 — chave curta e título
- Chave `<PREFIXO>-<n>`. O número vem de `agent_issue_sequences` (migração 0033), por **workspace**, sorteado na mesma transação do fork (`IssueSequenceRepository`). Dois grupos no mesmo repositório compartilham a numeração. Chaves antigas (slug) continuam válidas; as novas não colidem com elas.
- Prefixo derivado da pasta do workspace (`workspace/objects/IssuePrefix`): uma palavra → 3 primeiras letras; várias → iniciais menos a última + 2 letras da última. Derivado, não gravado; um prefixo customizado seria um campo declarado futuro.
- `ForkIssue` aceita `title` opcional (≤ 80). O prompt do orquestrador pede o título e o uso da chave ao falar de uma issue. `DeclareIssueOpen` usa a mesma chave.

### Item 5 — lembrete antes da parada
- `ReconcileStalledIssues`: issue `WORKING` sem nada em voo cujo **último turno rodou** e não declarou nada recebe **um** steer silencioso (`declarationReminder: true`, postura AUTO) pedindo para declarar (concluí / decisão ou aprovação / uma pergunta). `dedupKey` = o item que se calou.
- Se o último turno **já foi** o lembrete, a varredura estaciona a issue com `DETAIL_AFTER_REMINDER` ("nem depois do lembrete"). Empate de `consumed_at` vai para o lembrete (ele sempre vem depois).
- Issue que nunca teve turno não recebe lembrete (não há sessão), segue como antes.
- O turno do lembrete não enfileira `ISSUE_RESULT` (`RunIssueTurn`): nada vai ao grupo.
- Por que no reconciliador e não no fim do turno: o turno não sabe se houve declaração (ela chega por ferramenta MCP, fora do fluxo), e a primeira versão no `RunIssueTurn` mudava o fluxo de turnos que 29 testes de fluxo cobrem.

## Testes
- `ProviderWait.test.ts`: espera na lista e no detalhe; adiamento liberado some; ciclo enviado→entregue→lido com retry.
- `DeliverOrchestratorReply.test.ts`, `IngestChannelMessage.test.ts`, `SendDirectMessage.test.ts`: `issueId` gravado; citação herda; citação de conversa não herda.
- `ReconcileStalledIssues.test.ts`: lembrete uma vez, parada depois do lembrete ignorado.
- `RunIssueTurn.test.ts`: turno do lembrete sem resultado.
- `ForkIssue.test.ts`, `IssuePrefix.test.ts`: chave curta por workspace entre grupos; título curto.
