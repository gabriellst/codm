# Frente B3 — semântica de ativação (comando durável, publicação transacional) — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle.

**Goal:** A entrega de mensagem no canal deixa de ser um evento-comando em memória e passa a ser um comando durável do `CommandQueue` enfileirado na MESMA transação do transcript (com retry real), e `ExternalMediator.publish()` deixa de ser alias de `dispatch()` e passa a PERSISTIR o integration event na lane `integration` do outbox, entregue pelo poller — fechando a regra de intenção nas skills TS e Go.

**Architecture:** Três cortes sequenciados na ordem obrigatória da spec (Risks & Migration). (1) `CommandQueue`: `SendDirectMessage` e o novo use case `RecordOrchestratorReply` enfileiram `deliver_channel_message` com `enqueueCommand(..., tx)` dentro da transação que grava o transcript; `DeliverChannelMessage` deixa de ser `EventHandler` e vira o use case executor, registrado no queue por um novo campo `commandHandlers` do `BoundedContext` (que só ativa o helper estático `CommandQueue.registerCommandHandler`, hoje sem call site). (2) Só então o contrato `ChannelDeliveryRequestedEvent` morre no `.tsp` e o Contract Lock regenera wire/openapi/SDK. (3) Só então o transporte: `SqlExternalMediator.publish()` persiste via `saveIntegrationEvent` (cuja linha de outbox passa a nascer na lane `integration`) e não despacha nada na call stack do chamador — a entrega é sempre de `drainOnce`. (4) A regra de intenção entra no `.claude/registry.yaml` e nas skills `event`/`handler`/`usecase`, com par TS **e** Go instanciando a convenção de cada linguagem.

**Tech Stack:** TypeScript, Bun, Drizzle (SQLite/libsql), tsyringe-neo, Zod, TypeSpec (contracts), Go (paridade de skill)

**Spec:** .specs/2026-07-29-activation-semantics-design.md
**Tasks:** 7
**Estimated minutes:** 275

---

## Inventário (rodada de pesquisa TS+Go)

Decisão 9 da spec (obrigatória antes de fechar tarefas). Rodada executada; cada item é corrigido nesta frente ou registrado como fora-de-escopo consciente.

### TS — `ExternalMediator.publish` (13 call sites de produção)

| # | Call site | Veredito |
|---|---|---|
| 1 | `src/workspace/handlers/PublishWorkspaceIntegrationEvents.ts:22` | CONFORME — publisher nomeado do contexto |
| 2-6 | `src/agent/handlers/PublishAgentIntegrationEvents.ts:56,74,92,111,127` | CONFORME — 5 branches, publisher nomeado |
| 7-8 | `src/issue/handlers/PublishIssueIntegrationEvents.ts:23,32` | CONFORME |
| 9 | `src/artifact/handlers/PublishArtifactIntegrationEvents.ts:16` | CONFORME |
| 10 | `src/thread/handlers/PublishThreadIntegrationEvents.ts:31` (`thread.attached`) | CONFORME — permanece |
| 11 | `src/thread/handlers/PublishThreadIntegrationEvents.ts:36` (`direct_message_sent` → delivery) | **MORRE** — decisão 3 (T2): a tradução vira `enqueueCommand` dentro de `SendDirectMessage` |
| 12 | `src/thread/handlers/DeliverOrchestratorReply.ts:69` | **VIOLA** — handler de domínio publicando integração; morre com a decisão 2 (T3) |

Fora de escopo, com o porquê (infra/teste, nunca autoram um fato de domínio):
- `core/src/services/Mediator/SpyMediator.ts:36` — espião de teste que FORWARDA `publish` ao mediator interno; não é publicador (não constrói evento nenhum).
- `core/src/services/Mediator/SqlExternalMediator.test.ts:223` — asserta a mecânica ANTIGA do mediator ("the OUTBOUND path writes NO row"); é exatamente o teste que T5 reescreve (falseador 1).
- `core/src/services/Mediator/EventEmitter2Mediator.test.ts:95,113` — asserta fan-out do double em memória; a decisão 4 muda a semântica do `SqlExternalMediator`, não do EventEmitter2 (paridade por env: ver Notes).

Consumidor único que DECIDE: `DeliverChannelMessage` (branch por `author` + claim do ledger exactly-once) — por isso vira o **executor do comando**, não desaparece.

### GO — `ExternalMediator.Publish` (26 itens, ZERO violações)

A convenção Go **já existe e é diferente da TS**: um handler POR EVENTO com sufixo `*IntegrationHandler`, todos em `internal/channel/handlers/*.go`, registrados nominalmente em `internal/channel/module.go:339-407`; zero publish fora de handlers. O mediator Go na lane `integration` é construído EGRESS-ONLY (`NewSqlExternalMediatorWithoutIngress`), logo o TS segue sendo o único claimant da lane.

A regra agnóstica — *publicação de integração só em publicadores nomeados; todo outro handler é domínio puro* — se instancia assim:
- **TS:** `Publish<Ctx>IntegrationEvents`, um por CONTEXTO, com união/`instanceof` sobre os fatos do contexto.
- **Go:** `<Event>IntegrationHandler`, um por EVENTO, sob `internal/<ctx>/handlers/`, registrado nominalmente em `module.go`.

As Tasks de skill (T6) codificam ISSO — nenhuma força o shape TS no Go.

### Decisão 7 (registrada, zero código)

Os ~20 integration events do Go sem consumidor TS ficam fora do escopo: sem handler registrado, o claim (`name IN (...)`) nem os toca, exatamente como hoje.

---

## Task T1: A entrega de mensagem no canal é um comando durável com retry

**Files to write:**
- Create: `packages/api/typescript/src/thread/usecases/DeliverChannelMessage.ts`
- Test: `packages/api/typescript/src/thread/usecases/DeliverChannelMessage.test.ts`
- Delete: `packages/api/typescript/src/thread/handlers/DeliverChannelMessage.ts`
- Delete: `packages/api/typescript/src/thread/handlers/DeliverChannelMessage.test.ts`
- Modify: `packages/api/typescript/core/src/types/BoundedContext.ts` — novo campo `commandHandlers` + `registerCommandHandlers` (ativa o helper estático já existente)
- Modify: `packages/api/typescript/src/thread/handlers/external.ts` — sai o export do handler morto (3 linhas)
- Modify: `packages/api/typescript/src/thread/index.ts` — passa `commandHandlers: { DeliverChannelMessage }`
- Modify: `packages/api/typescript/src/thread/usecases/index.ts` — export do novo use case (1 linha, auto-wired pelo `bun cli`)
- Modify: `packages/api/typescript/src/thread/services/ChannelSender/GatewayChannelSender.ts` — o comentário falso sobre "the outbox will retry it" (2 linhas)

**Files to read:**
- `packages/api/typescript/core/src/services/CommandQueue/SqliteCommandQueue.ts` — claim/lease/backoff que o teste dirige por `tick()`
- `packages/api/typescript/tests/kernel/SqliteCommandQueue.test.ts` — o molde determinístico (registrar → `stopPolling()` → `tick()`, "o tempo passa" = rebobinar `run_at`)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /test, /handler
**Depends on:** (none)
**Gate:** `cd packages/api/typescript && bun test src/thread/usecases/DeliverChannelMessage.test.ts && bun x tsc -p tsconfig.build.json --noEmit` — exit 0 nos dois

### Step T1.1 — Scaffold do use case executor

```bash
bun cli usecase thread DeliverChannelMessage
```

Expected: cria `packages/api/typescript/src/thread/usecases/DeliverChannelMessage.ts` + `.test.ts` colocado e insere o export em `usecases/index.ts`.

### Step T1.2 — O teste que falha (migrado do handler + FALSEADOR do retry)

Test `packages/api/typescript/src/thread/usecases/DeliverChannelMessage.test.ts` — COMPLETE final file (sobrescreve o co-emitido pelo scaffold):

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { scheduledCommands } from '@codedm/contracts/db'
import { DrizzleClient, DrizzleDatabaseDriver, MockLoggingService, SqliteCommandQueue } from '@codedm/core-typescript'
import { TestBed, givenThread } from '@test/support'
import { MessageAuthor } from '@codedm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { DeliverChannelMessage } from './DeliverChannelMessage'
import { ChannelSender, MockChannelSender, type SendChannelMessageInput } from '../services/ChannelSender'
import { ConsumedMessageRepository } from '../repositories/ConsumedMessageRepository'

/**
 * The delivery leg, now a COMMAND (B3, decision 2) — and the two properties that made it worth moving.
 *
 * 1. THE LOOP MUST NOT OPEN. WhatsApp echoes back everything this account sends, and the gateway
 *    bridges from-me messages INBOUND. The send returns the platform message id; we write it into the
 *    same exactly-once ledger `ConsumeInboundMessage` consults FIRST, so the echo is a redelivery that
 *    dies before any thread lookup. Unchanged from the EventHandler this replaces.
 * 2. A FAILED SEND IS RETRIED. This is the new one, and the reason the event died: as an integration
 *    event the delivery rode `ExternalMediator.publish`, which wrote NOTHING — a dead gateway lost the
 *    message with no retry and no trace. As a command it is a row in `shared_scheduled_commands`, and
 *    the last case here proves the retry against the real queue.
 */
describe('DeliverChannelMessage — the reply leaves, its echo cannot come back as speech, and a failed send is retried', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let db: DrizzleClient
	let driver: DrizzleDatabaseDriver

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
		db = testBed.resolve(DrizzleClient)
		driver = testBed.resolve(DrizzleDatabaseDriver)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const command = (channelId: string, contactExternalId: string, author: MessageAuthor) => ({
		ownerId: OPERATOR_ID,
		channelId,
		contactExternalId,
		text: 'here you go',
		author,
	})

	const rowById = async (id: string) => (await db.select().from(scheduledCommands).where(eq(scheduledCommands.id, id)))[0]

	// Writes go through the driver's write seam — `db` is the READ connection.
	const rewindRunAt = async (id: string) =>
		driver.transaction(tx =>
			tx
				.update(scheduledCommands)
				.set({ runAt: new Date(Date.now() - 1_000) })
				.where(eq(scheduledCommands.id, id)),
		)

	it('sends through the channel seam, carrying the owner explicitly', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const sender = new MockChannelSender()
		testBed.override(ChannelSender, sender)

		await testBed.resolve(DeliverChannelMessage).execute(command(thread.channelId, thread.contactRef.externalId, MessageAuthor.SYSTEM))

		expect(sender.sent).toHaveLength(1)
		expect(sender.sent[0]).toMatchObject({
			channelId: thread.channelId,
			remoteId: thread.contactRef.externalId,
			text: 'here you go',
			ownerId: OPERATOR_ID,
		})
	})

	it('CLAIMS its own outgoing message, so the echo is a redelivery rather than speech', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		testBed.override(ChannelSender, new MockChannelSender())
		const ledger = testBed.resolve(ConsumedMessageRepository)

		await testBed.resolve(DeliverChannelMessage).execute(command(thread.channelId, thread.contactRef.externalId, MessageAuthor.SYSTEM))

		const ourId = 'mock-wamid-1'
		expect(await ledger.has(thread.channelId, ourId)).toBe(true)
		// THE LOOP PROOF, expressed the way the inbound consumer expresses it: its FIRST act is `claim`,
		// and a second claim on an already-claimed id returns false — so the echo stops before any thread
		// lookup, transcript write or classification.
		expect(await ledger.claim({ ownerId: OPERATOR_ID, channelId: thread.channelId, platformMessageId: ourId })).toBe(false)
	})

	it('does NOT claim a message a human composed — the owner speaking is not the product speaking', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		testBed.override(ChannelSender, new MockChannelSender())

		await testBed.resolve(DeliverChannelMessage).execute(command(thread.channelId, thread.contactRef.externalId, MessageAuthor.HUMAN))

		expect(await testBed.resolve(ConsumedMessageRepository).has(thread.channelId, 'mock-wamid-1')).toBe(false)
	})

	it('FALSEADOR — a failed send is RETRIED from the queue: the command survives, backs off, and delivers on the next tick', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

		// A gateway that is down exactly once. `GatewayChannelSender` turns any transport failure into a
		// throw, which is all the queue needs to see.
		const sent: SendChannelMessageInput[] = []
		let failNext = true
		testBed.override(ChannelSender, {
			async send(input: SendChannelMessageInput) {
				if (failNext) {
					failNext = false
					throw new Error('gateway down')
				}
				sent.push(input)
				return { messageId: 'wamid-after-retry' }
			},
		} as ChannelSender)

		const queue = new SqliteCommandQueue(driver, new MockLoggingService())
		await queue.registerCommandHandler(testBed.resolve(DeliverChannelMessage))
		queue.stopPolling() // this test drives tick() deterministically — no background interval

		await queue.enqueueCommand<DeliverChannelMessage>(
			'deliver_channel_message',
			command(thread.channelId, thread.contactRef.externalId, MessageAuthor.SYSTEM),
			{ jobId: 'job-delivery' },
		)

		// Attempt 1: the gateway is down. NOTHING IS LOST — the row stays, one attempt charged, backed off
		// into the future, not dead-lettered. On the old path (publish → in-memory dispatch) there was no
		// row at all: the message was gone.
		await queue.tick()
		expect(sent).toHaveLength(0)
		const backedOff = await rowById('job-delivery')
		expect({
			attempts: backedOff?.attempts,
			dead: backedOff?.deadAt ?? null,
			runsInFuture: (backedOff?.runAt.getTime() ?? 0) > Date.now(),
		}).toEqual({ attempts: 1, dead: null, runsInFuture: true })

		// "Time passes" — the backoff expires and the SAME command runs again, this time reaching the channel.
		await rewindRunAt('job-delivery')
		await queue.tick()
		expect(sent).toHaveLength(1)
		expect(sent[0]).toMatchObject({ channelId: thread.channelId, text: 'here you go' })
		expect(await rowById('job-delivery')).toBeUndefined() // one-shot consumed → gone

		await queue.close()
	})
})
```

### Step T1.3 — Rodar o teste e ver o vermelho

Run: `cd packages/api/typescript && bun test src/thread/usecases/DeliverChannelMessage.test.ts`
Expected: FAIL — o scaffold do Step T1.1 existe mas ainda é esqueleto: os 4 casos falham por `execute` não implementado / `deliver_channel_message` inexistente.

### Step T1.4 — Proposed file: Create `packages/api/typescript/src/thread/usecases/DeliverChannelMessage.ts`

```typescript
import { injectable } from 'tsyringe-neo'
import { Handler, LoggingService, z } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { MessageAuthor } from '@codedm/contracts-typescript/wire/enums'
import { ChannelSender } from '../services/ChannelSender'
import { ConsumedMessageRepository } from '../repositories/ConsumedMessageRepository'

