// Internal handlers — subscribe to in-process domain events from the page BC.
//
// Each handler bridges a page domain event to the cross-BC
// `integration.shared.page.content_changed` integration event so browser SSE
// clients can receive live updates for the workspace.
import { injectable } from 'tsyringe-neo'
import { EventHandler, ExternalMediator } from '@codedm/core-typescript'
import { PageContentChangedEvent } from '@codedm/contracts-typescript/wire/events'
import { PageChangeKind } from '@codedm/contracts-typescript/wire/enums'
import { PageCreatedEvent, BlockAddedEvent, BlockEditedEvent } from '../events'

@injectable()
export class PageCreatedContentChangedPublisher extends EventHandler<typeof PageCreatedEvent> {
	readonly event = PageCreatedEvent

	constructor(private readonly mediator: ExternalMediator) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		// workspaceId is set as ownerId by CreatePage; entityId is the page id.
		const workspaceId = event.payload.page.workspaceId
		const pageId = event.entityId ?? ''
		await this.mediator.publish(
			new PageContentChangedEvent({
				ownerId: workspaceId,
				payload: {
					workspaceId,
					pageId,
					changeKind: PageChangeKind.PAGE_CREATED,
				},
			}),
		)
	}
}

@injectable()
export class BlockAddedContentChangedPublisher extends EventHandler<typeof BlockAddedEvent> {
	readonly event = BlockAddedEvent

	constructor(private readonly mediator: ExternalMediator) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		await this.mediator.publish(
			new PageContentChangedEvent({
				ownerId: event.payload.workspaceId,
				payload: {
					workspaceId: event.payload.workspaceId,
					pageId: event.payload.pageId,
					changeKind: PageChangeKind.BLOCK_ADDED,
				},
			}),
		)
	}
}

@injectable()
export class BlockEditedContentChangedPublisher extends EventHandler<typeof BlockEditedEvent> {
	readonly event = BlockEditedEvent

	constructor(private readonly mediator: ExternalMediator) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		await this.mediator.publish(
			new PageContentChangedEvent({
				ownerId: event.payload.workspaceId,
				payload: {
					workspaceId: event.payload.workspaceId,
					pageId: event.payload.pageId,
					changeKind: PageChangeKind.BLOCK_EDITED,
				},
			}),
		)
	}
}
