import { injectable } from 'tsyringe-neo'
import { Controller, z, MimeTypes, ExternalMediator, SSE_CONNECTED_FRAME, createSSEResponse, encodeSSEFrame } from '@codedm/core-typescript'
import { BaseIntegrationEvent } from '@codedm/core-typescript'
import { ThreadStatus, StopKind } from '@codedm/contracts-typescript/wire/enums'
// Generated zod variant schemas from the OWNER service's client subpath (types/schemas ONLY — never
// the HTTP client): the composed union below is how this surface re-emits the gateway's
// channel_message.received with FULL narrowing, without redeclaring a single shape (union-slots
// spec §2.4 — one shape, N surfaces, zero redeclaration).
import {
	channelMessageReceivedPayloadInternalTextSchema,
	channelMessageReceivedPayloadWhatsappAudioSchema,
	channelMessageReceivedPayloadWhatsappContactSchema,
	channelMessageReceivedPayloadWhatsappDocumentSchema,
	channelMessageReceivedPayloadWhatsappImageSchema,
	channelMessageReceivedPayloadWhatsappLocationSchema,
	channelMessageReceivedPayloadWhatsappPollSchema,
	channelMessageReceivedPayloadWhatsappReactionSchema,
	channelMessageReceivedPayloadWhatsappStickerSchema,
	channelMessageReceivedPayloadWhatsappTextSchema,
	channelMessageReceivedPayloadWhatsappVideoSchema,
} from '@codedm/client-typescript/go'
import { OperatorMiddleware } from '@auth/middlewares'
import { BrowserFrameEnricher } from '../services/BrowserFrameEnricher'

/**
 * The curated browser-facing event union — the dashboard operator-scoped SSE surface.
 *
 * These are the CodeDM integration events (frozen in the Phase-0 contract lock,
 * `packages/contracts/wire/events/*.tsp`) that drive the live operator console: the Needs-You
 * callout + dock badge, live issue lists, transcript action lines + chat bubbles, and channel
 * health / live QR. They subsume the modeling's `browser.*` frames:
 *   - `browser.stop_raised`            ← integration.issue.stop_raised
 *   - `browser.thread_status_changed`  ← derived from the issue lifecycle events below
 *   - `browser.terminal_output_appended` is the two-stream TRANSPORT frame (not an outbox fact)
 *     and is delivered by the terminal-session stream, NOT this owner-scoped broadcaster.
 *
 * Names are the frozen wire discriminators (the codegen gates every one to the `integration.`
 * prefix), so they are listed as string literals — the contract, not a runtime import.
 *
 * FROZEN SSE FRAMES — the two enriched `browser.*` frames are materialized as executable, typed Zod
 * schemas (`BrowserThreadStatusChangedFrameSchema` / `BrowserStopRaisedFrameSchema` below) and folded
 * into `ListenEventsControllerOutputSchema`, so the frozen shapes — with their denormalized display
 * fields (agentsRunningNow / threadDisplayName / issueKey) — are LOCKED at the contract. Delivery is
 * now LIVE (phase-6b): the `BrowserFrameEnricher` synthesizes these frames from the corresponding
 * integration facts (needs-you / stop raised / live status) at broadcast time and the broadcaster
 * fans them out ALONGSIDE the raw envelope. The fields are computed at broadcast time, not carried on
 * any outbox fact, so they never become `integration.*` wire events (the codegen only emits models
 * that `extends IntegrationEvent`); the enrichment happens in this broadcaster, not on the wire.
 *
 * `browser.terminal_output_appended` stays a comment on purpose — per the draft it is the two-stream
 * TRANSPORT frame (NOT a domain / outbox fact) and belongs to the terminal-session stream, not this
 * owner-scoped outbox broadcaster, so it is intentionally NOT part of this endpoint's SSE union:
 *   - browser.terminal_output_appended { issueId: string; line: string; at: string }
 *
 * WIRING NOTE: the broadcaster below filters each client by the ENVELOPE `ownerId`
 * (`browserDeliveryOwnerId`) — the CodeDM lock carries `ownerId` on the envelope only, which is also
 * what each emitted frame carries — so generic `integration.*` frames are delivered to their owner's
 * connected clients today. The two enriched `browser.*` frames are synthesized + delivered by the
 * `BrowserFrameEnricher` (see the FROZEN SSE FRAMES note above).
 */