export const DeliverChannelMessageInputSchema = z.object({
	// The gateway scopes every write by owner and must never be handed a forged one — so the owner is
	// VALIDATED here rather than defensively dropped downstream (the shape the EventHandler had to use,
	// because an envelope owner is optional at the wire).
	ownerId: z.uuid(),
	channelId: z.string(),
	contactExternalId: z.string(),
	text: z.string().min(1),
	author: z.enum(MessageAuthor),
	// Both fields travel because the PRODUCERS resolve them (F1's inverse lookup:
	// `RecordOrchestratorReply` turns an entry id into the platform id a WhatsApp quote needs, and the
	// entry the outbound message IS). This executor's use of them is UNCHANGED from the EventHandler it
	// replaces — the gateway send has never received the quote. Fixing that is a behaviour change B3
	// does not make; it is registered as an observation in the plan's Notes.
	quotedMessageId: z.string().optional(),
	replyEntryId: z.string().optional(),
})

export const DeliverChannelMessageOutputSchema = z.void()

/**
 * The delivery leg — the one that makes "the agent answers" mean "answers in WhatsApp".
 *
 * ### Why a COMMAND and not an event (B3, decision 2)
 * `integration.channel.delivery_requested` modelled "put this text on the channel" as a fact anyone
 * could react to, but there was exactly one consumer and it did not react to anything — it EXECUTED.
 * Worse, the transport carrying it (`SqlExternalMediator.publish`) wrote no row, so the retry the name
 * promised never existed: a dead gateway or a dead process lost the message silently. As a command it
 * is a durable row in `shared_scheduled_commands`, enqueued in the SAME transaction as the transcript
 * entry that motivates it, retried by the `CommandQueue` worker (3 attempts, exponential backoff, 60s
 * lease) and dead-lettered — never dropped.
 *
 * ### THE LOOP, and the three things standing in its way
 * WhatsApp echoes back everything this account sends, and the gateway bridges from-me messages
 * INBOUND (that is how the owner's own words are heard). So a reply we send returns as speech, and a
 * consumer that cannot recognise it answers itself, forever.
 *
 *   1. THE CLAIM, and it is the structural one. The send returns the platform message id; we write it
 *      into the same exactly-once ledger `ConsumeInboundMessage` consults FIRST. When the echo arrives
 *      — from either Go emission site, both carrying that id — `claim` finds the row and the whole
 *      handler is a no-op before any thread lookup.
 *   2. THE AUTHOR. A SYSTEM message is the product speaking; recording it under the ledger is what
 *      makes the id known. A HUMAN message is the owner's own speech — claiming it would make the
 *      transcript miss the words they actually said on the channel.
 *   3. THE MENTION GATE. An echoed reply carries no citation, so `Thread.canInvoke` refuses it. The
 *      WEAKEST of the three, which is why it is listed last and not relied on.
 *
 * RESIDUAL, stated rather than hidden: the claim is written AFTER the send returns, so there is a
 * window of one HTTP round-trip in which the gateway's outbox poll could publish the echo first. The
 * structural fix is to pre-mint the message id before the wire call; that is a gateway change and is
 * deliberately not bundled here. Until then layer 3 covers the window.
 */
@injectable()
export class DeliverChannelMessage extends Handler<typeof DeliverChannelMessageInputSchema, typeof DeliverChannelMessageOutputSchema> {
	readonly name = 'deliver_channel_message' as const
	readonly inputSchema = DeliverChannelMessageInputSchema
	readonly outputSchema = DeliverChannelMessageOutputSchema

	constructor(
		private readonly sender: ChannelSender,
		private readonly consumed: ConsumedMessageRepository,
		private readonly logging: LoggingService,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		const { ownerId, channelId, contactExternalId, text, author } = input

		// EXTERNAL I/O OUTSIDE ANY TRANSACTION — the sanctioned shape (cc-bp-24's named exception):
		// holding the single SQLite write lock across an HTTP round-trip would block every other writer,
		// and a failure here must roll nothing back. The queue's lease IS the retry.
		const { messageId } = await this.sender.send({ channelId, remoteId: contactExternalId, text }, ownerId)

		// LAYER 1 — claim our own message before its echo can be heard. `claim` is the same
		// `INSERT ... ON CONFLICT DO NOTHING` the inbound consumer runs first, so the echo returns `false`
		// there and the handler stops before touching a thread. Idempotent by construction: a retried
		// command re-claims the same id and the conflict makes it a no-op.
		if (author === MessageAuthor.SYSTEM) {
			await this.withTransaction(tx, tx => this.consumed.claim({ ownerId, channelId, platformMessageId: messageId }, tx))
		}

		this.logging.info({ content: { message: 'channel message delivered', channelId, messageId, author } })
	}
}
```

### Step T1.5 — Delete o EventHandler e seu teste; tire o export do barrel

```bash
git rm packages/api/typescript/src/thread/handlers/DeliverChannelMessage.ts \
       packages/api/typescript/src/thread/handlers/DeliverChannelMessage.test.ts
```

Modify `packages/api/typescript/src/thread/handlers/external.ts`: remova as três linhas do bloco `DeliverChannelMessage` (o comentário "The delivery leg: `integration.channel.delivery_requested` → the gateway's send. One consumer for every producer that has something to say on the channel." e o `export { DeliverChannelMessage } from './DeliverChannelMessage'`). Os exports de `ConsumeInboundMessage` e `DeliverOrchestratorReply` ficam intactos.

### Step T1.6 — O seam de registro: `commandHandlers` no `BoundedContext`

Modify `packages/api/typescript/core/src/types/BoundedContext.ts`, três edições pontuais (arquivo de framework — a Task não o reescreve):

1. Em `BoundedContextOptions`, logo depois de `projectors?: Record<string, new (...args: any[]) => Projector>`, adicione:

```typescript
	/**
	 * One-shot COMMAND executors — the consumer half of `CommandQueue.enqueueCommand(...)`. Registered
	 * on the queue so THIS process executes them. Unlike `jobs`, NOTHING is enqueued at boot: the
	 * producer enqueues inside the transaction of the fact that motivates the command (the durable
	 * alternative to an integration event whose only consumer executes an action).
	 */
	commandHandlers?: HandlerRecord
```

2. Em `create()`, imediatamente após `await BoundedContext.registerJobs(container, options.jobs)`, adicione:

```typescript
		await BoundedContext.registerCommandHandlers(container, options)
```

3. Depois do método `registerJobs`, adicione:

```typescript
	private static async registerCommandHandlers(container: DependencyContainer, options: BoundedContextOptions): Promise<void> {
		if (!options.commandHandlers) return

		// Same guard as registerJobs: spec emission (emit-openapi / bun sdk) imports the composition root
		// ONLY to collect routers, and registering a command handler STARTS the queue's poller against a
		// database emission has no business opening.
		if (process.env.EMIT_OPENAPI === 'true') return

		const commandQueue = container.resolve(CommandQueue as any) as CommandQueue
		// The static helper resolves + binds each handler's container and registers it — it has existed
		// since the queue was written and this is its first call site.
		await CommandQueue.registerCommandHandler(container, commandQueue, options.commandHandlers)
	}
```

### Step T1.7 — Proposed file: Modify `packages/api/typescript/src/thread/index.ts`

```typescript
import { BoundedContext } from '@codedm/core-typescript'
import { CONTEXT_NAMES } from '@shared/contexts'
import * as controllers from './controllers'
import { INSTANCE_REGISTRY } from './registry'
import * as internalHandlers from './handlers/internal'
import * as externalHandlers from './handlers/external'
import { DeliverChannelMessage } from './usecases/DeliverChannelMessage'

const ctx = await BoundedContext.create({
	name: CONTEXT_NAMES.thread,
	controllers,
	internalHandlers,
	externalHandlers,
	registry: INSTANCE_REGISTRY,
	// THE DELIVERY EXECUTOR (B3, decision 2). Without this line the whole path is inert in the way that
	// is hardest to notice: producers enqueue, tsc is green, every unit test passes, and no message ever
	// reaches the channel. Registering it also STARTS the queue's poller in this process.
	commandHandlers: { DeliverChannelMessage },
})

export default ctx.router
```

### Step T1.8 — A verdade sobre o retry no `GatewayChannelSender`

Modify `packages/api/typescript/src/thread/services/ChannelSender/GatewayChannelSender.ts`: substitua o comentário do `catch` (linhas 35-36)

de:

```
			// A dead gateway is not a bug in the thread context — it is the same GATEWAY_UNAVAILABLE the
			// proxy already surfaces, and the outbox will retry it.
```

para:

```
			// A dead gateway is not a bug in the thread context — it is the same GATEWAY_UNAVAILABLE the
			// proxy already surfaces. The RETRY is the CommandQueue's (B3): this send only runs as the
			// `deliver_channel_message` command, so a throw here backs the row off and re-executes it (3
			// attempts, then dead-letter). The old claim that "the outbox will retry it" was false — the
			// event carrying this send was never written anywhere.
```

Nenhuma outra linha do arquivo muda.

### Step T1.9 — Verde

Run: `cd packages/api/typescript && bun test src/thread/usecases/DeliverChannelMessage.test.ts`
Expected: PASS — 4 pass, 0 fail (o 4º é o falseador do retry).

Run: `cd packages/api/typescript/core && bun x tsc --noEmit`
Expected: exit 0

Run: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit`
Expected: exit 0 — o `ChannelDeliveryRequestedEvent` ainda existe (morre em T4), então nada quebra por contrato aqui.

### Step T1.10 — Commit

```bash
git add packages/api/typescript/core/src/types/BoundedContext.ts \
        packages/api/typescript/src/thread/usecases/DeliverChannelMessage.ts \
        packages/api/typescript/src/thread/usecases/DeliverChannelMessage.test.ts \
        packages/api/typescript/src/thread/usecases/index.ts \
        packages/api/typescript/src/thread/handlers/external.ts \
        packages/api/typescript/src/thread/index.ts \
        packages/api/typescript/src/thread/services/ChannelSender/GatewayChannelSender.ts
git commit -m "refactor(thread,core): B3 — a entrega no canal é um comando durável, não um evento

DeliverChannelMessage deixa de ser EventHandler de
integration.channel.delivery_requested e passa a ser o use case executor do
CommandQueue ('deliver_channel_message'), registrado pelo novo campo
commandHandlers do BoundedContext — que só ativa o helper estático
CommandQueue.registerCommandHandler, sem call site desde que a fila foi escrita.

FALSEADOR executado (AC-4): com o gateway falhando uma vez, a linha em
shared_scheduled_commands sobrevive com attempts=1, run_at no futuro e sem
dead_at, e o tick seguinte entrega. No caminho antigo não havia linha alguma —
publish() não escrevia nada e a mensagem se perdia em silêncio.

O comentário do GatewayChannelSender que afirmava 'the outbox will retry it'
passa a dizer a verdade: o retry é da fila."
```

---

## Task T2: O operador fala e a mensagem sobrevive ao crash do processo

**Files to write:**
- Modify: `packages/api/typescript/src/thread/usecases/SendDirectMessage.ts` — arquivo inteiro abaixo (enfileira o comando na mesma tx)
- Test: `packages/api/typescript/src/thread/usecases/SendDirectMessage.test.ts`
- Modify: `packages/api/typescript/src/thread/handlers/PublishThreadIntegrationEvents.ts` — arquivo inteiro abaixo (sai a branch de delivery)
- Modify: `packages/api/typescript/src/thread/events/DirectMessageSentEvent.ts` — docblock: o fato fica só como registro auditável (2 linhas)

**Files to read:**
- `packages/api/typescript/src/thread/usecases/IngestChannelMessage.ts` — o molde da casa para "enfileirar DENTRO da transação do fato que motiva" (o `mailbox.enqueue(..., tx)` das linhas 84-101)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /handler, /test
**Depends on:** T1
**Consumes (frozen):** `DeliverChannelMessage` (classe), `'deliver_channel_message'` (nome do comando), `DeliverChannelMessageInputSchema` (`{ ownerId, channelId, contactExternalId, text, author, quotedMessageId?, replyEntryId? }`), `CommandQueue.enqueueCommand(name, input, opts?, tx?)`
**Scope fence:** DONE em T1 (consumir, nunca redefinir): o executor, o schema do comando e o registro no `BoundedContext`. OUT: a resposta do orquestrador (T3), a remoção do `.tsp` (T4), a semântica de `publish()` (T5).
**Gate:** `cd packages/api/typescript && bun test src/thread/usecases/SendDirectMessage.test.ts && bun x tsc -p tsconfig.build.json --noEmit`

### Step T2.1 — O teste que falha

Test `packages/api/typescript/src/thread/usecases/SendDirectMessage.test.ts` — COMPLETE final file:

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { scheduledCommands } from '@codedm/contracts/db'
import { DrizzleClient, DrizzleDatabaseDriver } from '@codedm/core-typescript'
import { TestBed, givenThread } from '@test/support'
import { MessageAuthor, TranscriptKind } from '@codedm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { SendDirectMessage } from './SendDirectMessage'
import { TranscriptRepository } from '../repositories/TranscriptRepository'
import { ChannelConnectivity } from '../services/ChannelConnectivity'
import { DirectMessageSentEvent } from '../events'

/**
 * C20 — the operator speaks as themselves on the channel, and B3's guarantee: the words they see in
 * their own console and the order to put them on WhatsApp are ONE transaction. Either both exist or
 * neither does. Before B3 the order was an integration event published through a transport that wrote
 * nothing: a crash (or a dead gateway) between the two lost the message with no retry and no trace.
 */
