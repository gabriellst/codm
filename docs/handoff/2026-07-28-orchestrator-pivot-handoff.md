# Handoff — pivot do orquestrador, 28 jul 2026

## Leia isto primeiro

O produto **funcionou ponta a ponta pela primeira vez hoje**, às 19:02, no grupo real: uma
mensagem do próprio dono foi ouvida, classificada, trabalhada pelo CLI de verdade, e a
resposta chegou no WhatsApp — com o eco da própria resposta bloqueado. Registro em
`packages/api/typescript/scripts/inject-own-message.ts`.

Depois disso o founder pivotou o modelo. O spec está ratificado e a implementação começou.

## Estado

Branch `agent-abstraction`, HEAD `58d83fbf`. `main` intocada em `4ac90824`. Nada pushado.
Árvore limpa **exceto** `packages/app/react/src/components/console/AppChrome.tsx` — edição do
founder, deliberadamente não commitada. **Não toque sem perguntar** (eu revertí uma edição dele
hoje por engano; ver `.claude` memory `founder-edits-worktree-midsession`).

Commits do dia, em ordem:

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

Gates em HEAD: 779 testes api-ts, 414 tooling, build+suíte Go, `bun tsc` nos 7 projetos,
biome e eslint limpos.

## O pivot, em uma frase

A conversa é o primário; a issue é um fork explícito. Um orquestrador residente por thread
conversa com o operador; criar issue é ato declarado (tool MCP), cada issue roda como subagent
concorrente, e o resultado volta como turno do orquestrador — que **compõe** a resposta e a
entrega citando a mensagem de origem.

Spec completo e ratificado: `.specs/codedm/2026-07-28-orchestrator-pivot.md`. **Decisões D1–D8
não se rediscutem.**

## Onde parei, e o que vem exatamente

**F1 pronto** (`6c28c726`): sessões em dois kinds (`issue_id` nullable + uniques parciais),
`lastContextTokens`, `Issue.originEntryId`/`goal`, tabela `agent_mailbox`, contratos
(`issue.created`, `orchestrator.replied`, `quotedMessageId`+`replyEntryId` no delivery),
`findPlatformId`, `AgentName.ORCHESTRATOR`.

**Mailbox pronta** (`58d83fbf`): port + Drizzle + Mock + 7 testes de semântica de lease,
registrada no DI. **Inerte** — ninguém enfileira, ninguém consome.

**O que falta na F2, e a ordem importa:**

1. `OrchestratorPromptBuilder` — **a voz do produto.** Deixei de propósito para uma sessão
   fresca: escrever isso apressado é pior que não escrever. Precisa cobrir: conversar, saber
   quando chamar `issue/create`, compor resultado de subagent na voz da conversa, e a política
   de citação da D6 (retorno de issue SEMPRE cita; conversa é escolha dele).
2. `OrchestratorAgent` — espelha `IssueWorkAgent` (base `Agent`, sem `outputSchema`,
   `mcpScope: 'orchestration'`). Aditivo.
3. `RunOrchestratorTurn` — espelha `RunIssueTurn`; sessão chaveada por thread; persiste
   `OrchestratorRepliedEvent`.
4. `MailboxDispatcher` — o poller. Modelo: `SqliteCommandQueue`. Precisa de sweep no boot e
   **re-poll ao fim do turno** (a ausência disso foi bloqueante na v1 do spec).
5. **O PR atômico**: repoint do ramo invocável do `ConsumeInboundMessage` para enfileirar
   `OPERATOR_MESSAGE` **na mesma transação do ingest**, + morte de `ClassifyMessage`,
   `IssueRouter*`, `ClassifyIssueAgent`, fluxo CLARIFY, **ambos** os `MessageClassifiedEvent`
   (domain e wire) e `RunIssueTurnOnClassification`. 47 arquivos tocam essa superfície
   (`git grep -l` no spec §5). **Não pode ficar pela metade** — meia-classificação viva é o
   "duas fontes de decisão" que a D5 proíbe.
6. e2e 04/07: o `E2eStubAgentRunner` precisa fingir um turno de orquestrador que dirige o
   `issue/create` via MCP real. Hoje ele discrimina por `outputSchema`, que deixa de existir.

Depois: F3 (escopo MCP `orchestration`), F4 (a volta + steer + **morte do
`RequestAgentReplyDelivery`**, senão cada conclusão gera DUAS mensagens no grupo), F5
(compaction + luto).

## Armadilhas que já custaram tempo hoje

- **O `schema.sql` do Go era passo manual** e estava três migrations atrasado sem ninguém
  notar. Agora é derivado: `cd packages/api/typescript && bun scripts/dump-sqlite-schema.ts`,
  com `--check` como gate de drift. **Rode depois de toda migração**, e depois `sqlc generate`.
- **O rebuild de tabela do drizzle põe a coluna NOVA no SELECT da tabela VELHA.** Aconteceu na
  0004 (`no such column: last_context_tokens`). Confira toda migration que reconstrói tabela.
- **Eventos de integração publicados pelo TS não criam linha no outbox** — `publish` despacha
  in-process. Perdi 400s observando uma coluna que estruturalmente nunca apareceria. Para provar
  entrega, olhe `channel.message_sent` e o ledger, não o outbox.
- **`biome check --write --unsafe` apaga construtor de subclasse que só encaminha** — e quando
  o TIPO do parâmetro é o binding de DI, a deleção compila e religa em silêncio. Já mordeu uma
  vez (`FixedAgentRunnerFactory`, com `biome-ignore` explicando).
- **`tsc` passa com método a mais na implementação e ausente no port.** Aconteceu com
  `findPlatformId`; peguei revisando o staged, não por gate.
- **`git add -A` num escopo largo varre o `AppChrome.tsx` do founder.** Stage explícito.
- **`git commit -- <pathspec>` falha sob lint-staged.** Stage, verifique, commite sem pathspec.

## Como verificar de verdade

`tsc` verde não é evidência — o bug que consertei hoje de manhã passou por todos os gates e
deixou o produto inerte por semanas. O que conta:

```
cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit && bun test
cd packages/contracts && bun test codegen/
cd packages/api/go && go build ./... && go test ./...
bun run test:tooling && bun tsc
cd packages/api/typescript && bun scripts/dump-sqlite-schema.ts --check
```

E para qualquer coisa que toque o caminho vivo: **suba o app e prove no grupo real.**
`bun desktop:sidecars && bun desktop:dev`, depois
`cd packages/api/typescript && bun scripts/inject-own-message.ts "sua mensagem"`.

## Acordos de trabalho

- Tudo local. Sem push, sem fetch. `main` intocada.
- **Prove que o gate consegue reprovar** antes de confiar nele. Nesta sessão cinco verificações
  se revelaram vacuosas — incluindo duas minhas, hoje.
- Pare com achado, não invente. Se algo diverge do spec, diga; não improvise.
- Pergunte em prosa; o founder não quer widget de pergunta.