const BROWSER_EVENTS = [
	// Human-in-the-loop control plane (T03 Home callout / T14 Needs-You / dock badge)
	{ name: 'integration.issue.stop_raised' },
	{ name: 'integration.issue.stop_resolved' },
	// Issue lifecycle → live issue lists + thread status (T04 / T11 / T03)
	{ name: 'integration.issue.opened' },
	{ name: 'integration.issue.completed' },
	{ name: 'integration.issue.archived' },
	// Routing + agent output → live transcript (T09)
	{ name: 'integration.message.classified' },
	{ name: 'integration.agent.reply_drafted' },
	// Thread + channel health (T03 / T05 / T06). The pairing QR is delivered SYNCHRONOUSLY by the
	// gateway's connect call (the console drives the gateway SDK through the external/ChannelProxy
	// wildcard), not streamed here — live QR rotation rides the gateway's own /events stream, also
	// reachable through the proxy. Only the connect/disconnect health transitions ride this surface.
	{ name: 'integration.thread.attached' },
	{ name: 'integration.channel.connected' },
	{ name: 'integration.channel.disconnected' },
	// Contact directory sync (T15 attach wizard): a bootstrap remotes-sync pass finished → the browser
	// invalidates its attach-wizard contacts read. Paired with the load-bearing ConsumeChannelRemotesSynced.
	{ name: 'integration.channel.remotes_synced' },
	// Inbound message (union-slots pilot): the gateway's verbatim payload re-emitted with FULL typed
	// narrowing — the frame schema below composes the generated variant schemas from the owner's client.
	{ name: 'integration.channel_message.received' },
] as const satisfies ReadonlyArray<{ name: string }>

const BROWSER_EVENT_NAMES = new Set<string>(BROWSER_EVENTS.map(e => e.name))

/**
 * Frames with a DEDICATED typed schema in the output union. They are excluded from the generic
 * passthrough arm's `name` enum: a passthrough arm whose `name` is an open `z.string()` absorbs the
 * typed frames in the emitted SDK union (narrowing on a literal name can't exclude a `string` arm,
 * so the payload degrades to the loose envelope — TS2322 on daemon-origin consumers). Keeping the
 * discriminant sets disjoint makes `name`-narrowing on the daemon SDK yield the SAME typed payload
 * as the gateway-origin SDK (union-slots spec §2.4 — identical narrowing on every surface).
 */
const TYPED_FRAME_NAMES = ['integration.channel_message.received'] as const
type TypedFrameName = (typeof TYPED_FRAME_NAMES)[number]
type GenericFrameName = Exclude<(typeof BROWSER_EVENTS)[number]['name'], TypedFrameName>
const GENERIC_FRAME_NAMES = BROWSER_EVENTS.map(e => e.name).filter(
	(n): n is GenericFrameName => !(TYPED_FRAME_NAMES as readonly string[]).includes(n),
)

/**
 * Enum-object export of the generic frame names, re-exported by `@ui/enums` so the root context's
 * `openapi.registerEnums` names the emitted component `BrowserIntegrationEventName` (the emitter
 * matches registered enums by sorted value list; unregistered enums fall back to a path-derived
 * component name — here the property name `name` → component `Name`).
 */
export const BrowserIntegrationEventName = Object.fromEntries(GENERIC_FRAME_NAMES.map(n => [n, n])) as {
	[K in GenericFrameName]: K
}