describe('SendDirectMessage — the entry and the delivery COMMAND commit together', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let db: DrizzleClient
	let driver: DrizzleDatabaseDriver

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
		db = testBed.resolve(DrizzleClient)
		driver = testBed.resolve(DrizzleDatabaseDriver)
	})
	beforeEach(async () => {
		await testBed.reset()
		// The gate this use case enforces reads the Go gateway's table, which no test has behind it.
		testBed.override(ChannelConnectivity, { isConnected: async () => true, anyConnected: async () => true } as ChannelConnectivity)
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('appends the DIRECT entry and enqueues `deliver_channel_message` with the operator as the author', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

		const { entryId } = await testBed
			.resolve(SendDirectMessage)
			.execute({ ownerId: OPERATOR_ID, threadId: thread.id.value, text: 'oi, sou eu' })

		const entries = await testBed.resolve(TranscriptRepository).recentByThread(thread.id.value, 10)
		expect(entries.find(e => e.entryId === entryId)?.kind).toBe(TranscriptKind.DIRECT)

		const [command] = await db.select().from(scheduledCommands)
		expect({ id: command?.id, name: command?.name, input: command?.input }).toEqual({
			// The jobId IS the entry id: a retried request that already committed re-enqueues the same id
			// and the queue's ON CONFLICT DO NOTHING makes it a no-op.
			id: entryId,
			name: 'deliver_channel_message',
			input: {
				ownerId: OPERATOR_ID,
				channelId: thread.channelId,
				contactExternalId: thread.contactRef.externalId,
				text: 'oi, sou eu',
				// A HUMAN wrote it — the owner typed it and we are only the courier.
				author: MessageAuthor.HUMAN,
			},
		})
	})

	it('ATOMICITY — a rolled-back transaction leaves NEITHER the transcript entry NOR the command', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const before = await testBed.probe().snapshot(['transcriptEntries', 'scheduledCommands', 'events'] as const)

		await driver
			.transaction(async tx => {
				await testBed.resolve(SendDirectMessage).execute({ ownerId: OPERATOR_ID, threadId: thread.id.value, text: 'morre junto' }, tx)
				throw new Error('the request died after the writes, before the commit')
			})
			.catch(() => {})

		expect(await testBed.probe().snapshot(['transcriptEntries', 'scheduledCommands', 'events'] as const)).toEqual(before)
	})

	it('the `thread.direct_message_sent` FACT is still recorded — it is an audit record with no consumer (decision 3)', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

		await testBed.resolve(SendDirectMessage).execute({ ownerId: OPERATOR_ID, threadId: thread.id.value, text: 'consta na auditoria' })

		const persisted = await testBed.probe().persistedEvents({ name: DirectMessageSentEvent.name, ownerId: OPERATOR_ID })
		expect(persisted).toHaveLength(1)
	})
})
```

### Step T2.2 — Rodar e ver o vermelho

Run: `cd packages/api/typescript && bun test src/thread/usecases/SendDirectMessage.test.ts`
Expected: FAIL — o primeiro caso quebra em `expect(command?.name)` recebendo `undefined` (nenhuma linha em `shared_scheduled_commands`: hoje o use case só grava transcript + evento).

### Step T2.3 — Proposed file: Modify `packages/api/typescript/src/thread/usecases/SendDirectMessage.ts`

```typescript
import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError, CommandQueue } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { MessageAuthor, TranscriptKind } from '@codedm/contracts-typescript/wire/enums'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { TranscriptRepository } from '../repositories/TranscriptRepository'
import { ChannelConnectivity } from '../services/ChannelConnectivity'
import { DirectMessageSentEvent } from '../events'
import type { DeliverChannelMessage } from './DeliverChannelMessage'
import type { ApplicationErrors } from '../errors'

export const SendDirectMessageInputSchema = z.object({ ownerId: z.uuid(), threadId: z.uuid(), text: z.string().trim().min(1) })
export const SendDirectMessageOutputSchema = z.object({ entryId: z.uuid() })

/**
 * C20 SendDirectMessage — the operator speaks as themselves on the channel. Requires the channel
 * CONNECTED. Appends a DIRECT transcript entry, records the `thread.direct_message_sent` FACT, and
 * ORDERS the delivery as a durable command — all three in one transaction.
 *
 * The order is a COMMAND, not an event (B3, decision 2): "put this text on the channel" has exactly
 * one executor and is an instruction, not a fact anyone may react to. `enqueueCommand(..., tx)` writes
 * the row inside THIS transaction, so a crash between "the operator sees their message in the console"
 * and "the message is on WhatsApp" leaves a row the CommandQueue worker reclaims. Before B3 the same
 * intent rode `thread.direct_message_sent` → `integration.channel.delivery_requested` through
 * `ExternalMediator.publish`, which persisted NOTHING: the message was lost with no retry.
 */
@injectable()
export class SendDirectMessage extends Handler<typeof SendDirectMessageInputSchema, typeof SendDirectMessageOutputSchema> {
	readonly name = 'send_direct_message' as const
	readonly inputSchema = SendDirectMessageInputSchema
	readonly outputSchema = SendDirectMessageOutputSchema

	constructor(
		private readonly threads: ThreadRepository,
		private readonly transcript: TranscriptRepository,
		private readonly connectivity: ChannelConnectivity,
		private readonly commands: CommandQueue,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const thread = await this.threads.findById(input.threadId)
		if (!thread || thread.ownerId !== input.ownerId)
			throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)
		if (!(await this.connectivity.isConnected(thread.channelId))) {
			throw new BaseError<ApplicationErrors>('CHANNEL_NOT_CONNECTED', 'the channel is not connected')
		}

		return this.withTransaction(tx, async tx => {
			const entry = await this.transcript.append(
				{ ownerId: thread.ownerId, threadId: thread.id.value, kind: TranscriptKind.DIRECT, text: input.text },
				tx,
			)

			// THE ORDER, in the SAME transaction as the entry it refers to — the same shape
			// `IngestChannelMessage` uses for the mailbox item. `jobId` is the ENTRY id, so a retried
			// request that already committed re-enqueues the same id and the queue's conflict makes it a
			// no-op instead of a second message in a real conversation.
			await this.commands.enqueueCommand<DeliverChannelMessage>(
				'deliver_channel_message',
				{
					ownerId: thread.ownerId,
					channelId: thread.channelId,
					contactExternalId: thread.contactRef.externalId,
					text: input.text,
					// A HUMAN wrote it. The owner typed it in the console and we are only the courier — which
					// is exactly the distinction `fromMe` cannot make once we can send.
					author: MessageAuthor.HUMAN,
				},
				{ jobId: entry.entryId },
				tx,
			)

			// The FACT stays (decision 3): it describes "the operator spoke on the channel" and is an
			// auditable record with NO consumer — the delivery no longer hangs off it.
			await this.domainEventRepository.save(
				new DirectMessageSentEvent({
					entityId: thread.id.value,
					ownerId: thread.ownerId,
					payload: {
						threadId: thread.id.value,
						entryId: entry.entryId,
						channelId: thread.channelId,
						contactExternalId: thread.contactRef.externalId,
						contactDisplayName: thread.contactRef.displayName,
						contactKind: thread.contactRef.kind,
						text: input.text,
					},
				}),
				tx,
			)
			return { entryId: entry.entryId }
		})
	}
}
```

### Step T2.4 — Proposed file: Modify `packages/api/typescript/src/thread/handlers/PublishThreadIntegrationEvents.ts`

```typescript
import { injectable } from 'tsyringe-neo'
import { EventHandler, ExternalMediator } from '@codedm/core-typescript'
import { ThreadAttachedEvent as ThreadAttachedIntegrationEvent } from '@codedm/contracts-typescript/wire/events'
import { ThreadAttachedEvent } from '../events/ThreadAttachedEvent'

/**
 * The thread context's NAMED EXCEPTION (B3, decision 4): the ONE handler in this context authorized to
 * call `ExternalMediator.publish()`. Every other handler here is pure domain — it reacts and invokes
 * use cases, and never publishes integration events. Facts republished as their FROZEN contracts:
 *   thread.attached → integration.thread.attached   (frozen fact; no TS consumer today — the browser
 *                                                    SSE surface forwards it, BC5 warm indexing is pending)
 *
 * The `thread.direct_message_sent` branch is GONE (decision 3): it translated a fact into
 * `integration.channel.delivery_requested`, i.e. it used an event to COMMAND. The order is now a
 * durable `deliver_channel_message` command enqueued inside `SendDirectMessage`'s own transaction, and
 * the fact stays as an audit record with no consumer.
 *
 * The subscription stays a readonly TUPLE rather than collapsing to a single class: this is the
 * context's publisher, one per CONTEXT by design, and B5 adds the next fact to it.
 */
@injectable()
export class PublishThreadIntegrationEvents extends EventHandler<readonly [typeof ThreadAttachedEvent]> {
	readonly event = [ThreadAttachedEvent] as const

	constructor(private readonly mediator: ExternalMediator) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const ownerId = event.ownerId ?? ''

		if (event instanceof ThreadAttachedEvent) {
			await this.mediator.publish(new ThreadAttachedIntegrationEvent({ ownerId, payload: { ...event.payload } }))
		}
	}
}
```

### Step T2.5 — O docblock do fato

Modify `packages/api/typescript/src/thread/events/DirectMessageSentEvent.ts`: substitua o comentário do topo

de:

```
/** Context-private fact: the operator spoke directly on the channel (only while paused). The
 *  internal bridge orders the OPERATOR-identity delivery via `integration.channel.delivery_requested`. */
```

para:

```
/** Context-private fact: the operator spoke directly on the channel. An AUDIT RECORD with NO consumer
 *  (B3, decision 3) — the delivery is a durable `deliver_channel_message` command enqueued by
 *  `SendDirectMessage` in the same transaction, not something a handler derives from this fact. */
```

Nenhuma outra linha muda.

### Step T2.6 — Verde

Run: `cd packages/api/typescript && bun test src/thread/usecases/SendDirectMessage.test.ts`
Expected: PASS — 3 pass, 0 fail

Run: `cd packages/api/typescript && bun test tests/flows/inbound-routing.flow.test.ts`
Expected: PASS — o publisher do thread ficou com uma união de um elemento; o fluxo inbound não usa a branch removida.

Run: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit`
Expected: exit 0

### Step T2.7 — Commit

```bash
git add packages/api/typescript/src/thread/usecases/SendDirectMessage.ts \
        packages/api/typescript/src/thread/usecases/SendDirectMessage.test.ts \
        packages/api/typescript/src/thread/handlers/PublishThreadIntegrationEvents.ts \
        packages/api/typescript/src/thread/events/DirectMessageSentEvent.ts
git commit -m "feat(thread): B3 — a mensagem do operador e o comando de entrega commitam juntos

SendDirectMessage enfileira deliver_channel_message com enqueueCommand(..., tx)
na MESMA transação do transcript.append + do save do fato (AC-2), com jobId =
entryId para dedup de request reenviado.

A branch de delivery sai do PublishThreadIntegrationEvents (decisão 3):
thread.direct_message_sent volta a ser só fato auditável, sem consumidor (AC-5).
O publisher segue sendo a exceção nomeada do contexto — único chamador de
ExternalMediator.publish aqui."
```

---

## Task T3: A resposta do orquestrador atravessa como comando, dentro da própria transação

**Files to write:**
- Create: `packages/api/typescript/src/thread/usecases/RecordOrchestratorReply.ts`
- Test: `packages/api/typescript/src/thread/usecases/RecordOrchestratorReply.test.ts`
- Modify: `packages/api/typescript/src/thread/handlers/DeliverOrchestratorReply.ts` — arquivo inteiro abaixo (handler fino, só delega)
- Modify: `packages/api/typescript/src/thread/handlers/DeliverOrchestratorReply.test.ts` — arquivo inteiro abaixo (teste do handler fino)
- Modify: `packages/api/typescript/tests/flows/issue-result.flow.test.ts` — o bloco final passa a assertar o comando enfileirado
- Modify: `packages/api/typescript/src/thread/usecases/index.ts` — export do novo use case (1 linha, auto-wired pelo `bun cli`)

**Files to read:**
- `packages/api/typescript/src/issue/handlers/MaterializeIssueFromExecution.ts` — o molde canônico "handler invoca use case" (injeta `OpenIssue`/`CompleteIssue`/`RaiseStop` e delega)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /handler, /test
**Depends on:** T1
**Consumes (frozen):** `DeliverChannelMessage` (classe), `'deliver_channel_message'`, `DeliverChannelMessageInputSchema` (`quotedMessageId?`/`replyEntryId?` inclusos), `CommandQueue.enqueueCommand(name, input, opts?, tx?)`
**Scope fence:** DONE em T1: executor + schema do comando. DONE em T2: `SendDirectMessage`. OUT: remoção do `.tsp` (T4) e `publish()` (T5) — este handler continua importando `OrchestratorRepliedEvent` (que NÃO morre).
**Gate:** `cd packages/api/typescript && bun test src/thread/usecases/RecordOrchestratorReply.test.ts src/thread/handlers/DeliverOrchestratorReply.test.ts tests/flows/issue-result.flow.test.ts`

### Step T3.1 — Scaffold do use case

```bash
bun cli usecase thread RecordOrchestratorReply
```

### Step T3.2 — O teste que falha (o corpo transacional, agora no use case)

Test `packages/api/typescript/src/thread/usecases/RecordOrchestratorReply.test.ts` — COMPLETE final file:

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { scheduledCommands } from '@codedm/contracts/db'
import { DrizzleClient, DrizzleDatabaseDriver } from '@codedm/core-typescript'
import { TestBed, givenThread } from '@test/support'
import { MessageAuthor, TranscriptKind } from '@codedm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { RecordOrchestratorReply } from './RecordOrchestratorReply'
import { TranscriptRepository } from '../repositories/TranscriptRepository'
import { ConsumedMessageRepository } from '../repositories/ConsumedMessageRepository'

/**
 * The transactional body the handler used to run OUTSIDE any transaction (the outbox dispatches with
 * no tx — DrizzleOutboxDispatcher's phase 2). It does three things, and each closes a gap:
 *
 *  1. WRITES THE SYSTEM TRANSCRIPT ENTRY — without it the agent's own words are absent from the very
 *     buffer its next turn reads, so a conversation looks, to the orchestrator, like a series of
 *     unanswered operator messages.
 *  2. RESOLVES THE QUOTE — `findPlatformId(replyToEntryId)` turns our entry id into the platform
 *     message id a WhatsApp quote needs. Absent-but-requested DEGRADES to no quote rather than
 *     failing: a retried conversational turn is a second message in a real group.
 *  3. ORDERS THE DELIVERY as a durable command, in the SAME transaction as (1). Before B3 these were
 *     two independent operations, and the second one persisted nothing.
 */
