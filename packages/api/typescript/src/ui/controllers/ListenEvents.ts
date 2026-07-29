import { injectable } from 'tsyringe-neo'
import {
	z,
	Controller,
	MimeTypes,
	ExternalMediator,
	SSE_CONNECTED_FRAME,
	createSSEResponse,
	encodeSSEFrame,
	BaseIntegrationEvent,
} from '@codedm/core-typescript'
// The event surface, imported WHOLESALE from the contract bindings (founder ratification 23-jul:
// the contract is the single source — no allowlist, no hand-rolled per-event schemas). The
// MATERIALIZED surface arrives pre-joined from the generated wire layer (wire/events/materialized —
// union-slot payloads already swapped for the owner client's aggregate schemas, union-slots §2.4);
// this controller only COMPOSES and re-emits, medscall-style.
import { materializedIntegrationEventSchemas } from '@codedm/contracts-typescript/wire/events'
import { OperatorMiddleware } from '@auth/middlewares'
import { BrowserFrameEnricher, BrowserSseFrameSchema } from '../services/BrowserFrameEnricher'

export const ListenEventsControllerInputSchema = z.object({
	ctx: z.object({ session: z.object({ ownerId: z.uuid() }) }),
})

/**
 * The endpoint's SSE frame union — the SDK derives the typed `ServerEventName` union from this for
 * the frontend `useServerEvents` hook. Two surfaces coexist, both DECLARED elsewhere and only
 * COMPOSED here:
 *   - every `integration.*` event of the contract barrel (all of them — the broadcaster forwards the
 *     whole surface, filtered only by envelope-`ownerId` tenancy), each arm the generated
 *     MATERIALIZED schema (wire-name-sorted, baked-in literal `name`, union-slot payloads
 *     materialized at the wire layer — never here);
 *   - the enriched `browser.*` frames, declared at their synthesizer (`BrowserFrameEnricher`).
 */
export const ListenEventsControllerOutputSchema = z.discriminatedUnion('name', [
	...materializedIntegrationEventSchemas,
	...BrowserSseFrameSchema.options,
])

/**
 * The owner an integration event fans out to on the browser SSE surface. ALL integration events are
 * forwarded (founder ratification 23-jul — no allowlist, no per-event exceptions); the ONLY filter is
 * tenancy: the ENVELOPE `ownerId` (the bridge handlers set `ownerId` on the envelope, never inside
 * the payload) must match the client's session owner. An event without an envelope owner is withheld
 * (nothing to scope it to). Extracted as a pure predicate so the broadcaster's filtering is
 * unit-testable without the SSE transport.
 */
export function deliveryOwnerId(event: BaseIntegrationEvent): string | undefined {
	return event.ownerId || undefined
}

/**
 * Is this callback payload an integration event the browser may receive?
 *
 * STRUCTURAL, and that is the whole point. The obvious gate — `event instanceof BaseIntegrationEvent`
 * — is true ONLY for facts a TypeScript handler published as `new SomeEvent({...})`. Everything that
 * arrives through the INGRESS lane (the Go gateway's rows in the shared outbox) reaches
 * `notifyCallbacks` as the PLAIN OBJECT `adaptWireEnvelope` returns — JSON never carries a prototype.
 * So an `instanceof` gate here silently drops the entire Go-originated surface: every
 * `integration.channel.*` and `integration.channel_message.*` fact, which is to say every inbound
 * WhatsApp message, from a stream whose docblock promises "EVERY integration event is forwarded".
 *
 * The name prefix is the real admission rule — this mediator carries nothing else — and it holds for
 * both shapes, which is what makes the promise true for the half of the surface that crosses a
 * process boundary.
 */
export function isBroadcastableIntegrationEvent(event: unknown): event is BaseIntegrationEvent {
	if (!event || typeof event !== 'object') return false
	const candidate = event as { name?: unknown; payload?: unknown }
	return typeof candidate.name === 'string' && candidate.name.startsWith('integration.') && typeof candidate.payload === 'object'
}

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
	 * One mediator callback per process, fanned out to every connected client. EVERY integration
	 * event is forwarded — the only filter is tenancy (`deliveryOwnerId`: envelope owner must match
	 * the client's session owner).
	 *
	 * Two frames coexist on the wire: the raw `integration.*` envelope is re-emitted for every fact
	 * (unchanged), and the `BrowserFrameEnricher` synthesizes the enriched `browser.*` frames from
	 * the facts it maps (needs-you / stop raised / live status) — ADDITIVE, so no consumer loses its
	 * envelope.
	 */
	private ensureBroadcaster(): void {
		if (this.broadcasterRegistered) return
		this.broadcasterRegistered = true
		this.externalMediator.registerCallback(async event => {
			if (!isBroadcastableIntegrationEvent(event)) return
			const targetOwnerId = deliveryOwnerId(event)
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
