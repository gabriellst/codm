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
import {
	CampaignProductBindingCreatedEvent,
	CampaignProductBindingRemovedEvent,
	FeesConfigurationUpdatedEvent,
	IntegrationActivatedIntegrationEvent,
	IntegrationDeactivatedIntegrationEvent,
	OperationalCostDeletedEvent,
	OperationalCostRecordedEvent,
	OperationalCostStatusOverriddenEvent,
	OperationalCostUpdatedEvent,
	PageContentChangedEvent,
	ProductCostCreatedEvent,
	ProductCostDeletedEvent,
	ProductCostUpdatedEvent,
	StoreDisabledEvent,
	StoreEnabledEvent,
	StoreMemberInvitedEvent,
	TaxesUpdatedEvent,
	WarrantyReserveCreatedEvent,
	WarrantyReserveDeletedEvent,
	WarrantyReserveUpdatedEvent,
} from '@template/contracts-typescript/wire/events'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireStoreMember } from '@tenancy/middlewares/RequireStoreMember'

/**
 * The curated browser-facing event union. Two tenancy modes are supported:
 * - Store-scoped: payload carries `storeId` — broadcaster sends only to clients whose session
 *   store matches (existing e-commerce events).
 * - Workspace-scoped: payload carries `workspaceId` — broadcaster fans out to ALL SSE clients;
 *   the browser filters by workspaceId in useServerEvents (client-side guard).
 * Events keyed by `storeIntegrationExternalId` need a resolver first — see the realtime
 * section of docs/BACKEND.md before extending this list.
 */
const BROWSER_EVENTS = [
	CampaignProductBindingCreatedEvent,
	CampaignProductBindingRemovedEvent,
	FeesConfigurationUpdatedEvent,
	IntegrationActivatedIntegrationEvent,
	IntegrationDeactivatedIntegrationEvent,
	OperationalCostDeletedEvent,
	OperationalCostRecordedEvent,
	OperationalCostStatusOverriddenEvent,
	OperationalCostUpdatedEvent,
	PageContentChangedEvent,
	ProductCostCreatedEvent,
	ProductCostDeletedEvent,
	ProductCostUpdatedEvent,
	StoreDisabledEvent,
	StoreEnabledEvent,
	StoreMemberInvitedEvent,
	TaxesUpdatedEvent,
	WarrantyReserveCreatedEvent,
	WarrantyReserveDeletedEvent,
	WarrantyReserveUpdatedEvent,
] as const

const BROWSER_EVENT_NAMES = new Set<string>(BROWSER_EVENTS.map(e => e.name))

export const ListenEventsControllerInputSchema = z.object({
	ctx: z.object({ session: z.object({ storeId: z.uuid() }) }),
})

/**
 * Discriminated by the event `name` embedded in each data-only SSE frame — the SDK derives
 * the typed `ServerEventName` union the frontend `useServerEvents` hook subscribes with.
 */
export const ListenEventsControllerOutputSchema = z
	.discriminatedUnion('name', [
		CampaignProductBindingCreatedEvent.schema,
		CampaignProductBindingRemovedEvent.schema,
		FeesConfigurationUpdatedEvent.schema,
		IntegrationActivatedIntegrationEvent.schema,
		IntegrationDeactivatedIntegrationEvent.schema,
		OperationalCostDeletedEvent.schema,
		OperationalCostRecordedEvent.schema,
		OperationalCostStatusOverriddenEvent.schema,
		OperationalCostUpdatedEvent.schema,
		PageContentChangedEvent.schema,
		ProductCostCreatedEvent.schema,
		ProductCostDeletedEvent.schema,
		ProductCostUpdatedEvent.schema,
		StoreDisabledEvent.schema,
		StoreEnabledEvent.schema,
		StoreMemberInvitedEvent.schema,
		TaxesUpdatedEvent.schema,
		WarrantyReserveCreatedEvent.schema,
		WarrantyReserveDeletedEvent.schema,
		WarrantyReserveUpdatedEvent.schema,
	])
	.example([
		{
			name: OperationalCostRecordedEvent.name,
			ownerId: '770e8400-e29b-41d4-a716-446655440000',
			payload: {
				operationalCostId: '550e8400-e29b-41d4-a716-446655440000',
				storeId: '660e8400-e29b-41d4-a716-446655440000',
			},
		},
	])

interface SSEClient {
	storeId: string
	send: (event: BaseIntegrationEvent) => void
}

const MAX_CLIENTS = 1000

@injectable()
export class ListenEventsController extends Controller<
	typeof ListenEventsControllerInputSchema,
	typeof ListenEventsControllerOutputSchema
> {
	readonly path = '/events'
	readonly method = 'get' as const
	readonly description = 'Store-scoped real-time integration events via SSE'
	readonly inputSchema = ListenEventsControllerInputSchema
	readonly outputSchema = ListenEventsControllerOutputSchema
	override readonly contentType: MimeTypes = MimeTypes['.stream']

	override middlewares = [AuthAccountMiddleware, RequireStoreMember]

	private clients = new Set<SSEClient>()
	private broadcasterRegistered = false

	constructor(private externalMediator: ExternalMediator) {
		super()
	}

	/**
	 * One mediator callback per process, fanned out to every connected client.
	 * Two tenancy modes:
	 * - Store-scoped (storeId present): event is delivered only to the client whose session
	 *   store matches — preserves the existing e-commerce tenancy guarantee.
	 * - Workspace-scoped (workspaceId present, no storeId): event fans out to ALL SSE clients;
	 *   the browser filters by workspaceId in useServerEvents (client-side guard). This is the
	 *   path for page/block realtime events where any authenticated user viewing the workspace
	 *   should receive the update.
	 */
	private ensureBroadcaster(): void {
		if (this.broadcasterRegistered) return
		this.broadcasterRegistered = true
		this.externalMediator.registerCallback(event => {
			if (!(event instanceof BaseIntegrationEvent) || !BROWSER_EVENT_NAMES.has(event.name)) return
			const scope = z.object({ storeId: z.uuid().optional(), workspaceId: z.uuid().optional() }).loose().safeParse(event.payload)
			if (!scope.success) return
			for (const client of this.clients) {
				if (scope.data.storeId !== undefined) {
					if (client.storeId === scope.data.storeId) client.send(event) // store-scoped events (existing e-commerce events)
				} else if (scope.data.workspaceId !== undefined) {
					client.send(event) // workspace-scoped events fan out to all SSE clients; the browser filters by workspaceId in useServerEvents
				}
			}
		})
	}

	async handle(request: this['input']): Promise<this['output']> {
		this.ensureBroadcaster()
		const storeId = request.ctx.session.storeId

		return this.rawResponse(
			createSSEResponse({
				signal: request.raw.signal,
				onStart: handle => {
					if (this.clients.size >= MAX_CLIENTS) {
						handle.close()
						return undefined
					}
					const client: SSEClient = {
						storeId,
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
