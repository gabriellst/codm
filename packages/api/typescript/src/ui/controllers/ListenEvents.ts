import { injectable } from 'tsyringe-neo'
import type { ZodObject, ZodType } from 'zod'
import {
	Controller,
	z,
	MimeTypes,
	ExternalMediator,
	SSE_CONNECTED_FRAME,
	createSSEResponse,
	encodeSSEFrame,
	BaseIntegrationEvent,
} from '@codedm/core-typescript'
// The event surface, imported WHOLESALE from the contract (founder ratification 23-jul: the contract
// is the single source — no allowlist, no hand-rolled per-event schemas). Every generated event class
// carries a `schema` whose `name` is a baked-in z.literal, so the output union composes directly.
import * as WireEvents from '@codedm/contracts-typescript/wire/events'
// Generated zod schemas from the OWNER service's client subpath (types/schemas ONLY — never the HTTP
// client): union-slot payloads are materialized from the owner's generated aggregate schema so this
// surface re-emits them with FULL narrowing, without redeclaring a single shape (union-slots §2.4).
import * as goClientSchemas from '@codedm/client-typescript/go'
import { OperatorMiddleware } from '@auth/middlewares'
import { BrowserFrameEnricher, BrowserSseFrameSchema } from '../services/BrowserFrameEnricher'

/**
 * Describes the static side of a generated integration event class. Every event in
 * `@codedm/contracts-typescript/wire/events` exports a class with a `schema` (ZodObject whose `name`
 * is a z.literal) and a `name` (the frozen wire discriminator).
 */
interface IntegrationEventClass {
	// biome-ignore lint/suspicious/noExplicitAny: each event has a different shape
	schema: ZodObject<any>
	name: string
}

function isIntegrationEventClass(e: unknown): e is IntegrationEventClass {
	return e != null && typeof e === 'function' && 'schema' in e && 'name' in e
}

/**
 * Union-slot payload materialization (union-slots spec §2.4) — driven by the generated MANIFESTS, not
 * by event names: every event whose `<Model>Unions` manifest declares union slots has its contract
 * payload (opaque `z.unknown()` slots) swapped for the OWNER workspace's generated aggregate payload
 * schema (`<model>PayloadSchema` in the owner's client subpath), so the daemon re-emits the frame
 * with the COMPLETE materialized oneOf. A new manifest event auto-materializes; a manifest whose
 * owner client lacks the aggregate schema fails loud (broken codegen must not emit an opaque frame).
 */
const OWNER_CLIENT_SCHEMAS: Record<string, Record<string, unknown>> = {
	apiGo: goClientSchemas as unknown as Record<string, unknown>,
}

const camel = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

function materializedPayloadSchemas(): Map<string, ZodType> {
	const out = new Map<string, ZodType>()
	for (const [exportName, manifest] of Object.entries(WireEvents)) {
		if (!exportName.endsWith('Unions') || typeof manifest !== 'object' || manifest === null) continue
		const model = exportName.slice(0, -'Unions'.length)
		const eventClass = (WireEvents as Record<string, unknown>)[`${model}Event`]
		if (!isIntegrationEventClass(eventClass)) throw new Error(`manifest ${exportName} has no matching event class ${model}Event`)
		const owners = new Set(
			Object.values(manifest as Record<string, { variants: ReadonlyArray<{ owner: string }> }>).flatMap(slot =>
				slot.variants.map(v => v.owner),
			),
		)
		for (const owner of owners) {
			const clientSchemas = OWNER_CLIENT_SCHEMAS[owner]
			if (!clientSchemas) throw new Error(`union-slot owner "${owner}" has no client schema namespace registered`)
			const schema = clientSchemas[`${camel(model)}PayloadSchema`]
			if (!schema) throw new Error(`owner "${owner}" client does not export ${camel(model)}PayloadSchema for manifest ${exportName}`)
			out.set(eventClass.name, schema as ZodType)
		}
	}
	return out
}

const MATERIALIZED_PAYLOADS = materializedPayloadSchemas()

/**
 * Every integration event schema from the contract barrel — the whole surface, no allowlist —
 * with union-slot payloads materialized from the owner's generated client. Sorted by wire name for
 * deterministic openapi emission.
 */
const integrationFrameSchemas = (Object.values(WireEvents) as unknown[])
	.filter(isIntegrationEventClass)
	.sort((a, b) => a.name.localeCompare(b.name))
	.map(e => {
		const materialized = MATERIALIZED_PAYLOADS.get(e.name)
		return materialized ? e.schema.extend({ payload: materialized }) : e.schema
	})

export const ListenEventsControllerInputSchema = z.object({
	ctx: z.object({ session: z.object({ ownerId: z.uuid() }) }),
})

/**
 * The endpoint's SSE frame union — the SDK derives the typed `ServerEventName` union from this for
 * the frontend `useServerEvents` hook. Two surfaces coexist, both DECLARED elsewhere and only
 * COMPOSED here:
 *   - every `integration.*` event of the contract barrel (all of them — the broadcaster forwards the
 *     whole surface, filtered only by envelope-`ownerId` tenancy), each arm the generated schema
 *     with its baked-in literal `name`;
 *   - the enriched `browser.*` frames, declared at their synthesizer (`BrowserFrameEnricher`).
 *
 * Accepted deviation (cc-bp-04): the tuple cast for discriminatedUnion is unavoidable — Zod requires
 * a `[T, ...T[]]` tuple, but Array.map() returns T[]; TS cannot infer a non-empty tuple from a
 * runtime-composed array.
 */
export const ListenEventsControllerOutputSchema = z.discriminatedUnion('name', [
	...integrationFrameSchemas,
	...BrowserSseFrameSchema.options,
	// biome-ignore lint/suspicious/noExplicitAny: runtime-composed union arms have per-event shapes
] as unknown as [ZodObject<any>, ZodObject<any>, ...ZodObject<any>[]])

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
			if (!(event instanceof BaseIntegrationEvent)) return
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
