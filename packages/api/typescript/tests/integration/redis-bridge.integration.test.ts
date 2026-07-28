import { RedisClient } from 'bun'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import type { ZodType } from 'zod'
import { TestBed, givenThread, GIVEN_MENTION_TAG } from '@test/support'
import { RedisExternalMediator, Config, type Handler } from '@codedm/core-typescript'
import { OPERATOR_ID } from '@auth/operator'
import { ConsumeInboundMessage } from '@thread/handlers/ConsumeInboundMessage'
import { ConsumedMessageRepository } from '@thread/repositories/ConsumedMessageRepository'
import { TranscriptRepository } from '@thread/repositories/TranscriptRepository'
import { AgentRunner } from '@agent/services/AgentRunner'
import { AgentRunnerFactory, FixedAgentRunnerFactory } from '@agent/services/AgentRunnerFactory'
import { AgentRunOutcome } from '@agent/enums'
import type { AgentRunRequest, AgentRuntimeEvent } from '@agent/types'

/**
 * PROVES the Go→TS bridge end to end over a REAL Redis (phase 9-1). The Go channel gateway publishes
 * `integration.channel_message.received` by XADD-ing `json.Marshal(types.IntegrationEvent)` — the
 * NESTED envelope `{id, ownerId, time, name, payload}` whose payload is the VERBATIM gateway shape
 * (union-slots pilot: remoteId/senderId + the opaque `content` slot carrying the WHATSAPP/TEXT
 * variant) — onto `events:integration.channel_message.received` (api-go
 * internal/shared/services/mediator/redis_mediator.go). This test XADDs that exact byte shape via a
 * raw Redis client (impersonating the Go producer) and asserts the TS `RedisExternalMediator`
 * consume loop drives the real handler chain:
 *
 *   XADD wire envelope  →  RedisExternalMediator (consumer-group drain+PEL+ack; medscall lineage)
 *                       →  adaptWireEnvelope passthrough + revive ISO dates  →  ConsumeInboundMessage
 *                       →  dedup ledger row (ConsumedMessageRepository) + transcript entry (ingest)
 *                       →  thread.message_classified fact (classify)
 *
 * A redelivery of the SAME platform message is proven a no-op (exactly-once PROCESSING over the
 * at-least-once transport).
 *
 * SKIP-GATED: requires a reachable Redis. Start it with `bun stack:up` (or
 * `docker compose -f docker/docker-compose.yml up -d redis`). When unreachable the whole suite is
 * skipped with a clear message rather than failing. Uses Bun's built-in Redis client (no dep).
 */

const STREAM = 'events:integration.channel_message.received'
const EVENT_NAME = 'integration.channel_message.received'
const REDIS_URL = Config.env.REDIS_URL
const GROUP_ID = Config.env.API_EVENT_GROUP_ID

async function redisReachable(url: string): Promise<boolean> {
	const client = new RedisClient(url, { autoReconnect: false })
	try {
		await Promise.race([
			(async () => {
				await client.connect()
				await client.send('PING', [])
			})(),
			new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
		])
		return true
	} catch {
		return false
	} finally {
		try {
			client.close()
		} catch {
			/* already closed */
		}
	}
}

const REACHABLE = await redisReachable(REDIS_URL)
if (!REACHABLE) {
	console.warn(
		`\n[redis-bridge] SKIPPED — Redis not reachable at ${REDIS_URL}.\n` +
			'  Start it with `bun stack:up` (or `docker compose -f docker/docker-compose.yml up -d redis`)\n' +
			'  to run the Go→TS bridge proof.\n',
	)
}
const describeBridge = REACHABLE ? describe : describe.skip

/** Deterministic classifier stub → NEW_ISSUE, so classify emits `thread.message_classified`. */
class NewIssueStubRunner extends AgentRunner {
	async *run<OutputSchema extends ZodType | undefined = undefined>(
		request: AgentRunRequest<OutputSchema>,
	): AsyncIterable<AgentRuntimeEvent> {
		const output = request.outputSchema ? { decision: 'NEW_ISSUE', title: 'Fix the login bug' } : undefined
		yield {
			type: 'finished',
			result: {
				outcome: AgentRunOutcome.COMPLETED,
				replyText: JSON.stringify(output ?? 'done'),
				sessionId: null,
				output,
				failed: false,
			},
		}
	}
	async shutdown(): Promise<void> {}
}

/**
 * The FLAT wire envelope exactly as the Go egress marshals it (copied field-for-field from
 * api-go internal/channel/handlers/egress_test.go → TestMessageReceivedEgress_PublishesFrozenContract):
 * framework fields (name/entityId/ownerId/occurredAt) sit ALONGSIDE the domain scalars — no `payload`
 * wrapper — and `receivedAt` is an RFC3339 string. `senderExternalId` is a non-participant so the
 * message is invocable (drives classification); channelId/contactExternalId bind it to the thread.
 */
