# Handoff — pivot do orquestrador, 28 jul 2026

## Leia isto primeiro

O produto **funcionou ponta a ponta pela primeira vez hoje**, às 19:02, no grupo real: uma
mensagem do próprio dono foi ouvida, classificada, trabalhada pelo CLI de verdade, e a resposta
chegou no WhatsApp — com o eco da própria resposta bloqueado. O registro do que isso provou está
em `packages/api/typescript/scripts/inject-own-message.ts`, junto com a verificação vacuosa que
**não** se deve repetir.

Depois disso o founder pivotou o modelo. O spec está ratificado, a F1 entregue, e a `main`
avançada. A implementação continua na F2.

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
**Decisões D1–D8 não se rediscutem.** Elas sobreviveram a um grill de 3 críticos com 6
bloqueantes; a v2 já incorpora todos.

## Onde parei, e o que vem exatamente

**F1 pronto** (`6c28c726` + `f92ed007`): sessões em dois kinds (`issue_id` nullable + uniques
parciais), `lastContextTokens`, `Issue.originEntryId`/`goal`, tabela `agent_mailbox`, contratos
(`issue.created`, `orchestrator.replied`, `quotedMessageId`+`replyEntryId` no delivery),
`findPlatformId`, `AgentName.ORCHESTRATOR`.

**Mailbox pronta** (`58d83fbf`): port + Drizzle + Mock + 7 testes de semântica de lease,
registrada no DI. **Inerte** — ninguém enfileira, ninguém consome.

### O que falta na F2, e a ordem importa

1. **`OrchestratorPromptBuilder` — a voz do produto.** Deixado de propósito para sessão fresca:
   escrever isso apressado é pior que não escrever. Precisa cobrir conversar, saber quando chamar
   `issue/create`, compor resultado de subagent na voz da conversa, e a política de citação da D6
   (retorno de issue SEMPRE cita; na conversa é escolha dele — o exemplo canônico do founder
   mostra "sim, claro" sem quote e só o resultado com quote).
2. **`OrchestratorAgent`** — espelha `IssueWorkAgent` (base `Agent`, sem `outputSchema`,
   `mcpScope: 'orchestration'`). Aditivo.
3. **`RunOrchestratorTurn`** — espelha `RunIssueTurn`; sessão chaveada por thread; persiste
   `OrchestratorRepliedEvent` (domain do contexto **agent**, por EVT-01).
4. **`MailboxDispatcher`** — o poller. Modelo: `SqliteCommandQueue`. Precisa de **sweep no boot**
   e **re-poll ao fim do turno** — a ausência disso foi bloqueante na v1 do spec.
5. **O PR ATÔMICO.** Repoint do ramo invocável do `ConsumeInboundMessage` para enfileirar
   `OPERATOR_MESSAGE` **na mesma transação do ingest**, + morte de `ClassifyMessage`,
   `IssueRouter*`, `ClassifyIssueAgent`, fluxo CLARIFY, **ambos** os `MessageClassifiedEvent`
   (domain e wire) e `RunIssueTurnOnClassification`. **47 arquivos** tocam essa superfície
   (listada no spec §5). **Não pode ficar pela metade** — meia-classificação viva é o "duas
   fontes de decisão" que a D5 proíbe.
6. **e2e 04/07**: o `E2eStubAgentRunner` precisa fingir um turno de orquestrador que dirige o
   `issue/create` via MCP real. Hoje ele discrimina por `outputSchema`, que deixa de existir.

Depois: **F3** (escopo MCP `orchestration`; `originEntryId` NUNCA é argumento do modelo — o
router injeta das claims do run token), **F4** (a volta + steer + **morte do
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

## Pendências que não são da F2

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
