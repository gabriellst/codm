# Issue presa em WORKING — Design Spec

**Date:** 2026-08-26
**Status:** Approved
**Bounded Context:** cross-context: `agent`, `issue`, `thread`
**Kind:** bug
**Story Points:** 8 — toca três bounded contexts, adiciona um handler externo e um job repetível novos, e fecha uma transição faltante no write-model; sem migração (o `CHECK` de `issue_issues.status` já aceita `NEEDS_INPUT`) e sem contrato novo.

## Context

Uma issue nasce em `WORKING` (`issue/usecases/OpenIssue.ts:56`) e a única forma de sair de lá é o agente **declarar** o desfecho. A declaração chega pela ferramenta MCP `TransitionIssueStatus`, atendida por `agent/usecases/DeclareIssueComplete.ts`, e o prompt do worker instrui explicitamente sobre ela (`agent/agents/IssueWorkAgent/prompt.ts:123`): *terminei* → `TransitionIssueStatus`; *travei* → `RaiseStop`; *preciso de uma resposta* → `AskOperator`.

Do lado do write-model, quem escuta os fatos de execução é `issue/handlers/MaterializeIssueFromExecution.ts`, que materializa três eventos — `IssueCreated`, `IssueOpened`, `IssueCompleted`. O quarto fato, o stop, saiu desse handler em B4 e vive hoje em `thread/handlers/RecordStopFromExecution.ts`, porque desde aquela decisão **um Stop é filho do agregado `Thread`** (o contrato `integration.thread.stop_raised` diz isso no próprio `@doc`: *"renamed from integration.issue.stop_raised in B4: the Stop is a child of the THREAD aggregate"*). Esse handler chama `thread/usecases/RaiseStop.ts`, que grava a linha via `LibSqlThreadRepository.save`.

A exclusão "um run por issue" não mora na issue: é o lease por alvo do `agent/services/MailboxDispatcher/LibSqlMailboxDispatcher.ts` (`LEASE_MS` de 10 min, renovado por heartbeat a cada terço), e `MailboxRepository.claimNext` recusa um alvo que já tenha lease vivo. Ou seja: **o sistema já sabe, com precisão e sem heurística, se existe alguém trabalhando numa issue** — a informação está em `agent_mailbox` (`consumed_at IS NULL AND dead_at IS NULL AND lease_until >= now`), só nunca é confrontada com o `status` da issue.

O caso que originou esta spec: a issue `criar-uma-demo-do-onboarding-e-enviar-aq` (26/08). O primeiro turno declarou `COMPLETED` às 17:43:44 e entregou. Um steer às 17:45:12 reabriu a issue, e o segundo turno encerrou às 17:55:31 com `end_turn` limpo e a frase *"A execução ainda está em andamento. Encerro aqui e volto com o veredito assim que ela fechar."* — sem chamar nenhuma das três ferramentas. A issue seguiu marcada `WORKING` por 1h22 sem processo vivo, e duas tentativas explícitas do operador de tirá-la de lá (19:19 e 19:22) reportaram sucesso e não mudaram nada.

## Problem

1. **`NEEDS_INPUT` é um estado que o sistema sabe mostrar e não consegue produzir.** O enum declara, `issue/usecases/GetIssuesOverview.ts:84` e `GetSessionIssues.ts:56` agrupam a UI por ele, `thread/services/OpenIssuesReader/OpenIssuesReader.ts:43` documenta que *"a NEEDS_INPUT issue belongs in it"*, e a entidade `Issue` não tem nenhum método que produza o valor: só `complete()` e `reopen()`. Nenhuma linha do banco jamais teve esse status.

2. **`TransitionIssueStatus` com `NEEDS_INPUT` afirma uma transição que não faz.** `DeclareIssueComplete.ts:80` levanta um stop `HUMAN_REQUESTED` e retorna `{issueId, status: 'NEEDS_INPUT'}` — sucesso, com o status intocado. Foi isso que fez o orquestrador anunciar duas vezes no grupo que tinha resolvido.

3. **Um turno que termina sem declarar não deixa rastro nenhum.** `agent/usecases/RunIssueTurn.ts:353` — `if (this.agent.tools.length > 0) return` — sai em silêncio: sem evento, sem log, sem stop. O dispatcher consome o item normalmente (`LibSqlMailboxDispatcher.ts:335`), porque do ponto de vista dele o turno foi entregue.