function goWireEnvelope(channelId: string, contactExternalId: string, messageId: string): string {
	const now = new Date().toISOString()
	// Byte shape of api-go `json.Marshal(types.IntegrationEvent[wire.ChannelMessageReceivedPayload])`.
	return JSON.stringify({
		id: crypto.randomUUID(),
		ownerId: OPERATOR_ID,
		time: now,
		name: EVENT_NAME,
		payload: {
			channelId,
			messageId,
			internalMessageId: crypto.randomUUID(),
			remoteId: contactExternalId,
			senderId: 'stranger-42',
			fromMe: false,
			isGroup: false,
			timestamp: Math.floor(Date.now() / 1000),
			occurredAt: now,
			observedAt: now,
			messageType: 'TEXT',
			content: { text: `${GIVEN_MENTION_TAG} fix the login bug` },
			platform: 'WHATSAPP',
			ownerId: OPERATOR_ID,
		},
	})
}

async function waitUntil(predicate: () => Promise<boolean>, { timeout = 20_000, interval = 100 } = {}): Promise<void> {
	const deadline = Date.now() + timeout
	for (;;) {
		if (await predicate()) return
		if (Date.now() > deadline) throw new Error('waitUntil: predicate did not become true within timeout')
		await new Promise(r => setTimeout(r, interval))
	}
}

describeBridge('Go→TS Redis bridge: wire envelope → consume → dedup + classify', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let mediator: RedisExternalMediator
	let producer: RedisClient
	let deliveries = 0

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
		// Deterministic classification (NEW_ISSUE) — set BEFORE resolving the consumer graph.
		testBed.override(AgentRunnerFactory, new FixedAgentRunnerFactory(new NewIssueStubRunner()))

		producer = new RedisClient(REDIS_URL)
		await producer.connect()
		// Fresh stream, and PRE-CREATE the group at `0` so any XADD (before or after the loop starts)
		// is delivered via `>` — the mediator's own MKSTREAM-at-`$` create is a tolerated BUSYGROUP.
		await producer.send('DEL', [STREAM, `${STREAM}:dead`])
		await producer.send('XGROUP', ['CREATE', STREAM, GROUP_ID, '0', 'MKSTREAM'])

		// A counting spy alongside the real consumer, so a redelivery can be proven CONSUMED (not just
		// sitting in the stream) without introspecting Redis. Registered second: the mediator fans each
		// entry to every handler for the event in order.
		const spy: Handler = {
			name: EVENT_NAME,
			events: [EVENT_NAME],
			bindContainer() {
				return spy
			},
			async execute() {
				deliveries++
			},
		} as unknown as Handler

		mediator = new RedisExternalMediator()
		await mediator.register(testBed.resolve(ConsumeInboundMessage))
		await mediator.register(spy)
		await mediator.start()
	}, 60_000)

	afterAll(async () => {
		await mediator?.stop()
		try {
			producer?.close()
		} catch {
			/* already closed */
		}
		await testBed?.destroy()
	})

	it('consumes the Go wire envelope → dedup row + transcript + thread.message_classified; redelivery is a no-op', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const channelId = thread.channelId
		const contactExternalId = thread.contactRef.externalId
		const messageId = `wamid-${Date.now()}`

		const consumed = testBed.resolve(ConsumedMessageRepository)
		const transcript = testBed.resolve(TranscriptRepository)

		// 1. The Go gateway publishes the frozen wire event (nested verbatim envelope) onto the stream.
		await producer.send('XADD', [STREAM, 'MAXLEN', '~', '10000', '*', 'data', goWireEnvelope(channelId, contactExternalId, messageId)])

		// 2. The bridge consumes it → dedup ledger row written (message consumed).
		await waitUntil(() => consumed.has(channelId, messageId))
		expect(await consumed.has(channelId, messageId)).toBe(true)

		// 3. Ingested → exactly one CONTACT transcript entry (proves the verbatim payload decoded: the
		//    WHATSAPP/TEXT content slot narrowed via the generated owner schema, senderId mapped, and
		//    the ISO `occurredAt` revived to a Date the z.date() input accepts).
		await waitUntil(async () => (await transcript.listByThread(thread.id.value)).filter(e => e.kind === 'CONTACT').length === 1)
		expect((await transcript.listByThread(thread.id.value)).filter(e => e.kind === 'CONTACT')).toHaveLength(1)

		// 4. Classified → the demux fact `thread.message_classified` is persisted for this thread.
		await waitUntil(async () => {
			const events = await testBed.probe().persistedEvents({ name: 'thread.message_classified', entityId: thread.id.value })
			return events.length >= 1
		})
		const classified = await testBed.probe().persistedEvents({ name: 'thread.message_classified', entityId: thread.id.value })
		expect(classified.length).toBeGreaterThanOrEqual(1)

		// 5. Redelivery of the SAME platform message — at-least-once transport, exactly-once PROCESSING.
		const deliveriesBefore = deliveries
		await producer.send('XADD', [STREAM, 'MAXLEN', '~', '10000', '*', 'data', goWireEnvelope(channelId, contactExternalId, messageId)])
		await waitUntil(async () => deliveries >= deliveriesBefore + 1) // the redelivery was actually consumed

		expect((await transcript.listByThread(thread.id.value)).filter(e => e.kind === 'CONTACT')).toHaveLength(1) // dedup latch held
	}, 45_000)
})
