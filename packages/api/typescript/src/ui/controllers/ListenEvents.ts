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
import { OperatorMiddleware } from '@auth/middlewares'

/**
 * The curated browser-facing event union. ONLY integration events whose payload carries a
 * direct `ownerId` belong here — the broadcaster filters each client by the session's owner,
 * so an event without `ownerId` can never be tenancy-scoped and must NOT be added (events
 * keyed by an external integration id need a resolver first — see the realtime section
 * of docs/BACKEND.md before extending this list).
 *
 * This boilerplate ships with an EMPTY union — the generic SaaS infra defines no
 * domain events yet. A new app adds its `ownerId`-bearing integration events here (and
 * runs `bun sdk`) to make them subscribable from the frontend `useServerEvents` hook.
 */
const BROWSER_EVENTS: ReadonlyArray<{ name: string }> = []

const BROWSER_EVENT_NAMES = new Set<string>(BROWSER_EVENTS.map(e => e.name))

export const ListenEventsControllerInputSchema = z.object({
	ctx: z.object({ session: z.object({ ownerId: z.uuid() }) }),
})

/**
 * Generic SSE frame envelope, discriminated by the event `name` — the SDK derives the typed
 * `ServerEventName` from this schema for the frontend `useServerEvents` hook. The boilerplate
 * has no domain events yet, so the envelope carries an open `payload`; a new app narrows this
 * to a `z.discriminatedUnion('name', [...])` over its own `ownerId`-bearing events.
 */
export const ListenEventsControllerOutputSchema = z.object({
	name: z.string(),
	ownerId: z.string(),
	payload: z.object({ ownerId: z.uuid() }).loose(),
})

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
