import { BaseInfrastructureErrors } from '../../errors/codes'
import { BaseEvent } from '../../types/BaseEvent'
import { BaseError } from '../../types/BaseError'
import { Handler } from '../../types/Handler'
import { tryCatchAsync } from '../../utils/TryCatch'
import EventEmitter2 from 'eventemitter2'
import { EventCallback, Mediator, Unsubscribe, handlerEventNames } from '.'
import { injectable } from 'tsyringe-neo'

@injectable()
export class EventEmitter2Mediator extends Mediator {
	private readonly eventEmitter = new EventEmitter2({
		wildcard: true,
	})

	private handlerMap = new Map<string, Handler[]>()

	async register(handler: Handler): Promise<void> {
		const names = handlerEventNames(handler)
		for (const name of names) {
			// True multicast fan-out: many subscribers per event name. Registration
			// APPENDS — it never replaces — and publish()/dispatch() invoke every
			// subscriber in registration order.

			// Store handler reference for dispatch() (sequential, error-propagating)
			if (!this.handlerMap.has(name)) {
				this.handlerMap.set(name, [])
			}
			this.handlerMap.get(name)!.push(handler)

			// Register for publish() (fire-and-forget via EventEmitter2). Each listener
			// isolates its own errors via tryCatchAsync, so one throwing handler never
			// prevents the other subscribers from firing.
			this.eventEmitter.on(name, async (event: BaseEvent) => {
				void tryCatchAsync(async () => handler.execute(event))
			})
		}
	}

	async publish(event: BaseEvent): Promise<void> {
		this.eventEmitter.emit(event.name, event)
	}

	async dispatch(event: BaseEvent): Promise<void> {
		const handlers = this.handlerMap.get(event.name)

		if (!handlers || handlers.length === 0) {
			return
		}

		// Error isolation with propagation: EVERY handler runs (registration order)
		// even when an earlier one throws — failures are collected and rethrown after
		// the fan-out completes, so no subscriber is silently skipped.
		const errors: Error[] = []
		for (const handler of handlers) {
			const result = await tryCatchAsync(async () => handler.execute(event))
			if (!result.success) {
				errors.push(result.error)
			}
		}
		if (errors.length === 1) {
			throw errors[0]
		}
		if (errors.length > 1) {
			throw new AggregateError(errors, `${errors.length} of ${handlers.length} handlers failed for '${event.name}'`)
		}
	}

	async execute<T extends Handler>(_handler: T['name'], _input: T['input']): Promise<T['output']> {
		throw new BaseError<BaseInfrastructureErrors>('NOT_IMPLEMENTED')
	}

	removeAllListeners(): void {
		this.eventEmitter.removeAllListeners()
		this.handlerMap.clear()
		console.log('✅ Removed all event listeners')
	}

	getHandlerCount(): number {
		let count = 0
		for (const handlers of this.handlerMap.values()) {
			count += handlers.length
		}
		return count
	}

	registerCallback(callback: EventCallback, eventName?: string): Unsubscribe {
		const event = eventName ?? '**'
		this.eventEmitter.on(event, callback)
		return () => {
			this.eventEmitter.off(event, callback)
		}
	}
}
