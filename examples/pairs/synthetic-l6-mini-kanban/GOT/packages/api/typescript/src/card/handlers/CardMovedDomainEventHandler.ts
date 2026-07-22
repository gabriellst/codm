import { injectable } from 'tsyringe-neo'
import { EventHandler, ExternalMediator } from '@template/core-typescript'
import { CardMovedEvent } from '@template/contracts-typescript/wire/events'
import { CardMovedDomainEvent } from '../events/CardMovedDomainEvent'

@injectable()
export class CardMovedDomainEventHandler extends EventHandler<typeof CardMovedDomainEvent> {
	readonly event = CardMovedDomainEvent

	constructor(private readonly externalMediator: ExternalMediator) { super() }

	async handle(event: this['input']): Promise<void> {
		await this.externalMediator.publish(
			new CardMovedEvent({
				ownerId: event.ownerId ?? '',
				payload: {
					boardId: event.payload.boardId,
					cardId: event.payload.cardId,
					fromListId: event.payload.fromListId,
					toListId: event.payload.toListId,
					storeId: event.payload.storeId,
				},
			}),
		)
	}
}