describe('RecordOrchestratorReply — the reply is transcribed and its delivery ordered, atomically', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let db: DrizzleClient
	let driver: DrizzleDatabaseDriver

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
		db = testBed.resolve(DrizzleClient)
		driver = testBed.resolve(DrizzleDatabaseDriver)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const commands = async () => db.select().from(scheduledCommands)

	it('writes the SYSTEM entry and enqueues the delivery carrying the entry it IS', async () => {
		const thread = await givenThread(testBed)

		await testBed
			.resolve(RecordOrchestratorReply)
			.execute({ ownerId: OPERATOR_ID, threadId: thread.id.value, text: 'sim, claro' })

		const entries = await testBed.resolve(TranscriptRepository).recentByThread(thread.id.value, 10)
		const system = entries.find(e => e.kind === TranscriptKind.SYSTEM)
		expect(system?.text).toBe('sim, claro')

		const [command] = await commands()
		expect({ name: command?.name, id: command?.id, input: command?.input }).toEqual({
			name: 'deliver_channel_message',
			id: system?.entryId,
			input: {
				ownerId: OPERATOR_ID,
				channelId: thread.channelId,
				contactExternalId: thread.contactRef.externalId,
				text: 'sim, claro',
				author: MessageAuthor.SYSTEM,
				// The link that lets a human's reply TO this message resolve back to an entry (§8, flow 3).
				replyEntryId: system?.entryId,
			},
		})
	})

	it('no citation requested — no quote on the wire', async () => {
		const thread = await givenThread(testBed)

		await testBed
			.resolve(RecordOrchestratorReply)
			.execute({ ownerId: OPERATOR_ID, threadId: thread.id.value, text: 'está dessa forma: xxx' })

		const [command] = await commands()
		expect((command?.input as { quotedMessageId?: string }).quotedMessageId).toBeUndefined()
	})

	it('a citation that cannot be resolved degrades to no quote, and still orders the delivery', async () => {
		const thread = await givenThread(testBed)

		await testBed.resolve(RecordOrchestratorReply).execute({
			ownerId: OPERATOR_ID,
			threadId: thread.id.value,
			text: 'resolvido',
			replyToEntryId: '019e4d24-6524-7041-9e1c-8108180cddff',
		})

		const [command] = await commands()
		expect((command?.input as { text: string; quotedMessageId?: string })).toMatchObject({ text: 'resolvido' })
		expect((command?.input as { quotedMessageId?: string }).quotedMessageId).toBeUndefined()
	})

	it('a citation that RESOLVES travels as the platform id the gateway quotes', async () => {
		const thread = await givenThread(testBed)
		const quoted = await testBed
			.resolve(TranscriptRepository)
			.append({ ownerId: OPERATOR_ID, threadId: thread.id.value, kind: TranscriptKind.CONTACT, text: 'e o cupom?' })
		await testBed
			.resolve(ConsumedMessageRepository)
			.claim({ ownerId: OPERATOR_ID, channelId: thread.channelId, platformMessageId: 'wamid-asked' })
		await testBed.resolve(ConsumedMessageRepository).linkEntry({
			channelId: thread.channelId,
			platformMessageId: 'wamid-asked',
			threadId: thread.id.value,
			entryId: quoted.entryId,
		})

		await testBed
			.resolve(RecordOrchestratorReply)
			.execute({ ownerId: OPERATOR_ID, threadId: thread.id.value, text: 'saiu', replyToEntryId: quoted.entryId })

		const [command] = await commands()
		expect((command?.input as { quotedMessageId?: string }).quotedMessageId).toBe('wamid-asked')
	})

	it('a reply for a vanished thread is dropped, not forged — nothing is written and nothing is ordered', async () => {
		const before = await testBed.probe().snapshot(['transcriptEntries', 'scheduledCommands'] as const)

		await testBed
			.resolve(RecordOrchestratorReply)
			.execute({ ownerId: OPERATOR_ID, threadId: '019e4d24-6524-7041-9e1c-8108180cdd99', text: 'olá' })

		expect(await testBed.probe().snapshot(['transcriptEntries', 'scheduledCommands'] as const)).toEqual(before)
	})

	it('ATOMICITY — a rolled-back transaction leaves NEITHER the entry NOR the command', async () => {
		const thread = await givenThread(testBed)
		const before = await testBed.probe().snapshot(['transcriptEntries', 'scheduledCommands'] as const)

		await driver
			.transaction(async tx => {
				await testBed
					.resolve(RecordOrchestratorReply)
					.execute({ ownerId: OPERATOR_ID, threadId: thread.id.value, text: 'morre junto' }, tx)
				throw new Error('the turn died after the writes, before the commit')
			})
			.catch(() => {})

		expect(await testBed.probe().snapshot(['transcriptEntries', 'scheduledCommands'] as const)).toEqual(before)
	})
})
```

### Step T3.3 — Rodar e ver o vermelho

Run: `cd packages/api/typescript && bun test src/thread/usecases/RecordOrchestratorReply.test.ts`
Expected: FAIL — o esqueleto do scaffold não grava transcript nem enfileira: os 6 casos falham (o primeiro em `expect(system?.text)` recebendo `undefined`).

### Step T3.4 — Proposed file: Create `packages/api/typescript/src/thread/usecases/RecordOrchestratorReply.ts`

```typescript
import { injectable } from 'tsyringe-neo'
import { Handler, z, CommandQueue } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { MessageAuthor, TranscriptKind } from '@codedm/contracts-typescript/wire/enums'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { TranscriptRepository } from '../repositories/TranscriptRepository'
import { ConsumedMessageRepository } from '../repositories/ConsumedMessageRepository'
import type { DeliverChannelMessage } from './DeliverChannelMessage'

export const RecordOrchestratorReplyInputSchema = z.object({
	ownerId: z.uuid(),
	// MIRRORS THE WIRE (`integration.orchestrator.replied` types both as plain strings): a malformed id
	// must reach the same DROP the handler always took, not a VALIDATION_ERROR the outbox would retry
	// five times and dead-letter.
	threadId: z.string(),
	text: z.string().min(1),
	replyToEntryId: z.string().optional(),
})

export const RecordOrchestratorReplyOutputSchema = z.void()

/**
 * The orchestrator's reply crosses to the channel (orchestrator pivot §7.5) — and, since the pivot,
 * the ONLY path from an agent to the channel.
 *
 * ### Why a use case and not the handler's body (B3, decision 2)
 * A handler runs OUTSIDE any transaction (`DrizzleOutboxDispatcher` dispatches after committing its
 * claim), so the entry write and the delivery order were two independent operations — and the second
 * persisted nothing at all. The canonical fix in this house is "handler invokes use case": the
 * transactional body lives here with its own UnitOfWork, and `DeliverOrchestratorReply` is thin.
 *
 * ### Ordering: the entry is written BEFORE the delivery is enqueued
 * `replyEntryId` has to exist before anything can link to it, and the enqueue rides the same
 * transaction — so a crash cannot leave a delivery pointing at an entry that never committed.
 */
@injectable()
export class RecordOrchestratorReply extends Handler<typeof RecordOrchestratorReplyInputSchema, typeof RecordOrchestratorReplyOutputSchema> {
	readonly name = 'record_orchestrator_reply' as const
	readonly inputSchema = RecordOrchestratorReplyInputSchema
	readonly outputSchema = RecordOrchestratorReplyOutputSchema

	constructor(
		private readonly threads: ThreadRepository,
		private readonly transcript: TranscriptRepository,
		private readonly consumed: ConsumedMessageRepository,
		private readonly commands: CommandQueue,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		// Defensive drop, the same posture the inbound consumer takes: a reply for a thread that no
		// longer exists has nowhere to go, and forging a destination would be worse than silence. A THROW
		// here would be retried by the outbox and, on a conversational turn, a retry is a second message.
		const thread = await this.threads.findById(input.threadId)
		if (!thread) return

		await this.withTransaction(tx, async tx => {
			const entry = await this.transcript.append(
				{
					ownerId: input.ownerId,
					threadId: thread.id.value,
					kind: TranscriptKind.SYSTEM,
					text: input.text,
					quotedEntryId: input.replyToEntryId,
				},
				tx,
			)

			// The platform id of the message being quoted. `findPlatformId` is the INVERSE lookup added in
			// F1 for exactly this: everywhere else resolves platform id → entry, and a citation needs the
			// other direction. Unresolvable degrades to no quote — an unquoted answer is worth far more
			// than a silence.
			const quotedMessageId = input.replyToEntryId ? await this.consumed.findPlatformId(input.replyToEntryId, tx) : undefined

			// THE ORDER, in this same transaction (B3, decision 2). `jobId` is the entry id: the queue
			// dedups on it, so a redelivered `integration.orchestrator.replied` that already committed does
			// not schedule a second send of the same entry.
			await this.commands.enqueueCommand<DeliverChannelMessage>(
				'deliver_channel_message',
				{
					ownerId: input.ownerId,
					channelId: thread.channelId,
					contactExternalId: thread.contactRef.externalId,
					text: input.text,
					author: MessageAuthor.SYSTEM,
					quotedMessageId,
					// Carried so the ledger row can link back to the entry this message IS.
					replyEntryId: entry.entryId,
				},
				{ jobId: entry.entryId },
				tx,
			)
		})
	}
}
```

### Step T3.5 — Proposed file: Modify `packages/api/typescript/src/thread/handlers/DeliverOrchestratorReply.ts`

```typescript
import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@codedm/core-typescript'
import { OrchestratorRepliedEvent } from '@codedm/contracts-typescript/wire/events'
import { RecordOrchestratorReply } from '../usecases/RecordOrchestratorReply'

/**
 * The agent context speaks in issues, the channel in conversations — only the thread knows which
 * contact an issue belongs to, so the reply→delivery translation lives here.
 *
 * THIN BY DESIGN (B3, decision 2). A handler runs outside any transaction, so it cannot own a
 * transactional body: it validates the envelope and delegates to `RecordOrchestratorReply`, which
 * opens its own UnitOfWork and writes the transcript entry + enqueues the delivery command together.
 * This handler publishes NOTHING — integration publication in this context belongs to
 * `PublishThreadIntegrationEvents` alone (decision 4).
 */
@injectable()
export class DeliverOrchestratorReply extends EventHandler<typeof OrchestratorRepliedEvent> {
	readonly event = OrchestratorRepliedEvent

	constructor(private readonly record: RecordOrchestratorReply) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const ownerId = event.ownerId
		// An envelope without an owner is undeliverable — the gateway scopes every write by owner and
		// must never be handed a forged one.
		if (!ownerId) return

		await this.record.execute({
			ownerId,
			threadId: event.payload.threadId,
			text: event.payload.text,
			replyToEntryId: event.payload.replyToEntryId,
		})
	}
}
```

### Step T3.6 — Proposed file: Modify `packages/api/typescript/src/thread/handlers/DeliverOrchestratorReply.test.ts`

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { scheduledCommands } from '@codedm/contracts/db'
import { DrizzleClient } from '@codedm/core-typescript'
import { TestBed, givenThread } from '@test/support'
import { OrchestratorRepliedEvent } from '@codedm/contracts-typescript/wire/events'
import { TranscriptKind } from '@codedm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { TranscriptRepository } from '../repositories/TranscriptRepository'
import { DeliverOrchestratorReply } from './DeliverOrchestratorReply'

/**
 * The handler is THIN since B3 — it maps the envelope and delegates. The behaviour it used to own
 * (transcript entry, quote resolution, atomicity with the delivery order) is proven at its new home,
 * `usecases/RecordOrchestratorReply.test.ts`. What is left to prove here is exactly the handler's job:
 * the envelope guard, and that a valid envelope reaches the use case.
 */
describe('DeliverOrchestratorReply — the envelope guard and the delegation', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let db: DrizzleClient

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
		db = testBed.resolve(DrizzleClient)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('delegates: a valid envelope produces the SYSTEM entry and the delivery command', async () => {
		const thread = await givenThread(testBed)

		await testBed.resolve(DeliverOrchestratorReply).handle(
			new OrchestratorRepliedEvent({ ownerId: OPERATOR_ID, payload: { threadId: thread.id.value, text: 'sim, claro' } }) as never,
		)

		const entries = await testBed.resolve(TranscriptRepository).recentByThread(thread.id.value, 10)
		expect(entries.find(e => e.kind === TranscriptKind.SYSTEM)?.text).toBe('sim, claro')
		const [command] = await db.select().from(scheduledCommands)
		expect(command?.name).toBe('deliver_channel_message')
	})

	it('an envelope with no owner is dropped before anything is written', async () => {
		const thread = await givenThread(testBed)
		const before = await testBed.probe().snapshot(['transcriptEntries', 'scheduledCommands'] as const)

		await testBed
			.resolve(DeliverOrchestratorReply)
			.handle({ name: OrchestratorRepliedEvent.name, payload: { threadId: thread.id.value, text: 'sem dono' } } as never)

		expect(await testBed.probe().snapshot(['transcriptEntries', 'scheduledCommands'] as const)).toEqual(before)
	})
})
```

### Step T3.7 — O fluxo B1 asserta o comando, não o evento

Modify `packages/api/typescript/tests/flows/issue-result.flow.test.ts`:

1. No topo, remova `import { ChannelDeliveryRequestedEvent } from '@codedm/contracts-typescript/wire/events'` e acrescente aos imports existentes `import { scheduledCommands } from '@codedm/contracts/db'` e `import { CommandQueue } from '@codedm/core-typescript'`.

2. Substitua o bloco final do primeiro caso (linhas ~103-107)

de:

```
		await testBed.resolve(DeliverOrchestratorReply).handle(replied[0] as never)

		const deliveries = testBed.externalSpy.getPublishedOfType('integration.channel.delivery_requested')
		expect(deliveries).toHaveLength(1)
		expect((deliveries[0] as ChannelDeliveryRequestedEvent).payload.text).toBeTruthy()
```

para:

```
		// The delivery is a COMMAND now (B3): in mock mode the queue executes inline, so a recording
		// handler under the command's name is what "the order was placed" looks like here.
		const ordered: Array<{ text: string; author: string }> = []
		await testBed.resolve(CommandQueue).registerCommandHandler({
			name: 'deliver_channel_message',
			execute: async (input: unknown) => void ordered.push(input as { text: string; author: string }),
		} as never)

		await testBed.resolve(DeliverOrchestratorReply).handle(replied[0] as never)

		expect(ordered).toHaveLength(1)
		expect(ordered[0]?.text).toBeTruthy()
```

Nenhuma outra linha do arquivo muda.

### Step T3.8 — Verde

Run: `cd packages/api/typescript && bun test src/thread/usecases/RecordOrchestratorReply.test.ts src/thread/handlers/DeliverOrchestratorReply.test.ts tests/flows/issue-result.flow.test.ts`
Expected: PASS — 6 + 2 + os casos do fluxo, 0 fail

Run: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit`
Expected: exit 0

### Step T3.9 — Commit

```bash
git add packages/api/typescript/src/thread/usecases/RecordOrchestratorReply.ts \
        packages/api/typescript/src/thread/usecases/RecordOrchestratorReply.test.ts \
        packages/api/typescript/src/thread/usecases/index.ts \
        packages/api/typescript/src/thread/handlers/DeliverOrchestratorReply.ts \
        packages/api/typescript/src/thread/handlers/DeliverOrchestratorReply.test.ts \
        packages/api/typescript/tests/flows/issue-result.flow.test.ts
git commit -m "refactor(thread): B3 — a resposta do orquestrador vira use case + comando

DeliverOrchestratorReply para de publicar integração (a única violação do
inventário TS) e fica fino: delega a RecordOrchestratorReply, que abre a própria
transação e grava o transcript entry + resolve a citação + enfileira
deliver_channel_message no MESMO tx (AC-3).

