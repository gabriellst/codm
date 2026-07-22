import { BaseEvent } from '../../types/BaseEvent'
import { Handler } from '../../types/Handler'
import { BaseInfrastructureErrors } from '../../errors/codes'
import { BaseError } from '../../types/BaseError'
import { EventCallback, ExternalMediator, Unsubscribe, handlerEventNames } from './Mediator'
import { injectable } from 'tsyringe-neo'

@injectable()
export class MockExternalMediator extends ExternalMediator {
	private publishedEvents: BaseEvent[] = []
	private dispatchedEvents: BaseEvent[] = []
	private registeredHandlers = new Map<string, Handler[]>()
	private callbacks = new Set<EventCallback>()
	private namedCallbacks = new Map<string, Set<EventCallback>>()

	async register(handler: Handler): Promise<void> {
		const names = handlerEventNames(handler)
		for (const name of names) {
			if (!this.registeredHandlers.has(name)) {
				this.registeredHandlers.set(name, [])
			}
			this.registeredHandlers.get(name)!.push(handler)
		}
	}

	async publish(event: BaseEvent): Promise<void> {
		this.publishedEvents.push(event)
		this.notifyCallbacks(event.name, event)
	}

	async dispatch(event: BaseEvent): Promise<void> {
		this.dispatchedEvents.push(event)
		const handlers = this.registeredHandlers.get(event.name)
		if (handlers) {
			for (const handler of handlers) {
				await handler.execute(event)
			}
		}
	}

	async execute<T extends Handler>(_handler: T['name'], _input: T['input']): Promise<T['output']> {
		throw new BaseError<BaseInfrastructureErrors>('NOT_IMPLEMENTED')
	}

	removeAllListeners(): void {
		this.registeredHandlers.clear()
		this.callbacks.clear()
		this.namedCallbacks.clear()
	}

	registerCallback(callback: EventCallback, eventName?: string): Unsubscribe {
		if (eventName) {
			if (!this.namedCallbacks.has(eventName)) {
				this.namedCallbacks.set(eventName, new Set())
			}
			this.namedCallbacks.get(eventName)!.add(callback)
			return () => {
				this.namedCallbacks.get(eventName)?.delete(callback)
			}
		}

		this.callbacks.add(callback)
		return () => {
			this.callbacks.delete(callback)
		}
	}

	// --- Test helpers ---

	getPublishedEvents(): BaseEvent[] {
		return [...this.publishedEvents]
	}

	getDispatchedEvents(): BaseEvent[] {
		return [...this.dispatchedEvents]
	}

	clear(): void {
		this.publishedEvents = []
		this.dispatchedEvents = []
		this.registeredHandlers.clear()
		this.callbacks.clear()
		this.namedCallbacks.clear()
	}

	private notifyCallbacks(eventName: string, event: BaseEvent): void {
		for (const cb of this.callbacks) cb(event)

		const named = this.namedCallbacks.get(eventName)
		if (named) {
			for (const cb of named) cb(event)
		}
	}
}
