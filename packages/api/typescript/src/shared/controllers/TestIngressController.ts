import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z, ExternalMediator, DrizzleClient } from '@codedm/core-typescript'
import { channels } from '@codedm/contracts/db'
import { ChannelKind, ContactKind, ChannelStatus, MessageType } from '@codedm/contracts-typescript/wire/enums'
import { ChannelMessageReceivedEvent } from '@codedm/contracts-typescript/wire/events'
import { OperatorMiddleware } from '@auth/middlewares'

/**
 * TEST-ONLY gateway ingress seam — mounted ONLY under `CODEDM_E2E` (see shared/index.ts) and refused
 * outright under NODE_ENV=production (src/boot/assert-e2e-safe.ts). Never emitted to the SDK/OpenAPI
 * (route collection runs under EMIT_OPENAPI, where CODEDM_E2E is unset, so the controller is not mounted).
 *
 * Founder decision 3 runs two processes — the Go Channel Gateway and this TS daemon — bridged over
 * Redis Streams. The Playwright harness boots ONLY the TS daemon; the gateway is simulated at the
 * integration-event seam. This endpoint is that simulator. It reproduces the two gateway side effects
 * a spec needs:
 *
 *   - `channel-connected` — the gateway's status projector writes a CONNECTED row into the (Go-owned)
 *     `gateway.channels` read table on pairing. No TS code path writes it, so a hermetic spec seeds it
 *     here (a direct upsert) to make a channel `CONNECTED` for AttachThread + inbound routing.
 *   - `inbound-message`   — a normalized inbound message arriving on a connected channel. In production
 *     the gateway XADDs the frozen `integration.channel_message.received` wire event onto Redis and the
 *     RedisExternalMediator consumes it; here we publish the SAME event straight into the in-process
 *     ExternalMediator (bound to EventEmitter2Mediator under CODEDM_E2E), so `ConsumeInboundMessage`
 *     drives the identical dedup → ingest → classify chain. `publish` matches the fire-and-forget
 *     delivery semantics of the Redis transport; the spec polls for the downstream issue.
 */
const ChannelConnectedBody = z.object({
	kind: z.literal('channel-connected'),
	channelId: z.uuid().optional(),
	platform: z.enum(ChannelKind).default(ChannelKind.WHATSAPP),
	accountDetail: z.string().default('e2e-account'),
})

// SINGLE INTENTIONAL SHIM — NOT a second contract. The union-slots pilot (§4) moved the wire
// event `integration.channel_message.received` to the VERBATIM gateway shape (remoteId/senderId/
// timestamp/observedAt + opaque content/platformData slots). This spec-facing body deliberately
// keeps the OLD normalized vocabulary (contactExternalId/contactDisplayName/text/quotedEntryId)
// because it is what Playwright givens speak; handle() below is the ONE place that maps it onto
// the verbatim payload, exactly like the Go gateway's whatsmeow mapper does. Do not copy this
// normalized shape anywhere else, and do not accept it on any real ingress surface — if the
// givens ever migrate to the verbatim shape, delete this mapping rather than growing it.
const InboundMessageBody = z.object({
	kind: z.literal('inbound-message'),
	channelId: z.uuid(),
	contactExternalId: z.string().min(1),
	messageId: z.string().min(1).optional(),
	senderExternalId: z.string().min(1).optional(),
	contactDisplayName: z.string().min(1).default('Ada'),
	contactKind: z.enum(ContactKind).default(ContactKind.CONTACT),
	isGroup: z.boolean().default(false),
	text: z.string().min(1),
	quotedEntryId: z.uuid().optional(),
	platform: z.enum(ChannelKind).default(ChannelKind.WHATSAPP),
})

export const TestIngressInputSchema = z.object({
	ctx: z.object({ ownerId: z.uuid() }),
	body: z.discriminatedUnion('kind', [ChannelConnectedBody, InboundMessageBody]),
})

export const TestIngressOutputSchema = z.object({
	ok: z.boolean(),
	channelId: z.string().optional(),
	messageId: z.string().optional(),
})

@injectable()
export class TestIngressController extends Controller<typeof TestIngressInputSchema, typeof TestIngressOutputSchema> {
	readonly path = '/_test/gateway'
	readonly method = 'post' as const
	readonly description = 'TEST-ONLY: simulate a Go-gateway side effect (seed a connected channel / inject an inbound message)'
	readonly inputSchema = TestIngressInputSchema
	readonly outputSchema = TestIngressOutputSchema

	override middlewares = [OperatorMiddleware]

	constructor(
		private readonly externalMediator: ExternalMediator,
		private readonly db: DrizzleClient,
	) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const { ownerId } = request.ctx
		const body = request.body

		if (body.kind === 'channel-connected') {
			const channelId = body.channelId ?? crypto.randomUUID()
			await this.db
				.insert(channels)
				.values({
					id: channelId,
					ownerId,
					kind: body.platform,
					status: ChannelStatus.CONNECTED,
					accountDetail: body.accountDetail,
				})
				.onConflictDoUpdate({
					target: channels.id,
					set: { status: ChannelStatus.CONNECTED, accountDetail: body.accountDetail, updatedAt: new Date() },
				})
			return { status: HttpStatusCode.OK, data: { ok: true, channelId } }
		}

		// Publish the VERBATIM gateway payload (union-slots pilot): the spec-facing body stays
		// normalized (contact*/text) for the Playwright givens, and this simulator maps it onto
		// the frozen wire shape exactly like the Go gateway's whatsmeow mapper does — remoteId =
		// the counterparty chat id, `content` = the WHATSAPP/TEXT variant shape (owner: apiGo).
		const messageId = body.messageId ?? `wamid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
		const now = new Date()
		await this.externalMediator.publish(
			new ChannelMessageReceivedEvent({
				ownerId,
				payload: {
					channelId: body.channelId,
					messageId,
					internalMessageId: crypto.randomUUID(),
					remoteId: body.contactExternalId,
					senderId: body.senderExternalId ?? body.contactExternalId,
					fromMe: false,
					isGroup: body.isGroup,
					timestamp: Math.floor(now.getTime() / 1000),
					occurredAt: now,
					observedAt: now,
					messageType: MessageType.TEXT,
					content: { text: body.text },
					platform: body.platform,
					platformData: undefined,
					ownerId,
				},
			}),
		)
		return { status: HttpStatusCode.OK, data: { ok: true, messageId } }
	}
}
