# Handoff — pivot do orquestrador, 28 jul 2026

## Leia isto primeiro

O produto **funcionou ponta a ponta pela primeira vez hoje**, às 19:02, no grupo real: uma
mensagem do próprio dono foi ouvida, classificada, trabalhada pelo CLI de verdade, e a resposta
chegou no WhatsApp — com o eco da própria resposta bloqueado. O registro do que isso provou está
em `packages/api/typescript/scripts/inject-own-message.ts`, junto com a verificação vacuosa que
**não** se deve repetir.

Depois disso o founder pivotou o modelo. O spec está ratificado, a F1 entregue, e a `main`
avançada. A implementação continua na **F2+F3** (fases fundidas pela D9 — ver abaixo).

## Estado

**`main` = `f92ed007`** (era `4ac90824`). `agent-abstraction` aponta para o mesmo commit — o
merge foi **fast-forward puro**, sem commit de merge. Sem remote configurado; nada foi pushado.

Árvore limpa **exceto** `packages/app/react/src/components/console/AppChrome.tsx` — edição do
founder, deliberadamente não commitada. **Não toque sem perguntar.** Eu revertí uma edição dele
hoje por engano ao supor que era de subagente; está na memória como
`founder-edits-worktree-midsession`.

### O merge, e o que ficou de fora

Levantamento das sete branches: `agent-abstraction` continha **integralmente**
`sqlite-shared-store` (46 commits, zero fora) e `desktop-deparametrize` (os 2 commits únicos já
estavam lá); `channel-rich-sqlc` e `desktop-typed-commands` já estavam na `main`. Uma branch só
carregava tudo.

**Excluídas por decisão do founder:** `go-domain` (3 commits) e `go-domain-port` (13).
Confirmado que nenhuma entrou de carona.

### Commits do dia

| commit | o que |
|---|---|
| `4893ca32` | `AgentRunnerFactory` — `ProviderKind`→runner sai do token e vira wiring |
| `5c7e3729` | materialização in-process; `extractInboundText` morre |
| `12b175c8` | tag de citação cunhada no attach; gate de menção ligado por padrão |
| `9125bc49` | reply-quotes resolvem; a linha do ledger fecha |
| `58f065c6` | `SenderIdentity` → `MessageAuthor {HUMAN, SYSTEM}` |
| `c10f61f9` | **a mensagem do dono é ouvida** (bridge Go + atribuição ao operator) |
| `b43884f9` | **a resposta sai no WhatsApp** (ChannelSender via SDK Go, trava do laço) |
| `c13f8080` | sonda de aceite em runtime, com o registro do que provou |
| `5c2fc86b` | **spec do pivot v2**, pós-grill (6 bloqueantes incorporados) |
| `6c28c726` | F1 — chão: migrações, contratos, regen |
| `58d83fbf` | a mailbox (fila durável por alvo), inerte |
| `83173b70` | handoff (v1) |
| `f92ed007` | SDK da F1 que ficou sem commit — `check:generated` estava vermelho |

Gates em `f92ed007`: 779 testes api-ts, 414 tooling, build+suíte Go, `bun tsc` nos 7 projetos,
`bun check:generated` verde, biome e eslint limpos.

## O pivot, em uma frase

A conversa é o primário; a issue é um fork explícito. Um orquestrador residente por thread
conversa com o operador; criar issue é ato declarado (tool MCP), cada issue roda como subagent
concorrente, e o resultado volta como turno do orquestrador — que **compõe** a resposta e a
entrega citando a mensagem de origem.

Spec completo e ratificado: `.specs/codedm/2026-07-28-orchestrator-pivot.md`.
**Decisões D1–D9 não se rediscutem.** D1–D8 sobreviveram a um grill de 3 críticos com 6
bloqueantes; a v2 incorpora todos.

**D9 (emenda de faseamento, ratificada 28-jul — spec v3): F2 e F3 são UMA fase.** O faseamento da
v2 era inconstruível: `RunIssueTurnOnClassification` é "the one runtime caller of `RunIssueTurn`"
(`:15`, verificado — o único outro é `TestRunIssueTurnController`, atrás de `CODEDM_E2E`), e ele
morre junto com a classificação porque é `EventHandler<typeof MessageClassifiedEvent>`. Como
`issue/create` só nascia na F3, **nada em produção invocaria `RunIssueTurn` durante toda a F2**: o
produto conversaria sem conseguir trabalhar, abaixo do que rodou às 19:02. Com a D9 a classificação
morre no PR em que o substituto está inteiro — conversa **e** fork.