4. **Quando nem o turno termina, ninguém percebe.** Crash, `kill -9` ou reinício do daemon (o que de fato ocorreu às 19:23) deixam a issue em `WORKING` para sempre: o único job repetível do contexto é `AutoArchiveCompletedIssues`, que varre `COMPLETED`.

5. **O `catch` de `RecordStopFromExecution.ts` engole quatro códigos sem logar** (`STOP_CRITERION_DISABLED`, `ISSUE_ARCHIVED`, `ISSUE_NOT_FOUND`, `THREAD_NOT_FOUND`). Os dois `integration.thread.stop_raised` de 19:19 e 19:22 foram publicados e processados (`attempts=1`, sem erro) e nenhuma linha foi gravada em `stops` — e não há como saber por quê.

6. **O orquestrador nunca retoma a sessão do provider.** `RunOrchestratorTurn.resolveSession:594` documenta que o cursor *não* se aplica a uma conversa, mas `AgentSession.resumeDecision:137` reprova qualquer linha sem `lastMessageId` antes de chegar na comparação — e `upsertSession:693` nunca grava um. As duas metades foram escritas sob premissas diferentes, e o resultado é `MISSING_CURSOR` em todo turno (28 num único boot do daemon de 26/08).

## Goal

O operador deixa de ver uma issue afirmando que está trabalhando quando não há nada rodando. Qualquer forma de o trabalho parar — o agente encerrando sem declarar, o processo morrendo, o daemon reiniciando — leva a issue a `NEEDS_INPUT` com o motivo escrito, e responder no grupo volta a colocá-la para trabalhar. E quando alguma coisa engole um stop pelo caminho, existe uma linha de log dizendo qual.

## Decisions

1. **`Issue` ganha a transição faltante.** Um método que leva a issue para `NEEDS_INPUT` guardando o motivo em `meta`, idempotente em relação ao estado atual. `COMPLETED` não regride por essa via — uma issue que já concluiu e recebe um stop tardio permanece concluída.

2. **`reopen()` passa a aceitar `NEEDS_INPUT → WORKING`, além de `COMPLETED → WORKING`.** Sem isso, a primeira issue que entrar em `NEEDS_INPUT` fica presa lá pelo motivo simétrico ao de hoje: `SteerIssueTurn.ts:56` só reabre o que está `COMPLETED`, e a condição precisa passar a ser "não está `WORKING`". O `completedAt` continua sendo zerado no caminho de volta, pela razão que o docblock atual já dá (`AutoArchiveCompletedIssues` seleciona por essa coluna).

3. **O contexto `issue` passa a escutar `ThreadStopRaisedEvent` num handler próprio**, que move o status quando o payload traz `issueId` e ignora o stop de thread. Handler novo em vez de uma branch em `MaterializeIssueFromExecution` porque são responsabilidades diferentes, e dois consumidores do mesmo integration event não violam a regra de B4: ela proíbe dois **publicadores**, e cada contexto aqui muda o seu próprio estado — o `thread` grava a linha do Stop, o `issue` move o status.

4. **`DeclareIssueComplete` continua levantando o stop no ramo `NEEDS_INPUT`** — o que muda é que agora o stop tem consequência. A ferramenta passa a cumprir o que o nome e o retorno prometem sem ganhar um segundo caminho de escrita.

5. **Existe UM único produtor do fato "esta issue travou": um job repetível no contexto `agent`.** A alternativa — `RunIssueTurn` mintar o fato no ponto onde hoje há o `return` mudo — foi considerada e rejeitada por dois motivos concretos. Primeiro, o turno **não tem como saber se houve declaração**: ela chega por uma ferramenta MCP que commita fora do fluxo do turno, e o materializador que move o status é assíncrono via outbox, então ler o status no fim do turno responde a pergunta errada. Segundo, dois produtores do mesmo stop exigiriam dedup entre eles. Um produtor só torna a coordenação desnecessária em vez de correta-por-disciplina.

6. **O job vive no `agent`** — dono da mailbox, é quem sabe o que é um run vivo, e já é o único publicador de `AgentRunStopRaisedEvent`. Lê as issues `WORKING` por um Service, do mesmo jeito que `thread/services/OpenIssuesReader` já lê a tabela `issues` a partir de outro contexto. Cria `agent/jobs.ts`, que ainda não existe; a cadência mora no próprio use case (`static readonly repeat`), como em `AutoArchiveCompletedIssues.ts:32`. Cadência de 1 minuto: o predicado é um `SELECT` sobre um SQLite local, e o que se compra com ele é o teto de espera do operador.