/**
 * The owner an integration event should fan out to on the browser SSE surface — or `undefined` when
 * the event is not part of that surface. Tenancy is the ENVELOPE `ownerId` (what the emitted frame
 * carries via `event.ownerId`), matching every `integration.*` event: the bridge handlers set
 * `ownerId` on the envelope, never inside the payload. Extracted as a pure predicate so the
 * broadcaster's filtering (BROWSER_EVENT_NAMES + owner match) is unit-testable without the SSE
 * transport.
 */
export function browserDeliveryOwnerId(event: BaseIntegrationEvent): string | undefined {
	if (!BROWSER_EVENT_NAMES.has(event.name)) return undefined
	return event.ownerId || undefined
}

/**
 * Frozen `browser.*` SSE frames (Phase-0 contract lock) — the enriched, denormalized views the
 * operator console subscribes to, distinct from the raw `integration.*` outbox facts above. Locked
 * as typed schema now; broadcast-time enrichment (populating the denormalized fields) lands in the
 * gateway phase (see the docblock's FROZEN SSE FRAMES note). Discriminated by the frame `name`.
 */
export const BrowserThreadStatusChangedFrameSchema = z.object({
	name: z.literal('browser.thread_status_changed'),
	threadId: z.string(),
	status: z.enum(ThreadStatus),
	agentsRunningNow: z.number().int(),
})

export const BrowserStopRaisedFrameSchema = z.object({
	name: z.literal('browser.stop_raised'),
	threadId: z.string(),
	threadDisplayName: z.string(),
	issueId: z.string(),
	issueKey: z.string(),
	stopKind: z.enum(StopKind),
})

export const BrowserSseFrameSchema = z.discriminatedUnion('name', [BrowserThreadStatusChangedFrameSchema, BrowserStopRaisedFrameSchema])

export const ListenEventsControllerInputSchema = z.object({
	ctx: z.object({ session: z.object({ ownerId: z.uuid() }) }),
})

/**
 * The endpoint's SSE frame union — the SDK derives the typed `ServerEventName` union from this for
 * the frontend `useServerEvents` hook. Two surfaces coexist:
 *   - the generic `integration.*` envelope, the transport reality today: discriminated by the event
 *     `name` — a CLOSED enum of the browser-surface events that have no dedicated typed frame (the
 *     broadcaster only re-emits BROWSER_EVENT_NAMES, so the closed set IS the transport reality;
 *     an open `z.string()` here would swallow the typed frames' literal names in the SDK union and
 *     break daemon-origin narrowing) — carrying an open `ownerId`-scoped `payload`;
 *   - the two frozen enriched `browser.*` frames, locked here so their denormalized shapes ship at
 *     the contract even though broadcast-time delivery is wired in the gateway phase.
 */
const GenericIntegrationFrameSchema = z.object({
	name: z.enum(GENERIC_FRAME_NAMES),
	ownerId: z.string(),
	payload: z.object({ ownerId: z.uuid() }).loose(),
})

/**
 * The gateway's channel_message.received payload — the COMPLETE discriminated union composed from
 * the generated variant schemas of the owner's client (`@codedm/client-typescript/go`), never
 * redeclared here (union-slots spec §2.4). Composite discriminator (platform, messageType) nests:
 * the outer union narrows by `platform`, the WHATSAPP branch narrows by `messageType`. The TS
 * openapi emitter publishes this as the full oneOf in the daemon spec, so console narrowing is
 * identical whether the frame arrives from the gateway's own /events stream or from this re-emitting
 * surface.
 */
export const ChannelMessageReceivedPayloadUnionSchema = z.discriminatedUnion('platform', [
	z.discriminatedUnion('messageType', [
		channelMessageReceivedPayloadWhatsappTextSchema,
		channelMessageReceivedPayloadWhatsappImageSchema,
		channelMessageReceivedPayloadWhatsappVideoSchema,
		channelMessageReceivedPayloadWhatsappAudioSchema,
		channelMessageReceivedPayloadWhatsappDocumentSchema,
		channelMessageReceivedPayloadWhatsappStickerSchema,
		channelMessageReceivedPayloadWhatsappLocationSchema,
		channelMessageReceivedPayloadWhatsappContactSchema,
		channelMessageReceivedPayloadWhatsappPollSchema,
		channelMessageReceivedPayloadWhatsappReactionSchema,
	]),
	channelMessageReceivedPayloadInternalTextSchema,
])