## Onde parei, e o que vem exatamente

**F1 pronto** (`6c28c726` + `f92ed007`): sessões em dois kinds (`issue_id` nullable + uniques
parciais), `lastContextTokens`, `Issue.originEntryId`/`goal`, tabela `agent_mailbox`, contratos
(`issue.created`, `orchestrator.replied`, `quotedMessageId`+`replyEntryId` no delivery),
`findPlatformId`, `AgentName.ORCHESTRATOR`.

**Mailbox pronta** (`58d83fbf`): port + Drizzle + Mock + 7 testes de semântica de lease,
registrada no DI. **Inerte** — ninguém enfileira, ninguém consome.

### O que falta na F2+F3, e a ordem importa

Tudo abaixo é **uma fase, um PR** (D9). Os itens 1–5 são aditivos e podem ser construídos e
testados isoladamente; o item 6 é o que liga tudo e mata a classificação, e é indivisível.

1. **`OrchestratorPromptBuilder` — a voz do produto.** Deixado de propósito para sessão fresca:
   escrever isso apressado é pior que não escrever. Precisa cobrir conversar, saber quando chamar
   `issue/create`, compor resultado de subagent na voz da conversa, e a política de citação da D6
   (retorno de issue SEMPRE cita; na conversa é escolha dele — o exemplo canônico do founder
   mostra "sim, claro" sem quote e só o resultado com quote).
2. **Escopo MCP `orchestration` + run token de THREAD.** `issue/create` + `issue/list` +
   `issue/status` (o `issue/steer` fica para a F4, §7.2). Controllers + manifest +
   `bun emit-openapi` + `bun sdk`. **E o §7.2.1**: `RunTokenClaims.issueId` vira opcional, ganha
   `entryId`, a guarda de `types/Agent.ts:145` passa a ser por escopo — e **todo tool que aceite
   `issueId` verifica `issue.threadId === claims.threadId` no próprio handler**, porque sem claim
   de issue o walker de `mcp/identity.ts` para de comparar `issueId` (não falha: ignora).
3. **`OrchestratorAgent`** — espelha `IssueWorkAgent` (base `Agent`, sem `outputSchema`,
   `mcpScope: 'orchestration'`). Aditivo, **mas só compila depois do item 2** — hoje
   `MCP_SCOPE_NAMES` não tem `orchestration` e a cunhagem estouraria sem `issueId`.
4. **`RunOrchestratorTurn`** — espelha `RunIssueTurn`; sessão chaveada por thread; persiste
   `OrchestratorRepliedEvent` (domain do contexto **agent**, por EVT-01).
5. **`MailboxDispatcher`** — o poller. Modelo: `SqliteCommandQueue`. Precisa de **sweep no boot**
   e **re-poll ao fim do turno** — a ausência disso foi bloqueante na v1 do spec.
6. **`DeliverOrchestratorReply` (§7.5, perna conversacional).** Handler external no **thread**:
   carrega a Thread (envelope), grava a entrada SYSTEM no transcript, resolve `quotedMessageId`
   via `findPlatformId` quando há citação, publica `ChannelDeliveryRequestedEvent` com
   `quotedMessageId` + `replyEntryId`. **Sem ele a resposta não chega no WhatsApp e a fase não tem
   como ser provada.** Era o buraco da v1 deste handoff: o artefato não estava na lista.
7. **O PR ATÔMICO.** Repoint do ramo invocável do `ConsumeInboundMessage` (`:117`) para enfileirar
   `OPERATOR_MESSAGE` **na mesma transação do ingest**, + morte de `ClassifyMessage`,
   `IssueRouter*`, `ClassifyIssueAgent`, fluxo CLARIFY, **ambos** os `MessageClassifiedEvent`
   (domain e wire) e `RunIssueTurnOnClassification`. **47 arquivos** tocam essa superfície
   (listada no spec §5). **Não pode ficar pela metade** — meia-classificação viva é o "duas
   fontes de decisão" que a D5 proíbe.