7. **O predicado de "órfã" é a ausência de qualquer coisa em voo, não um tempo.** Uma issue está órfã quando está `WORKING`, não arquivada, e as duas filas estão vazias para ela: **nenhuma linha em `agent_mailbox`** com `consumed_at IS NULL AND dead_at IS NULL`, e **nenhuma linha em `shared_outbox`** com `entity_id = <issueId> AND processed_at IS NULL`. A primeira condição cobre o run em andamento (lease vivo) e o turno enfileirado esperando slot; a segunda fecha a corrida com o materializador — sem ela, um turno que acabou de declarar `COMPLETED` seria marcado `NEEDS_INPUT` no intervalo entre o evento ser gravado e o outbox processá-lo. Nenhum timeout arbitrário entra na conta.

8. **O fato emitido é `AgentRunStopRaisedEvent` com `kind: HUMAN_REQUESTED` e `source: FactSource.INFERRED`**, com o `detail` dizendo que a execução terminou sem conclusão. O par (`HUMAN_REQUESTED`, `INFERRED`) é exatamente "precisa de humano, e não foi o agente que pediu"; `FactSource` existe para essa distinção e o docblock de `DeclareIssueComplete.ts:43` já promete que *"quantas issues fecharam por inferência?"* é um `SELECT`. Um `StopKind` novo foi considerado e rejeitado: custaria um contrato congelado mais uma migração do `CHECK` de `issue_stops.kind`, para uma distinção que o `source` já carrega.

9. **`RunIssueTurn` ganha um log no lugar do `return` mudo.** A transição fica com o job (Decisão 5), mas o silêncio em si é um defeito diagnóstico: hoje um turno que não declarou nada não deixa rastro em lugar nenhum. Um `warn` com `issueId` e `turnKind` é o suficiente, e é o que teria apontado a causa de 26/08 em segundos.

10. **O `catch` de `RecordStopFromExecution` loga antes de engolir**, com o código, o `stopId` e o `issueId`. Continua engolindo os mesmos quatro — o que muda é deixar de ser invisível.

11. **A exigência de cursor passa a ser derivada do tipo de sessão, não checada sempre.** Em `AgentSession.resumeDecision`, `MISSING_CURSOR` só se aplica a uma sessão de issue. A ausência de `issueId` já é o que identifica a linha do orquestrador — o próprio `upsertSession:700` diz isso — então a regra é lookup sobre o modelo, não um caso especial. Nada muda para a sessão de issue.

## User Stories

- **Story 1:** Como operador, quero que uma issue pare de dizer que está trabalhando quando não está, para eu saber na hora que preciso agir.
  - Dado um turno que encerra sem chamar nenhuma ferramenta de declaração, quando o job de reconciliação roda em seguida, então a issue fica `NEEDS_INPUT` com o motivo no `meta` e um Stop na lista de pendências.
  - Dado que o daemon é reiniciado no meio de um turno, quando o job roda, então a issue fica `NEEDS_INPUT` pelo mesmo caminho — é a mesma detecção, não um segundo mecanismo.
  - Dado um turno em andamento com lease vivo, quando o job roda, então a issue não é tocada.
  - Dado um turno que acabou de declarar `COMPLETED` e cujo evento ainda não foi processado pelo outbox, quando o job roda nesse intervalo, então a issue não é tocada.

- **Story 2:** Como operador, quero que responder no grupo destrave uma issue parada, para não precisar recriar o trabalho.
  - Dada uma issue em `NEEDS_INPUT`, quando eu mando um steer, então ela volta para `WORKING` e o turno é enfileirado.
  - Dada uma issue em `WORKING`, quando eu mando um steer, então nada é reaberto e o turno é enfileirado normalmente.

- **Story 3:** Como agente, quero que declarar `NEEDS_INPUT` realmente mude o estado da issue, para não reportar ao operador uma transição que não aconteceu.
  - Dado um agente que chama `TransitionIssueStatus` com `NEEDS_INPUT`, quando a chamada retorna sucesso, então o status persistido é `NEEDS_INPUT`.
  - Dada uma issue já `COMPLETED`, quando um stop chega para ela, então ela permanece `COMPLETED`.

- **Story 4:** Como desenvolvedor investigando um stop que não apareceu, quero uma linha de log dizendo qual guarda o descartou, para não precisar reconstruir o caminho pelo banco.
  - Dado um stop recusado por uma das quatro condições sancionadas, quando o handler o engole, então há um log com o código, o `stopId` e o `issueId`.

