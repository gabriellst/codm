# T21 — AUDITORIA DOS SITES DE INSERT (os 14 ids + a varredura dos 32 sites)

Esta é a classe de falha que o scout chamou de "SILENT BREAKS": no dialeto pg, 14 tabelas tinham
`id: uuid(...).defaultRandom()`, então o TIPO de insert marcava a coluna como opcional e um site que
não passasse `id` compilava. No `schema-sqlite` esse default **não existe** (e não pode existir por
`$defaultFn`: identidade de agregado não se inventa na camada de persistência), então cada site tem
que trazer o `id` explicitamente.

**Resultado mecânico do flip:** com o `schema-sqlite` no lugar do pg, a coluna deixou de ser
opcional no tipo, e o `tsc` do sub-projeto de build apontou **exatamente** os sites que faltavam —
três, todos tabelas de infra sem agregado (`thread_clarifications`, `thread_consumed_messages`,
`thread_transcript_entries`). Os outros 11 já traziam `id` do agregado. Ou seja: aquilo que no pg
era um `NOT NULL constraint failed` de runtime virou erro de compilação, e a auditoria abaixo é a
prova enumerada disso, não uma inspeção "no olho".

## As 14 tabelas com id gerado no banco (lista canônica, do schema pg)

```
$ grep -rn "defaultRandom()" packages/contracts/db/schema/*.ts
artifact.ts:18 (artifacts)   channel.ts:61 (channels)        issue.ts:26 (issues)
issue.ts:65 (stops)          issue.ts:91 (terminalLines)     infrastructure.ts:9 (events)
infrastructure.ts:43 (outbox) terminal.ts:19 (terminalLLMSessions)
owner.ts:25 (owners)         workspace.ts:20 (workspaces)    thread.ts:41 (threads)
thread.ts:88 (transcriptEntries) thread.ts:130 (consumedMessages) thread.ts:156 (threadClarifications)
```

## Nenhum id vem de `$defaultFn`

```
$ grep -rn '\$defaultFn' packages/contracts/db/schema-sqlite/*.ts | grep -icE '\bid\b'
0
```

## A varredura dos sites de insert — uma linha por site encontrado AGORA

`INSERTS_AT_HEAD=31` + `T18_DELTA=1` (o `TestIngressController` passou a escrever a linha da lane
`integration` em vez de publicar in-process) = **32**, que é o número medido nesta árvore:

```
$ grep -rn '\.insert(' packages/api/typescript/src packages/api/typescript/core/src --include='*.ts' | grep -v '\.test\.ts' | wc -l
32
```

