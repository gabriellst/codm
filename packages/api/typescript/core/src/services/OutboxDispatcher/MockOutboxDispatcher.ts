import { OutboxDispatcher } from './OutboxDispatcher'
import { BaseEvent } from '../../types/BaseEvent'
import { InternalMediator, ExternalMediator } from '../Mediator'
import { injectable } from 'tsyringe-neo'

@injectable()
export class MockOutboxDispatcher extends OutboxDispatcher {
	private pending: BaseEvent[] = []

	constructor(
		private internalMediator: InternalMediator,
		private externalMediator: ExternalMediator,
	) {
		super()
	}

	enqueue(event: BaseEvent): void {
		this.pending.push(event)
	}

	async flush(): Promise<void> {
		while (this.pending.length > 0) {
			const event = this.pending.shift()!
			// Mirror DrizzleOutboxDispatcher routing: integration events (name `integration.*`) cross
			// contexts/services via the ExternalMediator; domain events stay on the InternalMediator.
			const mediator = event.name.startsWith('integration.') ? this.externalMediator : this.internalMediator
			await mediator.dispatch(event)
		}
	}

	start(): void {
		/* no-op in mock mode */
	}

	async stop(): Promise<void> {
		/* no-op */
	}

	reset(): void {
		this.pending = []
	}
}