8. **e2e 04/07**: o `E2eStubAgentRunner` precisa fingir um turno de orquestrador que dirige o
   `issue/create` via MCP real. Hoje ele discrimina por `outputSchema`, que deixa de existir.
   (Só é construível porque o escopo entra nesta mesma fase — na v2 não era.)

**Prova de aceite, em runtime no grupo real:** o exemplo canônico do §1 até o ack — conversa de
ida e volta, depois "crie uma issue" → ack imediato ENQUANTO o subagent roda.

Depois: **F4** (a volta — `ISSUE_RESULT` compõe, `DeliverOrchestratorReply` ganha o ramo que cita
`originEntryId`, `issue/steer` + `SteerThread` repontado, + **morte do
`RequestAgentReplyDelivery`**, senão cada conclusão gera DUAS mensagens no grupo), **F5**
(compaction + luto do código morto).

## Armadilhas que já custaram tempo

- **O `schema.sql` do Go era passo manual** e estava três migrations atrasado sem ninguém notar.
  Agora é derivado: `cd packages/api/typescript && bun scripts/dump-sqlite-schema.ts`, com
  `--check` como gate de drift. **Rode depois de toda migração**, e depois `sqlc generate`.
- **O rebuild de tabela do drizzle põe a coluna NOVA no SELECT da tabela VELHA.** Aconteceu na
  0004 (`no such column: last_context_tokens`). Confira toda migration que reconstrói tabela.
- **`bun sdk` regenera `packages/client` e é fácil esquecer de commitar** — o `check:generated`
  que pegaria isso é comando manual, ausente do CI e do pre-commit. Aconteceu na F1.
- **Eventos de integração publicados pelo TS não criam linha no outbox** — `publish` despacha
  in-process. Perdi 400s observando uma coluna que estruturalmente nunca apareceria. Para provar
  entrega, olhe `channel.message_sent` e o ledger.
- **`biome check --write --unsafe` apaga construtor de subclasse que só encaminha** — e quando o
  TIPO do parâmetro é o binding de DI, a deleção compila e religa em silêncio.
- **`tsc` passa com método a mais na implementação e ausente no port.** Aconteceu com
  `findPlatformId`; peguei revisando o staged, não por gate.
- **`git add -A` num escopo largo varre o `AppChrome.tsx` do founder.** Stage explícito.
- **`git commit -- <pathspec>` falha sob lint-staged.** Stage, verifique, commite sem pathspec.

## Como verificar de verdade

`tsc` verde não é evidência — o bug consertado hoje de manhã passou por todos os gates e deixou o
produto inerte por semanas. O que conta:

```
cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit && bun test
cd packages/contracts && bun test codegen/
cd packages/api/go && go build ./... && go test ./...
bun run test:tooling && bun tsc && bun check:generated
cd packages/api/typescript && bun scripts/dump-sqlite-schema.ts --check
```

E para qualquer coisa que toque o caminho vivo: **suba o app e prove no grupo real.**
`bun desktop:sidecars && bun desktop:dev`, depois
`cd packages/api/typescript && bun scripts/inject-own-message.ts "sua mensagem"`.

## Pendências que não são da F2+F3

- **Ninguém no grupo sabe qual é a tag de citação**, e o pivot tornou isso mais grave: o
  `@agente` virou a interface inteira. A máquina está quase pronta (`thread.attached` sem
  consumidor; `ChannelDeliveryRequestedEvent` já existe). **É ação para fora, num grupo real —
  precisa do aval do founder.**
- **Janela de corrida na trava do laço** (documentada no `DeliverChannelMessage`): o id é
  registrado depois do envio retornar. A correção estrutural é cunhar o id antes da chamada de
  fio (o whatsmeow aceita `req.ID`). Fica mais urgente com a tagarelice do orquestrador.
- **Task #17** (links em conversas sem mensagem) — válida e independente do pivot.
- **Task #19** (upstream para o template) — **adiar até a F5**: hoje subiria um modelo pela
  metade.
- Sete contratos ainda carregam `platform: string` sob um adiamento provavelmente falso.

## Acordos de trabalho

- Tudo local. Sem push (não há remote).
- **Prove que o gate consegue reprovar** antes de confiar nele. Nesta sessão cinco verificações
  se revelaram vacuosas — duas delas minhas, no mesmo dia em que eu cobrava isso.
- Pare com achado, não invente. Se algo diverge do spec, diga; não improvise.
- Pergunte em prosa; o founder não quer widget de pergunta.