- **Story 5:** Como operador, quero que o orquestrador continue a mesma sessão entre mensagens, para ele não recomeçar do zero a cada frase.
  - Dada uma sessão de orquestrador com `provider` capaz de resumir, quando chega a segunda mensagem da thread, então a sessão é retomada e nenhum aviso de `MISSING_CURSOR` é emitido.
  - Dada uma sessão de issue sem cursor, quando um turno vai rodar, então `MISSING_CURSOR` continua invalidando o resume como hoje.

## Acceptance Criteria

- [ ] AC-1: A entidade `Issue` expõe uma transição para `NEEDS_INPUT` que guarda o motivo em `meta`, é idempotente quando já está nesse estado, e recusa mover uma issue arquivada.
- [ ] AC-2: Uma issue `COMPLETED` que recebe um stop permanece `COMPLETED`.
- [ ] AC-3: `reopen()` aceita `NEEDS_INPUT` e `COMPLETED` como origem, zera `completedAt`, e recusa qualquer outro estado.
- [ ] AC-4: `SteerIssueTurn` reabre uma issue em `NEEDS_INPUT` antes de enfileirar o turno, e não chama `reopen()` quando ela já está em `WORKING`.
- [ ] AC-5: Um `ThreadStopRaisedEvent` com `issueId` move a issue correspondente para `NEEDS_INPUT`; o mesmo evento sem `issueId` não altera issue nenhuma.
- [ ] AC-6: `TransitionIssueStatus` com `NEEDS_INPUT` resulta no status `NEEDS_INPUT` persistido na issue.
- [ ] AC-7: O job move para `NEEDS_INPUT` uma issue `WORKING` cujas duas filas estão vazias, emitindo `AgentRunStopRaisedEvent` com `source: INFERRED` e `kind: HUMAN_REQUESTED`.
- [ ] AC-8: O job não toca uma issue com item de mailbox de lease vivo, nem uma com item enfileirado ainda não consumido, nem uma com evento de outbox não processado.
- [ ] AC-9: O job não toca issues arquivadas nem issues fora de `WORKING`.
- [ ] AC-10: Rodar o job duas vezes seguidas sobre a mesma issue órfã não produz dois stops.
- [ ] AC-11: `RunIssueTurn` emite um `warn` com `issueId` e `turnKind` quando o turno termina sem declaração.
- [ ] AC-12: Cada uma das quatro condições engolidas por `RecordStopFromExecution` emite um log contendo o código do erro, o `stopId` e o `issueId`.
- [ ] AC-13: Uma sessão de orquestrador sem `lastMessageId` é retomada quando `model` e `cwd` não mudaram; uma sessão de issue sem `lastMessageId` continua sendo invalidada com `MISSING_CURSOR`.
- [ ] AC-14: O cenário completo passa num teste de integração: turno encerra sem declarar → job roda → issue em `NEEDS_INPUT` com Stop gravado na tabela → steer → issue de volta em `WORKING`.

## Fora de escopo

**Fazer o trabalho longo acontecer.** Esta spec faz a issue parar de mentir; ela não faz a demo em vídeo sair. O processo do Playwright de 26/08 morreu às 17:55 pelo teto de 600s do tool `Bash` do próprio Claude Code — um limite do harness que o codm não controla, e que nenhuma mudança no `proc.kill()` do `ClaudeAgentRunner` contorna. O caminho que resolve é outro: trabalho longo deixa de rodar dentro do turno e passa a ser registrado como comando do daemon (`shared_scheduled_commands` já tem lease, `attempts` e `dead_at`), executado fora de qualquer turno, com o veredito voltando como `STEER`. Isso introduz uma ferramenta MCP nova e um quarto verbo no protocolo de declaração — decisão de produto, não de infra — e é spec própria.

**Resolver um stop não devolve a issue para `WORKING`.** `TAKE_OVER` significa que o operador assumiu; o caminho de volta ao trabalho continua sendo o steer (Decisão 2), que é o que a spec de reabertura já estabeleceu.

## Riscos

**A causa do stop de 19:19/19:22 não ter gravado ainda é desconhecida.** Verifiquei as quatro guardas contra o banco e nenhuma explica: a thread existe e não está deletada, a issue existe e não está arquivada, e `StopPolicyConfigRepository.get` cai no `DEFAULT_STOP_POLICY` com tudo habilitado para um owner sem linha. A Decisão 8 torna o próximo caso diagnosticável em uma linha de log; o AC-13 força o caminho inteiro a ser exercitado em integração, que é onde a causa deve aparecer. Se o teste passar de primeira, a causa é ambiental e continua aberta — vale registrar isso no PR em vez de declarar resolvido.
