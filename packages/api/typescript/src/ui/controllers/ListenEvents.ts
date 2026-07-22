import { injectable } from 'tsyringe-neo'
import {
	Controller,
	z,
	MimeTypes,
	ExternalMediator,
	SSE_CONNECTED_FRAME,
	createSSEResponse,
	encodeSSEFrame,
} from '@template/core-typescript'
import { BaseIntegrationEvent } from '@template/core-typescript'
import { ThreadStatus, StopKind } from '@template/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'

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
 * FROZEN SSE FRAMES — the two enriched `browser.*` frames are now materialized as executable, typed
 * Zod schemas (`BrowserThreadStatusChangedFrameSchema` / `BrowserStopRaisedFrameSchema` below) and
 * folded into `ListenEventsControllerOutputSchema`, so the frozen shapes — with their denormalized
 * display fields (agentsRunningNow / threadDisplayName / issueKey) — are LOCKED at the contract now
 * instead of living as prose. Only their *delivery* is deferred: the broadcaster below still re-emits
 * the raw `integration.*` envelope, and the denormalized fields are synthesized in the
 * gateway/terminal phase when the display-projection + terminal transport land. That delivery cutover
 * needs FOUNDER CONFIRMATION — the fields are computed at broadcast time, not carried on any outbox
 * fact, so they cannot become `integration.*` wire events (the codegen only emits models that
 * `extends IntegrationEvent`); the enrichment happens in the gateway broadcaster, not on the wire.
 *
 * `browser.terminal_output_appended` stays a comment on purpose — per the draft it is the two-stream
 * TRANSPORT frame (NOT a domain / outbox fact) and belongs to the terminal-session stream, not this
 * owner-scoped outbox broadcaster, so it is intentionally NOT part of this endpoint's SSE union:
 *   - browser.terminal_output_appended { issueId: string; line: string; at: string }
 *
 * WIRING NOTE (finalized in the gateway/terminal phase): the broadcaster below filters each
 * client by an `ownerId` read from the event *payload*, whereas the CodeDM lock carries `ownerId`
 * on the envelope only and collapses tenancy to a single constant operator. Populating the union
 * declares the browser-subscribable surface; activating delivery is a one-line reconciliation of
 * that filter (envelope ownerId / constant operator) done when the gateway lands — deliberately
 * NOT changed here to keep the contract lock free of product runtime logic.
 */
const BROWSER_EVENTS: ReadonlyArray<{ name: string }> = [
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
	// Thread + channel health (T03 / T05 / T06 live QR)
	{ name: 'integration.thread.attached' },
	{ name: 'integration.channel.connected' },
	{ name: 'integration.channel.disconnected' },
	{ name: 'integration.channel.pairing_qr_updated' },
]

const BROWSER_EVENT_NAMES = new Set<string>(BROWSER_EVENTS.map(e => e.name))

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

export const BrowserSseFrameSchema = z.discriminatedUnion('name', [
	BrowserThreadStatusChangedFrameSchema,
	BrowserStopRaisedFrameSchema,
])

export const ListenEventsControllerInputSchema = z.object({
	ctx: z.object({ session: z.object({ ownerId: z.uuid() }) }),
})

/**
 * The endpoint's SSE frame union — the SDK derives the typed `ServerEventName` union from this for
 * the frontend `useServerEvents` hook. Two surfaces coexist:
 *   - the generic `integration.*` envelope, the transport reality today: discriminated by the event
 *     `name`, carrying an open `ownerId`-scoped `payload` (what the broadcaster re-emits now);
 *   - the two frozen enriched `browser.*` frames, locked here so their denormalized shapes ship at
 *     the contract even though broadcast-time delivery is wired in the gateway phase.
 */
const GenericIntegrationFrameSchema = z.object({
	name: z.string(),
	ownerId: z.string(),
	payload: z.object({ ownerId: z.uuid() }).loose(),
})

export const ListenEventsControllerOutputSchema = z.union([
	BrowserThreadStatusChangedFrameSchema,
	BrowserStopRaisedFrameSchema,
	GenericIntegrationFrameSchema,
])

interface SSEClient {
	ownerId: string
	send: (event: BaseIntegrationEvent) => void
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

	constructor(private externalMediator: ExternalMediator) {
		super()
	}

	/**
	 * One mediator callback per process, fanned out to every connected client. Tenancy
	 * filter: an event reaches a client ONLY when its payload ownerId matches the client's
	 * session owner — events without an ownerId never pass the BROWSER_EVENT_NAMES check.
	 */
	private ensureBroadcaster(): void {
		if (this.broadcasterRegistered) return
		this.broadcasterRegistered = true
		this.externalMediator.registerCallback(event => {
			if (!(event instanceof BaseIntegrationEvent) || !BROWSER_EVENT_NAMES.has(event.name)) return
			const tenancy = z.object({ ownerId: z.uuid() }).loose().safeParse(event.payload)
			if (!tenancy.success) return
			for (const client of this.clients) {
				if (client.ownerId === tenancy.data.ownerId) client.send(event)
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
						send: event => handle.send(encodeSSEFrame({ name: event.name, ownerId: event.ownerId, payload: event.payload })),
					}
					handle.send(SSE_CONNECTED_FRAME)
					this.clients.add(client)
					return () => this.clients.delete(client)
				},
			}),
		)
	}
}