/** Typed frame for the re-emitted gateway inbound message (union-slots pilot). */
export const ChannelMessageReceivedFrameSchema = z.object({
	name: z.literal('integration.channel_message.received'),
	ownerId: z.string(),
	payload: ChannelMessageReceivedPayloadUnionSchema,
})

export const ListenEventsControllerOutputSchema = z.union([
	BrowserThreadStatusChangedFrameSchema,
	BrowserStopRaisedFrameSchema,
	ChannelMessageReceivedFrameSchema,
	GenericIntegrationFrameSchema,
])

interface SSEClient {
	ownerId: string
	// Sends any pre-shaped SSE frame — the raw `integration.*` envelope OR an enriched `browser.*`
	// frame (which carries no envelope `ownerId`; tenancy is already filtered before send).
	send: (frame: unknown) => void
}

const MAX_CLIENTS = 1000

@injectable()
export class ListenEventsController extends Controller<
	typeof ListenEventsControllerInputSchema,
	typeof ListenEventsControllerOutputSchema
> {
	readonly path = '/ui/events'
	readonly method = 'get' as const
	readonly description = 'Owner-scoped real-time integration events via SSE'
	readonly inputSchema = ListenEventsControllerInputSchema
	readonly outputSchema = ListenEventsControllerOutputSchema
	override readonly contentType: MimeTypes = MimeTypes['.stream']

	override middlewares = [OperatorMiddleware]

	private clients = new Set<SSEClient>()
	private broadcasterRegistered = false

	constructor(
		private externalMediator: ExternalMediator,
		private enricher: BrowserFrameEnricher,
	) {
		super()
	}

	/**
	 * One mediator callback per process, fanned out to every connected client. Tenancy filter: an
	 * event reaches a client ONLY when it is on the browser surface (BROWSER_EVENT_NAMES) and its
	 * ENVELOPE ownerId matches the client's session owner (see `browserDeliveryOwnerId`).
	 *
	 * Two frames coexist on the wire: the raw `integration.*` envelope is re-emitted for EVERY
	 * browser-surface fact (unchanged), and the `BrowserFrameEnricher` synthesizes the enriched
	 * `browser.thread_status_changed` / `browser.stop_raised` frames from the corresponding facts
	 * (needs-you / stop raised / live status) — ADDITIVE, so no existing consumer loses its envelope.
	 */
	private ensureBroadcaster(): void {
		if (this.broadcasterRegistered) return
		this.broadcasterRegistered = true
		this.externalMediator.registerCallback(async event => {
			if (!(event instanceof BaseIntegrationEvent)) return
			const targetOwnerId = browserDeliveryOwnerId(event)
			if (!targetOwnerId) return
			const recipients = [...this.clients].filter(client => client.ownerId === targetOwnerId)
			if (recipients.length === 0) return

			const rawFrame = { name: event.name, ownerId: event.ownerId, payload: event.payload }
			const enriched = await this.enricher.enrich(event)
			for (const client of recipients) {
				client.send(rawFrame)
				for (const frame of enriched) client.send(frame)
			}
		})
	}

	async handle(request: this['input']): Promise<this['output']> {
		this.ensureBroadcaster()
		const ownerId = request.ctx.session.ownerId

		return this.rawResponse(
			createSSEResponse({
				signal: request.raw.signal,
				onStart: handle => {
					if (this.clients.size >= MAX_CLIENTS) {
						handle.close()
						return undefined
					}
					const client: SSEClient = {
						ownerId,
						send: frame => handle.send(encodeSSEFrame(frame)),
					}
					handle.send(SSE_CONNECTED_FRAME)
					this.clients.add(client)
					return () => this.clients.delete(client)
				},
			}),
		)
	}
}