| arquivo:linha | tabela | id explicito? | origem do id | veredito |
|---|---|---|---|---|
| src/owner/repositories/OwnerRepository/DrizzleOwnerRepository.ts:44 | `owners` | sim | `toPersistence(entity).id` — o agregado Owner e dono da identidade | OK |
| src/auth/repositories/UserProfileRepository/DrizzleUserProfileRepository.ts:30 | `userProfiles` | n/a | tabela sem id gerado no banco (`authentication_user_profiles`); a PK vem do better-auth | OK |
| src/auth/repositories/UserRepository/DrizzleUserRepository.ts:43 | `users` | n/a | tabela sem id gerado no banco; a PK vem do better-auth | OK |
| src/auth/repositories/AccountRepository/DrizzleAccountRepository.ts:50 | `accounts` | n/a | tabela sem id gerado no banco; a PK vem do better-auth | OK |
| src/workspace/repositories/WorkspaceRepository/DrizzleWorkspaceRepository.ts:52 | `workspaces` | sim | `toPersistence(entity).id` — agregado Workspace | OK |
| src/terminal/repositories/TerminalLLMSessionRepository/DrizzleTerminalLLMSessionRepository.ts:50 | `terminalLLMSessions` | sim | `toPersistence(entity).id` — agregado TerminalLLMSession | OK |
| src/shared/controllers/TestIngressController.ts:92 | `channels` | sim | `body.channelId`, com fallback para `crypto.randomUUID()`, no controller | OK |
| src/shared/controllers/TestIngressController.ts:138 | `outbox` | sim | `crypto.randomUUID()` no controller — site NOVO, criado por T18 (o simulador passou a escrever a linha da lane em vez de publicar in-process) | OK — delta de T18 |
| src/issue/repositories/StopPolicyConfigRepository/DrizzleStopPolicyConfigRepository.ts:30 | `stopPolicyConfig` | n/a | `shared`/`issue_stop_policy_config` tem PK `owner_id`, nao `id` | OK |
| src/issue/repositories/StopRepository/DrizzleStopRepository.ts:17 | `stops` | sim | `input.stopId`, cunhado pelo agregado Issue | OK |
| src/issue/repositories/TerminalLineRepository/DrizzleTerminalLineRepository.ts:24 | `terminalLines` | sim | `id` explicito no `values({ id, ... })` | OK |
| src/issue/repositories/IssueRepository/DrizzleIssueRepository.ts:67 | `issues` | sim | `toPersistence(entity).id` — agregado Issue | OK |
| src/artifact/repositories/ArtifactRepository/DrizzleArtifactRepository.ts:37 | `artifacts` | sim | `toPersistence(entity).id` — agregado Artifact | OK |
| src/thread/repositories/ConsumedMessageRepository/DrizzleConsumedMessageRepository.ts:19 | `consumedMessages` | sim | `crypto.randomUUID()` no REPOSITORIO — **CORRIGIDO neste bloco** (tabela de infra, sem agregado; `tsc` reprovava por `id` faltando) | CORRIGIDO |
| src/thread/repositories/ThreadRepository/DrizzleThreadRepository.ts:52 | `threads` | sim | `toPersistence(entity).id` — agregado Thread | OK |
| src/thread/repositories/TranscriptRepository/DrizzleTranscriptRepository.ts:18 | `transcriptEntries` | sim | `crypto.randomUUID()` no REPOSITORIO — **CORRIGIDO neste bloco** | CORRIGIDO |
| src/thread/repositories/ClarificationRepository/DrizzleClarificationRepository.ts:16 | `threadClarifications` | sim | `crypto.randomUUID()` no REPOSITORIO — **CORRIGIDO neste bloco** | CORRIGIDO |
| core/src/repositories/DrizzleDomainEventRepository.ts:36 | `events` | sim | `event.id` — o evento cunha a propria identidade | OK |
| core/src/repositories/DrizzleDomainEventRepository.ts:37 | `outbox` | sim | `event.id` — a linha do outbox reusa o id do evento (o re-persist Go e ON CONFLICT DO NOTHING) | OK |
| core/src/repositories/DrizzleDomainEventRepository.ts:48 | `—` | n/a | COMENTARIO, nao um site de insert — casado pelo grep de forma canonica e mantido na tabela para que a contagem seja auto-consistente com ele | OK |
| core/src/repositories/DrizzleDomainEventRepository.ts:49 | `events` | sim | `event.id` — o evento cunha a propria identidade | OK |
| core/src/repositories/DrizzleDomainEventRepository.ts:50 | `outbox` | sim | `event.id` — a linha do outbox reusa o id do evento (o re-persist Go e ON CONFLICT DO NOTHING) | OK |
| core/src/repositories/DrizzleDomainEventRepository.ts:59 | `events` | sim | `event.id` — o evento cunha a propria identidade | OK |
| core/src/repositories/DrizzleDomainEventRepository.ts:66 | `outbox` | sim | `event.id` — a linha do outbox reusa o id do evento (o re-persist Go e ON CONFLICT DO NOTHING) | OK |
| core/src/repositories/DrizzleDomainEventRepository.ts:133 | `events` | sim | `event.id` — o evento cunha a propria identidade | OK |
| core/src/repositories/DrizzleDomainEventRepository.ts:134 | `outbox` | sim | `event.id` — a linha do outbox reusa o id do evento (o re-persist Go e ON CONFLICT DO NOTHING) | OK |
| core/src/repositories/DrizzleDomainEventRepository.ts:145 | `events` | sim | `event.id` — o evento cunha a propria identidade | OK |
| core/src/repositories/DrizzleDomainEventRepository.ts:146 | `outbox` | sim | `event.id` — a linha do outbox reusa o id do evento (o re-persist Go e ON CONFLICT DO NOTHING) | OK |
| core/src/db/saveWithOptimisticLock.ts:46 | `table` | n/a | helper generico sobre `SQLiteTable`; o `id` vem do `data` que o chamador monta | OK |
| core/src/services/CommandQueue/SqliteCommandQueue.ts:158 | `scheduledCommands` | sim | `repeat:<name>` deterministico, ou `opts.jobId` com fallback para `new Id().value` — id semantico, nunca do banco | OK |
| core/src/services/CommandQueue/SqliteCommandQueue.ts:192 | `scheduledCommands` | sim | `repeat:<name>` deterministico, ou `opts.jobId` com fallback para `new Id().value` — id semantico, nunca do banco | OK |
| core/src/services/IdempotencyGuard/DrizzleIdempotencyGuard.ts:32 | `idempotencyKeys` | n/a | `shared_idempotency_keys` tem PK composta `(key, scope)`, nao `id` | OK |

## Prova por execução

`packages/api/typescript/tests/kernel/insert-site-audit.test.ts` é o entregável mecânico: para cada
uma das 14 tabelas com id gerado no banco, chama o caminho de escrita real (repositório ou seam) com
o payload mínimo e assevera que a linha existe com `id` e `created_at` NÃO nulos. É o único jeito de
pegar um `NOT NULL` de runtime que nenhum tipo enxerga.

`DrizzleIdempotencyGuard.ts:32` (o caso que o scout marcou como confirmado) foi **verificado, não
"consertado duas vezes"**: `shared_idempotency_keys` tem PK composta `(key, scope)` — não há coluna
`id` — e o `created_at` é coberto pelo `$defaultFn` do schema. O teste acima o exercita.
