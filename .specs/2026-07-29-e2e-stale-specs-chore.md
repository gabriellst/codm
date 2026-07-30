# Chore C8 — e2e presa no mundo pré-F4 + churn do stub

**Date:** 2026-07-29
**Status:** Approved
**Bounded Context:** e2e + agent (seam de teste)
**Kind:** chore
**Story Points:** 2 — 3 arquivos, sem contexto de domínio novo, mudança mecânica de asserção + um guard de uma linha.

> **Roda PRIMEIRO de todas as frentes.** A suíte e2e (`packages/e2e`) vermelha é o gate de verificação de qualquer outra frente em andamento no codedm — nenhuma outra spec/plano deve ser considerada "verificada" enquanto `cd packages/e2e && bun run test` não sair verde. Este chore precede qualquer outro trabalho em fila.

## Context

`packages/e2e/tests/04-inbound-issue.spec.ts` e `packages/e2e/tests/05-whisper-direct.spec.ts` foram escritos antes do destravamento do composer (commit `a4b7f622`). A regra shipped hoje é a documentada em `packages/api/typescript/src/thread/usecases/GetSessionChat.ts:59-67`: `composerMode` é **estado derivado**, não preferência — `paused → STEER`, `running → DIRECT` (a doc do use case chama isso explicitamente de inversão do mapeamento antigo, `paused ? DIRECT : STEER`).

`05-whisper-direct.spec.ts` ainda testa o mundo anterior ao destravamento: na sessão live (`live.paused === false`) ele espera `composerMode === 'STEER'` (linha 20, isso ainda bate com a regra atual) mas depois assevera, nas linhas 28 e 41, que enviar o modo "errado" para o estado atual **rejeita** (`rejects.toThrow()`) — comportamento que o destravamento matou. O docstring do arquivo (linhas 7-11) ainda cita `Thread.assertCanSteer` / `Thread.assertCanSendDirect`, métodos que não existem mais no código.

`04-inbound-issue.spec.ts:104-105` faz a asserção correta na direção (`composerMode` em sessão live), mas com o valor errado: assevera `'STEER'` quando a regra shipped diz que live ⇒ `DIRECT`.

Separado disso, há um segundo problema que também derruba a suíte: `E2eStubAgentRunner.run` (`packages/api/typescript/src/agent/services/AgentRunner/E2eStubAgentRunner/E2eStubAgentRunner.ts:63-65`) chama `this.declarations.forkIssue(request.mcp)` em **todo** turno de orquestrador (`isOrchestrator`), sem distinguir se aquele turno tem uma entrada de origem (`entryId`) nas claims do run token. Um turno de whisper não carrega essa entry. `ForkIssueController.handle` (`packages/api/typescript/src/agent/controllers/ForkIssue.ts:102-106`) rejeita nesse caso com `AGENT_TOOLS_UNSUPPORTED — 'this run carries no originating message to attribute the issue to'`. `E2eMcpDriver.call` (`packages/api/typescript/src/agent/mcp/E2eMcpDriver.ts:136-145`) trata qualquer `result.isError` como falha e lança `BaseError`, fail-loudly por design (documentado nas linhas 66-69 do mesmo arquivo). Essa falha propaga para o item de mailbox do turno de whisper, que sofre as tentativas de retry do `MailboxRepository` (comportamento coberto em `packages/api/typescript/src/agent/repositories/MailboxRepository/MailboxRepository.test.ts:89-114`) até estourar o poll de 20s que `04-inbound-issue.spec.ts` usa em vários pontos (linhas 58, 74, 89) — starvation cross-teste: `04` isolado passa em ~3s, mas a suíte completa falha quando `05` roda perto.

Um fix para os três pontos foi escrito hoje e **revertido a pedido do founder** — este chore reaplica exatamente essa correção, agora como spec formal.

## Problem

A suíte e2e não reflete a semântica atual do composer (F4/destravamento) e faz o stub do orquestrador tentar forkar issue em turnos sem entrada de origem, o que produz retries e starvation cross-spec. Resultado: `cd packages/e2e && bun run test` está vermelho, e por ser o gate de verificação de todas as outras frentes, bloqueia a validação de qualquer trabalho em andamento no codedm.

## Goal

Suíte e2e completa verde de novo, com as specs `04` e `05` asserindo a regra shipped do composer (`paused → STEER`, `running → DIRECT`) e o stub do orquestrador não tentando forkar issue em turnos sem entrada de origem — sem mudar nenhum comportamento de produção fora do seam de teste (`E2eMcpDriver`).

## Decisions