O teste de atomicidade prova o par: rollback não deixa entry nem comando."
```

---

## Task T4: Contract Lock — `ChannelDeliveryRequestedEvent` sai do contrato

**Files to write:**
- Delete: `packages/contracts/wire/events/channel-delivery-requested.tsp`
- Modify: `packages/contracts/wire/events/index.tsp` — sai a linha `import "./channel-delivery-requested.tsp";`
- Regen: `packages/contracts/generated/typescript/src/wire/events/**`
- Regen: `packages/contracts/generated/go/wire/**`
- Regen: `packages/contracts/dist/contracts.openapi.yaml`
- Regen: `packages/api/typescript/public/docs/openapi.json`
- Regen: `packages/client/dist/**`

**Files to read:**
- `packages/api/typescript/src/ui/controllers/ListenEvents.ts` — por que o SDK muda: o output do SSE é `materializedIntegrationEventSchemas` inteiro, então um evento a menos encurta a união

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** /sdk, /event
**Depends on:** T2, T3
**Consumes (frozen):** os call sites que T2/T3 removeram (`PublishThreadIntegrationEvents.ts` branch de delivery, `DeliverOrchestratorReply.ts:69`) e o executor `DeliverChannelMessage` de T1 — só depois de os três desaparecerem o contrato pode sair sem quebrar o build.
**Scope fence:** DONE: todo call site de produção do evento. OUT: `publish()` (T5), skills (T6). Este Task não toca `src/`.
**Gate:** `bun check:generated` — exit 0 (regenera e prova que a cópia commitada não derivou)

### Step T4.1 — Provar que não há mais nenhum call site

Run: `grep -rn "ChannelDeliveryRequested\|delivery_requested" packages/api/typescript/src packages/api/go/internal --include='*.ts' --include='*.go'`
Expected: vazio (exit 1). Se aparecer qualquer linha, PARE — T2/T3 não fecharam.

### Step T4.2 — Remover o contrato

```bash
git rm packages/contracts/wire/events/channel-delivery-requested.tsp
```

Modify `packages/contracts/wire/events/index.tsp`: remova a linha 20, `import "./channel-delivery-requested.tsp";`. Nenhuma outra linha muda.

### Step T4.3 — Regenerar tudo que descende do contrato

```bash
bun contracts && bun emit-openapi && bun sdk
```

Expected: `packages/contracts/generated/typescript/src/wire/events/channel-delivery-requested.ts` deixa de existir; `_imports.ts`, `index.ts` e `materialized.ts` perdem suas 5 referências; `generated/go/wire/events.go` perde o struct + o const e `envelope.go` perde o case; `contracts.openapi.yaml`, `public/docs/openapi.json` e `packages/client/dist/**` encurtam a união do SSE.

### Step T4.4 — Type check global

Run: `bun tsc`
Expected: exit 0 em todos os workspaces (nada em `src` importa o tipo removido).

### Step T4.5 — Commit (antes da verificação, que exige árvore limpa)

```bash
git add packages/contracts packages/client/dist packages/api/typescript/public/docs/openapi.json
git commit -m "chore(contracts): B3 — ChannelDeliveryRequestedEvent morre (AC-1)

O único evento-comando do sistema sai do .tsp depois que seus três call sites de
produção desapareceram (T1-T3): a intenção era comandar, e comandar agora é
CommandQueue. Regenerados wire TS/Go, contracts.openapi.yaml, o openapi.json do
daemon e o SDK — a união do SSE (ListenEvents emite materializedIntegrationEventSchemas
inteiro) encurta em um arm."
```

### Step T4.6 — Verificar o lock

Run: `bun check:generated`
Expected: exit 0 — regenera e o `git diff` dos roots gerados sai vazio.

Run: `grep -rn "delivery_requested" packages/contracts packages/client/dist packages/api/typescript/public/docs/openapi.json`
Expected: vazio (exit 1).

---

## Task T5: `publish()` persiste na lane `integration` e o poller entrega TS→TS

**Files to write:**
- Modify: `packages/api/typescript/core/src/services/Mediator/SqlExternalMediator.ts` — docblocks da lane e da classe + construtor + `publish()`
- Modify: `packages/api/typescript/core/src/repositories/DrizzleDomainEventRepository.ts` — `toIntegrationOutboxRow` passa a nascer na lane `integration` (1 linha + comentário)
- Modify: `packages/api/typescript/core/src/repositories/DrizzleDomainEventRepository.test.ts` — novo caso: integration event → lane `integration`
- Modify: `packages/api/typescript/core/src/services/Mediator/SqlExternalMediator.test.ts` — o caso "the OUTBOUND path writes NO row" vira o falseador de AC-6
- Create: `packages/api/typescript/tests/flows/ts-integration-lane.flow.test.ts`
- Modify: `packages/api/typescript/tests/flows/shared-outbox-lanes.test.ts` — o `new SqlExternalMediator(driver)` ganha o repositório (1 linha)
- Modify: `packages/api/typescript/scripts/inject-own-message.ts` — o docblock que afirma que TS-published events nunca caem no outbox (4 linhas)

**Files to read:**
- `packages/api/typescript/core/src/repositories/DomainEventRepository.ts` — a assinatura de `saveIntegrationEvent(event, transaction?)`
- `packages/api/go/core/services/mediator/sql_external_mediator.go` — o guard `NewSqlExternalMediatorWithoutIngress` (por que o TS segue sendo o único claimant da lane)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /event, /test
**Depends on:** T4
**Consumes (frozen):** `DomainEventRepository.saveIntegrationEvent(event, tx?)`, `AnyIntegrationEvent`, `OutboxSource.integration`, `LANE = 'integration'` + `claimBatch`/`drainOnce` do `SqlExternalMediator`, e o fato de que nenhum produtor TS publica mais o contrato removido em T4.
**Scope fence:** DONE em T1-T4: o caminho de delivery inteiro e a morte do contrato. OUT: os 5 `Publish*IntegrationEvents` (não mudam de chamada, só de garantia), `EventEmitter2Mediator`/`MockExternalMediator` (doubles por env — ver Notes) e as skills (T6).
**Gate:** `cd packages/api/typescript/core && bun test src/services/Mediator/SqlExternalMediator.test.ts src/repositories/DrizzleDomainEventRepository.test.ts` + `cd packages/api/typescript && bun test tests/flows/ts-integration-lane.flow.test.ts tests/flows/shared-outbox-lanes.test.ts`

### Step T5.1 — O falseador: reescrever o caso que asserta a semântica antiga

Modify `packages/api/typescript/core/src/services/Mediator/SqlExternalMediator.test.ts`:

1. Nos imports, acrescente `import { ChannelConnectedEvent } from '@codedm/contracts-typescript/wire/events'` e `import { DrizzleDomainEventRepository } from '../../repositories/DrizzleDomainEventRepository'`; e no `beforeEach`, troque

de:

```
		mediator = new SqlExternalMediator(driver)
```

para:

```
		mediator = new SqlExternalMediator(driver, new DrizzleDomainEventRepository(driver.db))
```

2. Substitua o ÚLTIMO caso do arquivo (`'the OUTBOUND path writes NO row — TS integration events already travel on the api lane'`) por:

```typescript
	it('publish PERSISTS on this lane and dispatches NOTHING in the same call stack', async () => {
		const { handler, calls } = makeHandler(OTHER_EVENT)
		await mediator.register(handler)

		await mediator.publish(
			new ChannelConnectedEvent({
				ownerId: 'owner-1',
				payload: { channelId: crypto.randomUUID(), platform: 'whatsapp', ownerId: 'owner-1' },
			}),
		)

		// (a) THE ROW EXISTS — durable before anyone is told, on the lane this class claims, unprocessed.
		const rows = await driver.db.select().from(outbox)
		expect(rows).toHaveLength(1)
		expect({ name: rows[0]?.name, source: rows[0]?.source, processed: rows[0]?.processedAt ?? null }).toEqual({
			name: OTHER_EVENT,
			source: 'integration',
			processed: null,
		})

		// (b) AND NOBODY RAN. This is the whole point of the change: before B3 `publish` was an alias of
		// `dispatch`, so the handler had already executed by this line and no row existed at all.
		expect(calls).toHaveLength(0)

		// (c) The POLLER is what delivers it — one claim, one lease, whoever produced the row.
		expect(await mediator.drainOnce()).toBe(1)
		expect(calls).toHaveLength(1)
		expect((await driver.db.select().from(outbox))[0]?.processedAt).toBeInstanceOf(Date)
	})
```

3. Acrescente um SEGUNDO caso novo logo abaixo (EMENDA O1 — a API exata de callback do mediator é a que o `ListenEvents.ensureBroadcaster` usa hoje; ajuste o nome do método ao real se divergir):

```typescript
	it('EMENDA O1 — a row with NO registered handler is still claimed FOR THE CALLBACKS, then tombstoned', async () => {
		// The SSE broadcaster is a global callback, not a named handler. Before this change the claim
		// filtered by registered-handler names only, so a TS-published fact with no backend consumer
		// (stop_resolved, issue.archived, thread.attached) never reached the browser again. With a
		// callback registered, the poller claims EVERY row on the lane: handlers run where they exist,
		// callbacks fire for all — and dormant rows stop accumulating unprocessed.
		const seen: unknown[] = []
		mediator.registerCallback(async event => void seen.push(event))

		await mediator.publish(
			new ChannelConnectedEvent({
				ownerId: 'owner-1',
				payload: { channelId: crypto.randomUUID(), platform: 'whatsapp', ownerId: 'owner-1' },
			}),
		)

		expect(await mediator.drainOnce()).toBe(1)
		expect(seen).toHaveLength(1)
		expect((await driver.db.select().from(outbox))[0]?.processedAt).toBeInstanceOf(Date)
	})
```

### Step T5.2 — Rodar e ver o vermelho (falseador 1)

Run: `cd packages/api/typescript/core && bun test src/services/Mediator/SqlExternalMediator.test.ts`
Expected: FAIL — duas falhas com a implementação antiga: `expect(rows).toHaveLength(1)` recebe `0` (o alias de `dispatch` não escreve nada) e `expect(calls).toHaveLength(0)` recebe `1` (o handler rodou síncrono). É exatamente o falseador de AC-6.

### Step T5.3 — A lane da linha de outbox do integration event

Modify `packages/api/typescript/core/src/repositories/DrizzleDomainEventRepository.ts`: em `toIntegrationOutboxRow`, troque `source: OutboxSource.api` por `source: OutboxSource.integration` e acrescente o comentário acima do método:

```typescript
	// Integration events carry no aggregate `entityId` (they describe a cross-context fact about an
	// owner/tenant), so the outbox row leaves the uuid entityId column null.
	//
	// THE LANE IS `integration`, NOT `api` (B3, decisions 4/5): `source` decides WHO CLAIMS the row, and
	// the claimant of an integration event is `SqlExternalMediator`, never the api-lane domain
	// dispatcher. On `api` the row would be handed to the domain dispatcher, which routes `integration.*`
	// names to `ExternalMediator.dispatch` — an in-memory fan-out with a 30s retry lease, i.e. exactly
	// the durability hole this change closes. The audit row in `events` stays on `api`: that column
	// records WHO PRODUCED the fact, and this daemon is the producer.
```

### Step T5.4 — Novo caso no teste do repositório

Modify `packages/api/typescript/core/src/repositories/DrizzleDomainEventRepository.test.ts`: acrescente ao topo `import { BaseIntegrationEvent } from '../types/BaseIntegrationEvent'`, e depois do primeiro `it` insira:

```typescript
	const ProbeIntegrationEventSchema = z.integrationEvent('integration.probe.happened', { marker: z.string() })
	class ProbeIntegrationEvent extends BaseIntegrationEvent<typeof ProbeIntegrationEventSchema> {
		static override readonly name = 'integration.probe.happened' as const
		static readonly schema = ProbeIntegrationEventSchema
	}

	it('an INTEGRATION event lands on the `integration` lane — the lane whose claimant is SqlExternalMediator', async () => {
		await driver.transaction(tx =>
			repo.saveIntegrationEvent(new ProbeIntegrationEvent({ ownerId: OWNER, payload: { marker: 'crossing' } }), tx as DrizzleClient),
		)

		const [auditRow] = await driver.db.select().from(events)
		const [outboxRow] = await driver.db.select().from(outbox)

		// The audit row records WHO PRODUCED it (this daemon = api); the outbox row records WHO CLAIMS it.
		expect(auditRow?.source).toBe(OutboxSource.api)
		expect(outboxRow?.source).toBe(OutboxSource.integration)
		expect(outboxRow?.processedAt).toBeNull()
	})
```

### Step T5.5 — Modify `packages/api/typescript/core/src/services/Mediator/SqlExternalMediator.ts`

Quatro edições no arquivo (framework de ~300 linhas — a Task muda regiões nomeadas, não o arquivo inteiro).

**(1)** Substitua o docblock do `const LANE` (linhas 13-19) por:

```typescript
/**
 * The lane this mediator owns — and it carries BOTH directions.
 *
 * The old text described `integration` as the Go gateway's egress to us and nothing else. That was a
 * restriction of the moment, not a property of the lane (founder, 29-jul): since B3 the TS side
 * PUBLISHES here too (`publish()` → `saveIntegrationEvent`), and the claim does not care who produced
 * a row — it filters by NAME (only names with a registered handler) and leases. There is still exactly
 * ONE claimant, because the Go twin is built EGRESS-ONLY on this lane
 * (`NewSqlExternalMediatorWithoutIngress`); when Go one day needs to consume a TS-published fact it
 * registers a handler for that name — same lane, same claim, no new lane.
 * (`api` belongs to DrizzleOutboxDispatcher, `gateway` to the Go dispatcher.)
 */
const LANE = 'integration'
```

**(2)** Substitua o parágrafo `WHAT IT DOES NOT DO` do docblock da classe (linhas 50-54) por:

```
 * PUBLISH PERSISTS, AND ONLY PERSISTS (B3, decisions 4/5). `publish()` INSERTs the event on this lane
 * via `DomainEventRepository.saveIntegrationEvent` and returns — it dispatches nothing in the caller's
 * call stack and fires no callback there. Every delivery, Go-published or TS-published, comes from
 * `drainOnce`: one poller, one claim/lease, at-least-once, and consumers dedup (the core
 * `IdempotencyGuard`, or a UNIQUE latch like thread's consumed-message ledger). That is what makes a
 * TS→TS integration event survive a crash between the publish and the consumer. Until B3 this method
 * was an alias of `dispatch()`: nothing was written, so "the outbox will retry it" was simply false for
 * that direction.
 *
 * ORDERING, said out loud because the alias used to provide it by accident: an awaited in-memory
 * fan-out delivered A before B by construction. On the lane, order is `created_at` WITHIN one claim
 * batch and delivery is sequential — but a failed row does NOT hold back its successors here (this lane
 * does not group by owner; see `finalizeFailure`). A consumer that cannot tolerate "the later fact
 * arrived first" must say so at its own site.
```

**(3)** Substitua o construtor por:

```typescript
	constructor(
		private driver: DrizzleDatabaseDriver,
		private domainEvents: DomainEventRepository,
	) {
		super()
	}
```

e acrescente aos imports:

```typescript
import { DomainEventRepository } from '../../repositories/DomainEventRepository'
import { BaseIntegrationEvent, type AnyIntegrationEvent } from '../../types/BaseIntegrationEvent'
```

**(4)** Substitua o docblock + corpo de `publish()` (linhas 109-128) por:

```typescript
	/**
	 * PERSIST. Nothing else.
	 *
	 * The row is written inside the driver's write transaction (the only legitimate write path) and the
	 * method returns; `drainOnce` delivers it. The long note this docblock used to carry — about why the
	 * in-memory fan-out had to be awaited so `issue.opened` reached its consumer before
	 * `issue.completed` — described a property of the ALIAS, which is gone. What replaces it is the
	 * ORDERING paragraph on the class: intra-batch order, and consumers that dedup.
	 */
	async publish(event: BaseEvent): Promise<void> {
		// `publish` is typed on the widest event (the Mediator contract), but only integration events may
		// ride this lane: the row is scoped by the envelope `ownerId`, which a domain event does not have,
		// and an unscoped row is a row nothing can deliver. Fail loud rather than write it.
		if (!(event instanceof BaseIntegrationEvent)) {
			throw new BaseError<BaseInfrastructureErrors>(
				'INVALID_OUTBOX_PAYLOAD',
				`SqlExternalMediator.publish accepts integration events only — got '${event.name}'. Domain events are persisted by DomainEventRepository.save and dispatched on the api lane.`,
			)
		}
		// ONE documented boundary cast: `AnyIntegrationEvent` is the widest integration type the
		// persistence API accepts, and the generic is invariant on the schema, so the narrowed instance
		// above is not assignable by inference. The `instanceof` IS the runtime proof.
		const integrationEvent = event as unknown as AnyIntegrationEvent
		await this.driver.transaction(tx => this.domainEvents.saveIntegrationEvent(integrationEvent, tx))
	}
```

**(5) EMENDA O1 — o claim serve também aos callbacks.** Modifique o claim (`claimBatch`/`drainOnce`): quando existe ≥1 callback global registrado, o claim cobre **todas** as linhas da lane (hoje filtra `name IN (nomes com handler)`); na entrega, handlers rodam onde houver handler para o nome e `notifyCallbacks` dispara para TODA linha claimada. Sem nenhum callback registrado, o comportamento atual permanece (claim só de nomes com handler — scripts headless não tombstonam o que não consomem). Racional: é a implementação fiel da decisão 5 da spec ("o SSE dispara a partir do poller") somada à ratificação no-allowlist de 23-jul ("todo o surface integration.* vai ao browser") — sem isso, fatos TS sem consumidor backend nunca mais chegariam ao console, e o B5 quebraria por construção. Efeito colateral desejado: linhas dormentes (eventos Go sem consumidor) param de acumular sem processamento — são tombstonadas após o broadcast.

### Step T5.6 — Os dois call sites de construção nos testes

Modify `packages/api/typescript/tests/flows/shared-outbox-lanes.test.ts`: no `beforeEach`, troque `external = new SqlExternalMediator(driver)` por `external = new SqlExternalMediator(driver, new DrizzleDomainEventRepository(driver.db))` e acrescente `DrizzleDomainEventRepository` ao import de `@codedm/core-typescript`. Nenhum caso do arquivo muda (todos seedam linhas à mão, como o outro processo faria).

### Step T5.7 — AC-7: o publisher real, a lane, o poller

Create `packages/api/typescript/tests/flows/ts-integration-lane.flow.test.ts` — COMPLETE final file:

```typescript
// TS→TS PELA MESMA LANE — a prova executável das decisões 4/5 sobre um arquivo SQLite real.
//
// O que está em jogo: até B3 um integration event publicado pelo TS não existia em lugar nenhum. O
// publisher chamava `publish()`, que era alias de `dispatch()`, e o consumidor rodava na mesma call
// stack. Um crash entre as duas metades perdia o fato, e o docblock que prometia "o outbox reentrega"
// era falso para essa direção. Aqui o caminho inteiro é exercitado como em produção: um
// `Publish*IntegrationEvents` de verdade publica, a linha aparece na lane `integration` (a mesma que o
// gateway Go escreve), e SÓ o poller entrega.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import * as schema from '@codedm/contracts/db'
import { outbox } from '@codedm/contracts/db'
import { migrationsDir } from '@codedm/contracts/db/migrations'
import { ContactKind, ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import { DrizzleDomainEventRepository, LibsqlDriver, SqlExternalMediator, type Handler } from '@codedm/core-typescript'
import { PublishThreadIntegrationEvents } from '@thread/handlers/PublishThreadIntegrationEvents'
import { ThreadAttachedEvent } from '@thread/events/ThreadAttachedEvent'

const OWNER = '66666666-6666-4666-8666-666666666666'
const PUBLISHED = 'integration.thread.attached'

describe('a TS publisher rides the SAME lane as the Go gateway, and only the poller delivers', () => {
	let dir: string
	let driver: LibsqlDriver
	let mediator: SqlExternalMediator

	const makeHandler = (name: string) => {
		const calls: unknown[] = []
		const handler = {
			name,
			events: [name],
			bindContainer() {
				return handler
			},
			async execute(input: unknown) {
				calls.push(input)
			},
		} as unknown as Handler
		return { handler, calls }
	}

	const fact = (threadId: string) =>
		new ThreadAttachedEvent({
			entityId: threadId,
			ownerId: OWNER,
			payload: {
				threadId,
				channelId: crypto.randomUUID(),
				contactExternalId: 'contact-1',
				contactDisplayName: 'Ada',
				contactKind: ContactKind.USER,
				workspaceId: crypto.randomUUID(),
				providers: [ProviderKind.CLAUDE_CODE],
			},
		})

	beforeAll(async () => {
		dir = mkdtempSync(join(tmpdir(), 'codedm-ts-lane-'))
		driver = new LibsqlDriver({ schema, migrationsDir, dbPath: join(dir, 'codedm.db') })
		await driver.runMigrations()
	})

	afterAll(() => {
		rmSync(dir, { recursive: true, force: true })
	})

	beforeEach(async () => {
		await driver.reset()
		mediator = new SqlExternalMediator(driver, new DrizzleDomainEventRepository(driver.db))
	})

	it('publica → linha na lane `integration`, ZERO handlers rodados; drainOnce entrega e tombstona', async () => {
		const { handler, calls } = makeHandler(PUBLISHED)
		await mediator.register(handler)
		const publisher = new PublishThreadIntegrationEvents(mediator)
		const threadId = crypto.randomUUID()

		await publisher.execute(fact(threadId))

		// A metade durável: a linha existe, na lane compartilhada, e ninguém foi avisado ainda.
		const [row] = await driver.db.select().from(outbox)
		expect({ name: row?.name, source: row?.source, ownerId: row?.ownerId, processed: row?.processedAt ?? null }).toEqual({
			name: PUBLISHED,
			source: 'integration',
			ownerId: OWNER,
			processed: null,
		})
		expect(calls).toHaveLength(0)

		// A metade da entrega: um poll, um claim, o consumidor recebe — sem saber quem produziu.
		expect(await mediator.drainOnce()).toBe(1)
		expect(calls).toHaveLength(1)
		expect((calls[0] as { name: string; payload: { threadId: string } }).payload.threadId).toBe(threadId)

		const [after] = await driver.db.select().from(outbox)
		expect({ processed: after?.processedAt instanceof Date, claimedBy: after?.claimedBy ?? null }).toEqual({
			processed: true,
			claimedBy: null,
		})
	})

	it('sobrevive ao crash: a linha publicada por um processo é entregue por OUTRA instância do mediator', async () => {
		const publisher = new PublishThreadIntegrationEvents(mediator)
		await publisher.execute(fact(crypto.randomUUID()))

		// "O processo caiu antes de qualquer entrega." Uma instância NOVA — sem nada em memória — reclama
		// a mesma linha do arquivo. É a garantia que o caminho antigo não tinha: não havia linha.
		const reborn = new SqlExternalMediator(driver, new DrizzleDomainEventRepository(driver.db))
		const { handler, calls } = makeHandler(PUBLISHED)
		await reborn.register(handler)

		expect(await reborn.drainOnce()).toBe(1)
		expect(calls).toHaveLength(1)
	})
})
```

### Step T5.8 — Verde nos dois falseadores e nos vizinhos

Run: `cd packages/api/typescript/core && bun test src/services/Mediator/SqlExternalMediator.test.ts src/repositories/DrizzleDomainEventRepository.test.ts`
Expected: PASS — 0 fail (o caso do Step T5.1 fecha AC-6).

Run: `cd packages/api/typescript && bun test tests/flows/ts-integration-lane.flow.test.ts tests/flows/shared-outbox-lanes.test.ts`
Expected: PASS — 2 + 11 casos, 0 fail (AC-7).

Run: `cd packages/api/typescript/core && bun test` e `cd packages/api/typescript && bun test`
Expected: 0 fail nos dois workspaces.

### Step T5.9 — O comentário do script de injeção

Modify `packages/api/typescript/scripts/inject-own-message.ts`: substitua o parágrafo "# The vacuous check to not repeat" (linhas 23-26)

de:

```
 * Polling `shared_outbox` for `integration.channel.delivery_requested` proves NOTHING: TS-published
 * integration events are dispatched IN-PROCESS (`SqlExternalMediator.publish` → `dispatch`), so they
 * never land in the outbox. Only Go→TS events do. Watch `channel.message_sent` and the consumed
 * ledger instead — those are rows that actually get written.
```

para:

```
 * `integration.channel.delivery_requested` NÃO EXISTE MAIS (B3): a entrega é o comando
 * `deliver_channel_message` em `shared_scheduled_commands`. E desde B3 todo integration event
 * publicado pelo TS SIM cai no `shared_outbox`, na lane `integration` — `publish()` persiste. Para
 * observar a entrega, olhe a fila de comandos; para observar um fato cruzando, olhe a lane.
```

### Step T5.10 — Commit

```bash
git add packages/api/typescript/core/src/services/Mediator/SqlExternalMediator.ts \
        packages/api/typescript/core/src/services/Mediator/SqlExternalMediator.test.ts \
        packages/api/typescript/core/src/repositories/DrizzleDomainEventRepository.ts \
        packages/api/typescript/core/src/repositories/DrizzleDomainEventRepository.test.ts \
        packages/api/typescript/tests/flows/ts-integration-lane.flow.test.ts \
        packages/api/typescript/tests/flows/shared-outbox-lanes.test.ts \
        packages/api/typescript/scripts/inject-own-message.ts
git commit -m "fix(core): B3 — publish() persiste na lane integration; o poller entrega TS→TS

ExternalMediator.publish deixa de ser alias de dispatch() e passa a INSERIR o
integration event via saveIntegrationEvent (primeiro call site de produção), cuja
linha de outbox agora nasce na lane 'integration' — a lane cujo claimant é o
SqlExternalMediator (o gêmeo Go é egress-only ali).

FALSEADOR executado (AC-6): o teste que prova 'linha existe + nenhum handler
rodou síncrono' fica VERMELHO na implementação antiga por dois motivos ao mesmo
tempo (0 linhas, 1 handler executado). AC-7: um Publish*IntegrationEvents real
publica e uma instância NOVA do mediator entrega pela poll — a sobrevivência a
crash que o docblock aspiracional prometia e nunca teve.

A correção mora num arquivo; os 5 publishers não mudam de chamada, mudam de
garantia. Docblocks da lane e da classe atualizados (a lane não é mais descrita
como exclusiva Go→TS), incluindo a nota honesta sobre ordenação intra-batch."
```

---

## Task T6: A regra de intenção entra nas skills, com par TS e Go

**Files to write:**
- Modify: `.claude/registry.yaml` — nova bad practice cross-cutting `cc-bp-26` (WARN, heurística)
- Modify: `.claude/skills/event/typescript/registry.yaml` — novo pattern `EVT-C11` + verdade em `EVT-C02`
- Modify: `.claude/skills/event/go/registry.yaml` — novo pattern `EVT-GO-09` (par Go)
- Modify: `.claude/skills/handler/typescript/registry.yaml` — `HDL-P13` + `bp-09` + verdade em `bp-01`
- Modify: `.claude/skills/handler/go/registry.yaml` — `HDL-GO-08` + `bp-GO-HDL-07` (par Go)
- Modify: `.claude/skills/usecase/typescript/registry.yaml` — `UC-P16` (comando durável na tx do fato)
- Modify: `.claude/skills/event/SKILL.md` — a tabela de decisão outbox/CommandQueue/Mailbox/use-case-direto

**Files to read:**
- `packages/api/go/internal/channel/module.go` (linhas 339-407) — a convenção Go a codificar, nas palavras dela
- `.claude/registry.yaml` (`cc-bp-25`) — o formato exato de uma entrada cross-cutting

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /review
**Depends on:** T5
**Consumes (frozen):** a semântica shipped que as regras descrevem — `'deliver_channel_message'` + `commandHandlers` (T1), `enqueueCommand(..., tx)` em `SendDirectMessage`/`RecordOrchestratorReply` (T2/T3), `publish()` persistindo na lane `integration` (T5), e o inventário deste plano (TS = `Publish<Ctx>IntegrationEvents` por contexto; Go = `*IntegrationHandler` por evento em `internal/<ctx>/handlers/`).
**Scope fence:** DONE: todo o código. OUT: `projection`/`projector`/`middleware` (fora do escopo, decisão explícita da spec) e qualquer regra `mechanical: true` (decisão 8: a regra de intenção é de julgamento — nada de grep).
**Gate:** `bun test:tooling` — exit 0 (carrega e valida todo registry.yaml pelos gates de taxonomia/skill-examples e os testes dos hooks)

### Step T6.1 — `cc-bp-26` no registry cross-cutting

Modify `.claude/registry.yaml`: depois da entrada `cc-bp-25` (antes do comentário `# Implementation order`), acrescente:

```yaml
  - id: cc-bp-26
    scope: backend
    name: "Intenção de comando disfarçada de evento (evento existe só para um handler executar algo)"
    severity: warning
    always_flag_when: >
      Um evento (de domínio OU de integração) tem UM ÚNICO consumidor e esse consumidor não reage a um
      fato — ele EXECUTA uma ação (chama um serviço externo, faz um POST, dispara um envio) que poderia
      ser um comando ou um use case chamado direto. A formulação do founder (29-jul-2026): "evento
      existe para fins reativos, auditoria ou event sourcing — nunca para comandar. Se a existência do
      evento é só para um handler executar algo que poderia ser um comando/use case direto, está
      errado." Nomes `*Requested` não são proibidos por si; a INTENÇÃO é o critério. Julgamento, não
      forma: não existe teste mecânico para isto (por isso `mechanical: false` e severidade warning) —
      pergunte "se este handler não existisse, alguém mais reagiria a este fato?". Se a resposta é não,
      o desenho certo é (a) `CommandQueue.enqueueCommand(nome, input, opts, tx)` na MESMA transação do
      fato que o motiva, quando precisa de durabilidade/retry e o executor é único, ou (b) o use case
      chamado direto, quando é síncrono na própria request.
    exceptions: |
      - Fatos genuinamente reativos que HOJE têm um consumidor só e amanhã podem ter outros (o fato
        existiria mesmo sem o handler) — o critério é a intenção, não a contagem de consumidores.
      - Fatos publicados para auditoria/event sourcing sem consumidor nenhum (ex.
        `thread.direct_message_sent`): são registro, não comando.
    wrong: |
      // contracts: um evento cuja razão de existir é fazer alguém executar
      model ChannelDeliveryRequestedEvent extends IntegrationEvent { name: "integration.channel.delivery_requested"; text: string; }
      // e o único consumidor não reage — executa:
      export class DeliverChannelMessage extends EventHandler<typeof ChannelDeliveryRequestedEvent> {
        async handle(event) { await this.sender.send({ ...event.payload }, event.ownerId) }
      }
      // produtor: o "pedido" viaja por um transporte sem persistência; uma queda perde a ação.
      await this.mediator.publish(new ChannelDeliveryRequestedEvent({ ownerId, payload }))
    right: |
      // O comando é um comando: durável, executor único, enfileirado na transação do fato.
      await this.commands.enqueueCommand<DeliverChannelMessage>(
        'deliver_channel_message',
        { ownerId, channelId, contactExternalId, text, author },
        { jobId: entry.entryId },
        tx,
      )
      // O executor é um use case registrado no CommandQueue (BoundedContext `commandHandlers`),
      // com retry/backoff/lease da fila. O FATO, se importa para auditoria, continua existindo —
      // sem consumidor.
```

### Step T6.2 — Skill `event`: as três formas de ativação (TS)

Modify `.claude/skills/event/typescript/registry.yaml`:

1. Substitua a regra de `EVT-C02` por:

```yaml
      rule: "extends BaseIntegrationEvent, publicado via ExternalMediator pelo publisher NOMEADO do contexto (`Publish<Ctx>IntegrationEvents`) — nunca por um use case, nunca por outro handler. `publish()` PERSISTE a linha na lane `integration` do outbox (B3); a entrega é sempre do poller, at-least-once, e o consumidor deduplica"
```

2. Depois de `EVT-C10`, acrescente:

```yaml
    - id: EVT-C11
      name: "As três formas de ativação — e a intenção decide qual"
      when: "você está a ponto de criar um evento para fazer algo acontecer"
      rule: |
        # Fato (reativo/auditoria) → EVENTO.
        #   Domain event: persistido pelo use case na tx do agregado; o outbox entrega ao InternalMediator.
        #   Integration event: republicado pelo publisher NOMEADO do contexto; `publish()` grava na lane
        #   `integration` e o poller entrega (durável desde B3; antes era fan-out em memória).
        # Comando durável de executor único → CommandQueue.enqueueCommand(nome, input, opts, tx).
        # Turnos serializados por target → Mailbox.
        # Síncrono na própria request → use case chamado direto.
        #
        # A REGRA DE INTENÇÃO (founder, 29-jul-2026), citada literalmente: "evento existe para fins
        # reativos, auditoria ou event sourcing — nunca para comandar. Se a existência do evento é só
        # para um handler executar algo que poderia ser um comando/use case direto, está errado."
        #
        # ESCADA DO PAYLOAD, nesta ordem:
        #   1. O dado pertence ao fato? → o domain event o carrega desde o raise.
        #   2. O consumidor consegue reler? → evento thin, o consumidor busca o resto.
        #   3. Só então enrichment NO PUBLISHER do contexto, por um service injetado (exceção
        #      justificada — nunca no consumidor, nunca no transporte).
      wrong: "criar um evento novo porque 'aí um handler faz X' — X é um comando ou um use case"
```

### Step T6.3 — Skill `event/go`: o par

Modify `.claude/skills/event/go/registry.yaml`: depois de `EVT-GO-08`, acrescente:

```yaml
    - id: EVT-GO-09
      name: "As três formas de ativação — e a intenção decide qual (par Go de EVT-C11)"
      when: "você está a ponto de criar um evento para fazer algo acontecer"
      rule: |
        // Fato (reativo/auditoria) → EVENTO.
        //   Domain event: acumulado no agregado (AppendDomainEvent) e entregue pelo outbox.
        //   Integration event: publicado por um handler NOMEADO — a convenção Go é um handler POR
        //   EVENTO com sufixo *IntegrationHandler, em internal/<ctx>/handlers/, registrado
        //   nominalmente em module.go. Publish() INSERE a linha no outbox (durável) e faz fan-out dos
        //   callbacks in-process.
        // Comando durável de executor único → a fila de comandos, na transação do fato que o motiva.
        // Síncrono na própria request → chamar o use case direto.
        //
        // A REGRA DE INTENÇÃO (founder, 29-jul-2026), citada literalmente: "evento existe para fins
        // reativos, auditoria ou event sourcing — nunca para comandar. Se a existência do evento é só
        // para um handler executar algo que poderia ser um comando/use case direto, está errado."
        //
        // ESCADA DO PAYLOAD: (1) o dado pertence ao fato → o domain event o carrega; (2) o consumidor
        // relê → evento thin; (3) só então enrichment no handler publicador, por dependência injetada.
      wrong: "declarar um evento de wire cuja razão de existir é um handler executar uma ação"
```

### Step T6.4 — Skill `handler`: a exceção nomeada e a bad practice (TS)

Modify `.claude/skills/handler/typescript/registry.yaml`:

1. Em `bp-01`, substitua o bloco `right:` por:

```yaml
      right: |
        // Save domain event to outbox — OutboxDispatcher handles delivery
        await this.domainEventRepository.save(event)
        // Integration events: ExternalMediator.publish() PERSISTE na lane `integration` do outbox
        // (B3) e o poller entrega — e só o publisher nomeado do contexto pode chamá-lo (HDL-P13).
```

2. Depois de `HDL-P12`, acrescente:

```yaml
    - id: HDL-P13
      name: "A exceção nomeada: um publisher de integração POR CONTEXTO"
      when: "um fato do contexto precisa atravessar para outro bounded context/serviço"
      reason: >
        `Publish<Ctx>IntegrationEvents` é o ÚNICO código autorizado a chamar
        `ExternalMediator.publish()` — um por contexto, com união/`instanceof` sobre os fatos do
        contexto. Todo outro handler é domínio puro: reage, invoca use cases, e não publica
        integração. Com a publicação concentrada, a durabilidade do transporte mora num lugar só
        (`publish()` persiste na lane `integration`) e "quem pode publicar" é verificável por grep.
        A variante Go instancia a MESMA regra com a convenção dela (HDL-GO-08): um
        `*IntegrationHandler` por evento — não force o shape TS no Go.
      rule: |
        @injectable()
        export class PublishThreadIntegrationEvents extends EventHandler<readonly [typeof ThreadAttachedEvent]> {
          readonly event = [ThreadAttachedEvent] as const
          constructor(private readonly mediator: ExternalMediator) { super() }
          async handle(event: this['input']): Promise<void> {
            const ownerId = event.ownerId ?? ''
            if (event instanceof ThreadAttachedEvent) {
              await this.mediator.publish(new ThreadAttachedIntegrationEvent({ ownerId, payload: { ...event.payload } }))
            }
          }
        }
        // Enrichment, quando um dia for necessário: service INJETADO no publisher (3º degrau da
        // escada de payload — ver EVT-C11), nunca no consumidor.
      wrong: "qualquer handler fora de Publish<Ctx>IntegrationEvents chamando this.mediator.publish(...)"
```

3. No fim de `bad_practices`, acrescente:

```yaml
    - id: bp-09
      name: "Handler que EXECUTA uma ação de consumidor único (deveria ser CommandQueue ou use case direto)"
      severity: warning
      mechanical: false
      reason: >
        O handler é o único consumidor do evento e não reage a um fato — executa uma ação (POST a um
        serviço, envio, chamada externa). Então o evento existe para COMANDAR, e a forma certa é
        `CommandQueue.enqueueCommand(nome, input, opts, tx)` na MESMA transação do fato que motiva o
        comando (executor único, retry/backoff/lease de graça) ou o use case chamado direto. Regra de
        intenção do founder (29-jul-2026), cross-cutting em cc-bp-26 — julgamento, não grep.
        Precedente shipped: `DeliverChannelMessage` era `EventHandler` de
        `integration.channel.delivery_requested`, cujo transporte (`publish`) não persistia nada:
        gateway morto ou processo morto = mensagem perdida, sem retry e sem rastro. Virou o executor
        do comando `deliver_channel_message`.
      wrong: |
        export class DeliverChannelMessage extends EventHandler<typeof ChannelDeliveryRequestedEvent> {
          readonly event = ChannelDeliveryRequestedEvent
          async handle(event: this['input']): Promise<void> {
            await this.sender.send({ ...event.payload }, event.ownerId)   // executa, não reage
          }
        }
      right: |
        // O executor é um use case registrado no CommandQueue (BoundedContext `commandHandlers`):
        export class DeliverChannelMessage extends Handler<typeof DeliverChannelMessageInputSchema, typeof DeliverChannelMessageOutputSchema> {
          readonly name = 'deliver_channel_message' as const
          protected async handle(input: this['input'], tx?: Transaction): Promise<void> { /* … */ }
        }
        // …e o produtor ordena dentro da transação do fato:
        await this.commands.enqueueCommand<DeliverChannelMessage>('deliver_channel_message', { … }, { jobId: entry.entryId }, tx)
```

### Step T6.5 — Skill `handler/go`: o par

Modify `.claude/skills/handler/go/registry.yaml`:

1. Depois de `HDL-GO-07`, acrescente:

```yaml
    - id: HDL-GO-08
      name: "A exceção nomeada em Go: um *IntegrationHandler por evento, registrado nominalmente"
      when: "um fato do contexto precisa atravessar para outro bounded context/serviço"
      rule: |
        // A regra agnóstica é a mesma do TS (HDL-P13) — "publicação de integração só em publicadores
        // NOMEADOS; todo outro handler é domínio puro" — mas ela se instancia na convenção Go, que já
        // existe e é diferente: um handler POR EVENTO, sufixo *IntegrationHandler, em
        // internal/<ctx>/handlers/, com o ExternalMediator INJETADO no construtor (HDL-GO-05) e
        // registro NOMINAL em module.go. Nunca em use case, repositório, controller/rota ou service.
        //
        // internal/channel/handlers/remotes_synced_handler.go
        func (h *RemotesSyncedIntegrationHandler) Handle(ctx context.Context, event types.DomainEventI) error {
            if err := h.externalMediator.Publish(ctx, integrationEvent); err != nil {
                return err
            }
            return nil
        }
        // internal/channel/module.go — registro nominal, um por linha
        m.Register(handlers.NewRemotesSyncedIntegrationHandler(ext))
      wrong: "Publish() chamado de um use case, de um repositório, de uma rota ou de um service; ou um publicador anônimo/ad-hoc fora de internal/<ctx>/handlers/"
```

2. No fim de `bad_practices`, acrescente:

```yaml
    - id: bp-GO-HDL-07
      name: "Handler que EXECUTA uma ação de consumidor único (par Go de handler/typescript bp-09)"
      severity: warning
      mechanical: false
      reason: >
        O handler é o único consumidor do evento e não reage a um fato — executa uma ação. Então o
        evento existe para COMANDAR. Regra de intenção do founder (29-jul-2026), citada literalmente:
        "evento existe para fins reativos, auditoria ou event sourcing — nunca para comandar. Se a
        existência do evento é só para um handler executar algo que poderia ser um comando/use case
        direto, está errado." A forma certa é um comando durável (enfileirado na transação do fato que
        o motiva, executor único, com retry) ou o use case chamado direto. Julgamento, não grep.
      wrong: |
        // evento de wire declarado só para que ISTO rode
        func (h *SendSomethingHandler) Handle(ctx context.Context, event fwtypes.IntegrationEventI) error {
            return h.client.Post(ctx, typed.Payload) // executa, não reage
        }
      right: |
        // O fato, se importa, continua sendo fato; a AÇÃO é comandada — enfileirada na mesma
        // transação do fato, com executor único e retry, ou chamada direto pelo use case.
```

### Step T6.6 — Skill `usecase`: o comando durável

Modify `.claude/skills/usecase/typescript/registry.yaml`: depois de `UC-P15`, acrescente:

```yaml
    - id: UC-P16
      name: "Comando durável cross-processo: enqueueCommand(..., tx) na transação do fato"
      when: "o use case precisa que algo aconteça fora do processo/da request, com retry, e o executor é único"
      reason: >
        `SqliteCommandQueue.enqueueCommand(name, input, opts, tx)` INSERE em
        `shared_scheduled_commands` DENTRO da transação do chamador, então "agendar" commita ou aborta
        junto com a escrita de domínio que motiva o comando — sem dual-write. Uma queda entre "o
        usuário vê o efeito" e "a ação externa aconteceu" deixa a linha na fila, e o worker
        (registrado pelo `commandHandlers` do BoundedContext) reexecuta com backoff exponencial, lease
        de 60s e dead-letter em `MAX_ATTEMPTS`. É a alternativa DURÁVEL ao evento-comando (cc-bp-26).
        Canonical snippet: `thread/usecases/SendDirectMessage.ts`.
      rule: |
        constructor(
          private readonly transcript: TranscriptRepository,
          private readonly commands: CommandQueue,
        ) { super() }

        return this.withTransaction(tx, async tx => {
          const entry = await this.transcript.append({ … }, tx)
          // MESMA transação da escrita que o motiva. `jobId` é a chave natural do fato (aqui o
          // entryId), então um reenvio do mesmo fato deduplica em vez de mandar duas vezes.
          await this.commands.enqueueCommand<DeliverChannelMessage>(
            'deliver_channel_message',
            { ownerId: thread.ownerId, channelId: thread.channelId, contactExternalId: thread.contactRef.externalId, text: input.text, author: MessageAuthor.HUMAN },
            { jobId: entry.entryId },
            tx,
          )
          return { entryId: entry.entryId }
        })
      wrong: "enfileirar fora da transação (dual-write: a ação sobrevive a um rollback, ou o rollback perde a ação); ou publicar um integration event para que um único handler execute a ação"
```

### Step T6.7 — A tabela de decisão na skill mais alta de arquitetura de eventos

Modify `.claude/skills/event/SKILL.md`: depois do parágrafo de abertura e antes de `## Language variants`, insira:

```markdown
## Ativação — qual mecanismo (decisão do founder, 29-jul-2026)

| Precisa de… | Mecanismo | Garantia | Quem entrega |
|---|---|---|---|
| "isto aconteceu, quem quiser reage" (fato, auditoria, event sourcing) | **outbox** — domain event no contexto; integration event pelo publisher nomeado | durável, at-least-once, fan-out | dispatcher/poller do outbox |
| "isto precisa acontecer, com retry, e alguém é o único executor" | **CommandQueue** — `enqueueCommand(nome, input, opts, tx)` na transação do fato | durável, retry+backoff, lease, dead-letter | o worker que registrou o comando |
| "turnos serializados por target" | **Mailbox** — produtores só ENFILEIRAM, sempre na transação do fato | durável, um turno por target de cada vez | o MailboxDispatcher (consumidor único) |
| "síncrono, nesta request" | **use case chamado direto** | a transação da própria request | o chamador |

**A regra de intenção:** evento existe para fins reativos, auditoria ou event sourcing — **nunca para
comandar**. Se a existência do evento é só para um handler executar algo que poderia ser um
comando/use case direto, está errado. Nomes `*Requested` não são proibidos por si; a intenção é o
critério. Enforcement: `cc-bp-26` (cross-cutting, warning), `handler` bp-09 / bp-GO-HDL-07,
`EVT-C11` / `EVT-GO-09`, `UC-P16`.
```

### Step T6.8 — Gates das skills

Run: `bun test:tooling`
Expected: exit 0 — todo `registry.yaml` novo carrega (yaml válido), os gates de taxonomia/skill-examples e os testes dos hooks seguem verdes.

Run: `bun detect`
Expected: exit 0 sem findings novos — as entradas adicionadas são `mechanical: false`, então não entram no scan mecânico nem mexem no baseline.

### Step T6.9 — Commit

```bash
git add .claude/registry.yaml \
        .claude/skills/event/SKILL.md \
        .claude/skills/event/typescript/registry.yaml \
        .claude/skills/event/go/registry.yaml \
        .claude/skills/handler/typescript/registry.yaml \
        .claude/skills/handler/go/registry.yaml \
        .claude/skills/usecase/typescript/registry.yaml
git commit -m "docs(skills): B3 — a regra de intenção entra no registry e nas skills (TS e Go)

cc-bp-26 (warning, mechanical: false — a regra é de julgamento, decisão explícita
do founder), mais o par por linguagem: event EVT-C11/EVT-GO-09, handler
HDL-P13+bp-09 / HDL-GO-08+bp-GO-HDL-07, usecase UC-P16, e a tabela de decisão
outbox/CommandQueue/Mailbox/use-case-direto na skill mais alta de eventos.

As regras Go instanciam a convenção Go que JÁ existe (um *IntegrationHandler por
evento em internal/<ctx>/handlers/, registrado nominalmente em module.go) — o
shape TS (Publish<Ctx>IntegrationEvents por contexto) não é forçado lá. Regra sem
par Go não conta como entregue (AC-10).

bp-01 do handler/typescript deixa de afirmar que publish é 'fire-and-forget, no
outbox' — desde B3 ele persiste."
```

---

## Task T7: Fechamento — os greps provam zero instâncias fora do inventário

**Files to write:**
- Create: `.plans/artifacts/2026-07-29-b3-activation-closure.md`

**Files to read:**
- `.specs/2026-07-29-activation-semantics-design.md` — os 10 ACs que o artefato mapeia

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** haiku
**Depends on:** T6
**Consumes (frozen):** o inventário deste plano (12 call sites TS conformes após B3 = 10 linhas em 5 publishers; Go = 21 linhas, todas em `internal/channel/handlers/`) e os caminhos de teste de T1-T5 para o mapa AC→teste.
**Scope fence:** DONE: todo o código e todas as skills. OUT: qualquer mudança de código — este Task só MEDE e registra. Nenhuma Task deste plano toca ou staga `packages/api/typescript/src/thread/entities/Thread.ts` (edição não commitada do founder).
**Gate:** `bun tsc && bun lint && bun test && bun detect` — exit 0 nos quatro
**Skills:** /test

### Step T7.1 — O grep de fechamento do TS

Run: `grep -rn "\.publish(" packages/api/typescript/src --include='*.ts' | grep -v test`
Expected: exatamente 10 linhas, TODAS dentro dos cinco `Publish*IntegrationEvents` — `workspace/handlers/PublishWorkspaceIntegrationEvents.ts` (1), `agent/handlers/PublishAgentIntegrationEvents.ts` (5), `issue/handlers/PublishIssueIntegrationEvents.ts` (2), `artifact/handlers/PublishArtifactIntegrationEvents.ts` (1), `thread/handlers/PublishThreadIntegrationEvents.ts` (1). Zero linhas em qualquer outro arquivo (as duas que morreram: a branch de delivery do thread e `DeliverOrchestratorReply.ts:69`).

### Step T7.2 — O grep de fechamento do Go

Run: `grep -rn "\.Publish(" packages/api/go/internal packages/api/go/core --include='*.go' | grep -v _test.go`
Expected: 21 linhas, TODAS em `packages/api/go/internal/channel/handlers/*.go`. Zero em use cases, repositórios, rotas ou services — a convenção Go já estava fechada (26 itens inventariados, zero violações) e continua.

### Step T7.3 — Proposed file: Create `.plans/artifacts/2026-07-29-b3-activation-closure.md`

Escreva o artefato com: (a) a saída VERBATIM dos dois greps dos steps T7.1/T7.2, (b) a tabela AC-1..AC-10 → caminho de teste/evidência (copiada do bloco Final Validation abaixo, com os resultados reais), (c) a saída de `bun tsc`/`bun lint`/`bun test`/`bun detect`/`cd packages/e2e && bun run test`, e (d) as observações O1-O5 das Notes deste plano, marcadas como pendências de decisão do founder (nenhuma virou Task).

### Step T7.4 — Gates completos

Run: `bun tsc`
Expected: exit 0

Run: `bun lint`
Expected: exit 0

Run: `bun test`
Expected: 0 fail (nx run-many, exclui e2e)

Run: `bun detect`
Expected: exit 0

Run: `cd packages/e2e && bun run test`
Expected: exit 0 — a entrega passou a ser assíncrona (poll de 1s da fila) mas nenhum spec observa o envio (o `ChannelSender` é o mock sob `CODEDM_E2E`), e o transcript entry da resposta continua sendo escrito no mesmo turno.

### Step T7.5 — Commit

```bash
git add .plans/artifacts/2026-07-29-b3-activation-closure.md
git commit -m "docs(plans): B3 — artefato de fechamento (greps citados + mapa AC→teste)

TS: 10 call sites de ExternalMediator.publish, todos dentro dos 5
Publish*IntegrationEvents. GO: 21 call sites de Publish, todos em
internal/channel/handlers/. Zero instâncias do padrão fora do inventário nas duas
linguagens (AC-10)."
```

---

## Final Validation

- [ ] `bun tsc` — type check completo, exit 0
- [ ] `bun lint` — exit 0
- [ ] `bun test` — 0 fail (todos os workspaces exceto e2e)
- [ ] `bun detect` — exit 0, sem findings novos
- [ ] `bun check:generated` — exit 0 (o contrato removido e o SDK regenerado não derivaram)
- [ ] `bun test:tooling` — exit 0 (registries das skills carregam e os gates de taxonomia passam)
- [ ] `cd packages/e2e && bun run test` — exit 0 (suíte completa; `bun e2e` NÃO é usado neste repo)
- [ ] AC mapping (todo AC da spec → ≥1 caminho de teste):
  - AC-1 → Step T4.1 + T4.6 (greps vazios em `src`, `packages/contracts`, `client/dist`, `openapi.json`) e `bun check:generated` no Gate de T4
  - AC-2 → `packages/api/typescript/src/thread/usecases/SendDirectMessage.test.ts:"ATOMICITY — a rolled-back transaction leaves NEITHER the transcript entry NOR the command"` (+ o caso do enqueue com `jobId = entryId`)
  - AC-3 → `packages/api/typescript/src/thread/usecases/RecordOrchestratorReply.test.ts:"ATOMICITY — a rolled-back transaction leaves NEITHER the entry NOR the command"` (+ `packages/api/typescript/src/thread/handlers/DeliverOrchestratorReply.test.ts:"delegates: a valid envelope produces the SYSTEM entry and the delivery command"`)
  - AC-4 → `packages/api/typescript/src/thread/usecases/DeliverChannelMessage.test.ts:"FALSEADOR — a failed send is RETRIED from the queue: the command survives, backs off, and delivers on the next tick"` + o registro como executor em `packages/api/typescript/src/thread/index.ts` (`commandHandlers`)
  - AC-5 → `packages/api/typescript/src/thread/usecases/SendDirectMessage.test.ts:"the \`thread.direct_message_sent\` FACT is still recorded — it is an audit record with no consumer (decision 3)"` + grep `DirectMessageSentEvent` em `src/thread/handlers/` retorna vazio
  - AC-6 → `packages/api/typescript/core/src/services/Mediator/SqlExternalMediator.test.ts:"publish PERSISTS on this lane and dispatches NOTHING in the same call stack"` (par vermelho→verde: Step T5.2 → T5.8) + `packages/api/typescript/core/src/repositories/DrizzleDomainEventRepository.test.ts:"an INTEGRATION event lands on the \`integration\` lane — the lane whose claimant is SqlExternalMediator"`
  - AC-7 → `packages/api/typescript/tests/flows/ts-integration-lane.flow.test.ts:"publica → linha na lane \`integration\`, ZERO handlers rodados; drainOnce entrega e tombstona"` e `:"sobrevive ao crash: a linha publicada por um processo é entregue por OUTRA instância do mediator"`; docblocks da lane e da classe atualizados no Step T5.5
  - AC-8 → `.claude/registry.yaml` `cc-bp-26` (severity `warning`, sem `mechanical: true`) + `event/{typescript,go}` `EVT-C11`/`EVT-GO-09` + `handler/{typescript,go}` `bp-09`/`bp-GO-HDL-07` + `usecase/typescript` `UC-P16`; provado por `bun test:tooling`
  - AC-9 → Step T7.1 (grep: 10 linhas, só nos 5 publishers) + `HDL-P13` no registry do handler
  - AC-10 → `.plans/artifacts/2026-07-29-b3-activation-closure.md` (saída verbatim dos dois greps) + a seção "Inventário (rodada de pesquisa TS+Go)" deste plano + paridade Go das entradas de skill (T6.3/T6.5)

## Notes

- **`bun e2e` NÃO é usado neste repo** — o script é `cd packages/e2e && bun run test` (a convenção estabelecida no C8 é chamar o workspace direto).
- **A edição não commitada do founder em `packages/api/typescript/src/thread/entities/Thread.ts`** não é tocada nem stageada por nenhuma Task deste plano. Se algum gate acusar erro nesse arquivo, PARE e reporte — não é deste plano.
- **Paridade de `publish()` por env.** `real` é o único env que muda: `SqlExternalMediator` persiste. `mock` (`MockExternalMediator`) já tinha a semântica nova por construção — `publish` REGISTRA o evento e não executa handler nenhum (só `dispatch` executa), então "publish não despacha" vale lá desde sempre. `integration` e o `TestBed` (que troca ambos os mediators por `SpyMediator` sobre `EventEmitter2Mediator`) **mantêm o fan-out em memória DE PROPÓSITO**: o harness não roda poller, e um double que exigisse `drainOnce` faria todo flow test crescer um loop de poll. A semântica da lane é provada onde ela existe — contra a classe real sobre um arquivo real (`tests/flows/ts-integration-lane.flow.test.ts`, `core/.../SqlExternalMediator.test.ts`). `RedisExternalMediator` não é bindado por nenhum env deste produto e fica intocado.
- **Achado C8 (observação, NÃO virou Task — fora das Decisions).** O `DrizzleOutboxDispatcher` retém o lease como backoff (`finalizeFailure`, linha ~323: "Lease deliberately retained → natural 30s backoff"), então **uma falha transiente custa 30s de latência de materialização** — foi o que estourou o poll de 20s do e2e com `workers: 2` e levou o C8 a fixar `workers: 1`. Fora de teste, o mesmo custo aparece como "a issue demorou meio minuto pra aparecer". Candidato a backoff menor/jitter no PRIMEIRO retry; decisão do founder, e o B3 não a antecipa.
- **O1 — RESOLVIDA (emenda no T5.5(5) + caso de teste no T5.1(3)): o poller entrega também aos callbacks.** O achado: o claim filtrava por nomes com handler registrado, então com o publish→lane os fatos TS sem consumidor backend (`stop_resolved`, `issue.archived`, `thread.attached`) nunca mais chegariam ao SSE. A resolução NÃO é decisão nova — é derivação de três decisões aprovadas: a decisão 5 desta spec ("o SSE broadcaster passa a disparar A PARTIR DO POLLER"), a ratificação no-allowlist de 23-jul ("todo o surface integration.* vai ao browser", citada na spec do B5) e o desenho aprovado do B5 (front escuta `integration.thread.stop_resolved` cru). As alternativas (notificar no `publish`; aceitar a perda) contradiriam essas decisões. Premissa anotada, reversível — veto do founder desfaz com um commit.
- **O2 (observação, NÃO virou Task).** A lane não tem owner-skip (`finalizeFailure`: "this lane does not group by owner"), então a ordenação que o `publish` awaited garantia por construção — `issue.opened` antes de `issue.completed` — passa a valer só INTRA-BATCH (`ORDER BY created_at`). Um predecessor que falha não segura o sucessor. `CompleteIssue` trata "issue not found" como no-op idempotente sem retry, o que era exatamente o cenário que o docblock antigo dizia proteger. A spec já responde com "consumidores deduplicam" (decisão 5); um degrau a mais (sequência por owner na lane) é decisão do founder.
- **O3 (observação, NÃO virou Task).** `DeliverChannelMessage` **nunca passou `quotedMessageId` ao `sender.send()`** — a citação que `RecordOrchestratorReply` resolve via `findPlatformId` é montada, viaja e é descartada no envio (idem `replyEntryId`, que o docblock diz existir para um `linkEntry` que não é chamado). O comando carrega os dois campos para preservar a resolução dos produtores; o executor mantém o comportamento shipped. Ativar a citação no wire é mudança de comportamento e não é do B3.
- **O4 (observação, NÃO virou Task).** O `@doc` de `packages/contracts/wire/enums/outbox-source.tsp` afirma que "the Go SqlExternalMediator claims `integration`" — falso desde que o gêmeo Go virou egress-only, e mais falso depois do B3. Corrigir mexe em arquivos gerados + `contracts.openapi.yaml`; ficou fora porque a decisão 5 nomeia o docblock do `SqlExternalMediator`, não o do enum.
- **O5 (observação, NÃO virou Task).** O `shutdown()` do daemon (`src/index.ts:127-144`) não tem passo para o `CommandQueue` — os jobs repetíveis já convivem com isso desde sempre, e o lease de 60s cobre um comando interrompido no meio. Com a entrega de mensagem agora na fila, um `close()` gracioso pouparia uma tentativa queimada por deploy.