1. **Reescrever `packages/e2e/tests/05-whisper-direct.spec.ts` para a semântica shipped**: ambos os modos (whisper/steer e direct) são aceitos em **qualquer** estado da sessão (é isso que o destravamento fez) — não há mais rejeição por estado errado. `composerMode` no payload de `getSessionChat` é o **default derivado**: live ⇒ `DIRECT`, paused ⇒ `STEER`. Título do teste e docstring do arquivo são reescritos para essa semântica; a citação a `assertCanSteer`/`assertCanSendDirect` (métodos deletados) sai do docstring.
2. **Corrigir `packages/e2e/tests/04-inbound-issue.spec.ts` (linha ~105)**: sessão live ⇒ `composerMode` esperado é `'DIRECT'` (não `'STEER'`).
3. **Guard em `E2eMcpDriver.forkIssue`** (`packages/api/typescript/src/agent/mcp/E2eMcpDriver.ts`): `if (!claims.entryId) return []` antes de montar a chamada de `ForkIssueController` — um turno de orquestrador sem entrada de origem não tenta forkar, espelhando o que o orquestrador real faria (responde sem forkar). O fail-loudly em `isError` dentro de `E2eMcpDriver.call` **permanece intocado** para os turnos que efetivamente podem forkar — é o guard de drift medido e decidido pelo founder, não deve ser relaxado.
4. **Gate de aceitação é o script real**: `cd packages/e2e && bun run test` saindo com exit 0 (o script é `bun scripts/run-e2e.ts`, mapeado em `packages/e2e/package.json`). `bun e2e` não existe como comando no codedm — não usar essa forma em nenhuma verificação.

## User Stories

**US-1 — Composer em qualquer estado (whisper/direct destravados)**
Given uma thread com sessão live (`paused === false`),
When o operador envia uma mensagem via `steerThread` (whisper) e, em seguida, via `sendDirectMessage` (direct),
Then ambas as chamadas retornam sucesso (`entryId` presente), sem `rejects.toThrow()` em nenhum dos dois modos, em nenhum dos dois estados (live e paused).

**US-2 — `composerMode` como default derivado do estado**
Given uma thread cujo estado alterna entre live e paused (via `pauseThread`/`resumeThread`),
When `getSessionChat` é chamado em cada estado,
Then o payload retorna `composerMode: 'DIRECT'` quando `paused === false` e `composerMode: 'STEER'` quando `paused === true`.

**US-3 — Turno de whisper não tenta forkar issue**
Given um turno de orquestrador do stub (`E2eStubAgentRunner`) disparado por um item de mailbox de whisper, sem `entryId` nas claims do run token,
When `E2eMcpDriver.forkIssue` é chamado para esse turno,
Then a chamada retorna `[]` sem invocar `ForkIssueController` sobre o MCP, e o item de mailbox correspondente não sofre retry por esse motivo.

**US-4 — Suíte e2e completa verde**
Given os três arquivos corrigidos (`05-whisper-direct.spec.ts`, `04-inbound-issue.spec.ts`, `E2eMcpDriver.ts`),
When `cd packages/e2e && bun run test` roda a suíte inteira,
Then o processo sai com código 0 e nenhum spec falha por starvation ou por asserção de `composerMode`/rejeição obsoleta.

## Acceptance Criteria

- [ ] AC-1: `packages/e2e/tests/05-whisper-direct.spec.ts` não contém nenhuma chamada `.rejects.toThrow()` associada a `steerThread`/`sendDirectMessage` — ambos os modos são aceitos em live e em paused.
- [ ] AC-2: `packages/e2e/tests/05-whisper-direct.spec.ts` assevera `composerMode === 'DIRECT'` quando a sessão está live (`paused === false`) e `composerMode === 'STEER'` quando está paused (`paused === true`).
- [ ] AC-3: docstring de `packages/e2e/tests/05-whisper-direct.spec.ts` não cita `assertCanSteer` nem `assertCanSendDirect`.
- [ ] AC-4: `packages/e2e/tests/04-inbound-issue.spec.ts` assevera `chat.composerMode === 'DIRECT'` no ponto em que a sessão está live (linha correspondente à antiga 104-105).
- [ ] AC-5: `packages/api/typescript/src/agent/mcp/E2eMcpDriver.ts#forkIssue` retorna `[]` sem chamar `this.call(...)` quando `claims.entryId` está ausente — verificável tanto por teste direto do driver (se existir suíte própria) quanto pelo comportamento observado no AC-6.
- [ ] AC-6: `cd packages/e2e && bun run test` roda a suíte completa (todos os specs, `04` e `05` inclusos) e sai com exit code 0.
- [ ] AC-7: `04-inbound-issue.spec.ts` rodado isoladamente (`bun scripts/run-e2e.ts` filtrado a esse arquivo, ou equivalente do runner) também sai com exit code 0, confirmando que não há starvation residual mesmo isolado.

## O que sobe pro template

Nenhuma skill, rail, registry ou core é afetado por este chore. É uma correção pontual em três arquivos de produto (`packages/e2e/tests/05-whisper-direct.spec.ts`, `packages/e2e/tests/04-inbound-issue.spec.ts`, `packages/api/typescript/src/agent/mcp/E2eMcpDriver.ts`) que não introduz padrão novo nem generaliza comportamento reutilizável fora do codedm — não há candidato a `.claude/skills/` ou `.claude/registry.yaml`.
