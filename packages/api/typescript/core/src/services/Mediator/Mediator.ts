import type { Handler } from '../../types/Handler'
import { tryCatch, tryCatchAsync } from '../../utils/TryCatch'
import { BaseEvent } from '../../types/BaseEvent'
import { DependencyContainer } from 'tsyringe-neo'

export type EventCallback = (event: BaseEvent) => void | Promise<void>
export type Unsubscribe = () => void

/**
 * Resolve every event name a Handler subscribes to. EventHandlers (SPEC-12)
 * expose `events: readonly string[]` for both single-event and multi-event
 * forms; non-event Handlers fall back to `handler.name`.
 */
export function handlerEventNames(handler: Handler): readonly string[] {
	const events = (handler as Handler & { events?: readonly string[] }).events
	if (Array.isArray(events) && events.length > 0) {
		return events
	}
	return [handler.name]
}

export abstract class Mediator {
	abstract register(handler: Handler): void
	abstract execute<T extends Handler>(handler: T['name'], input: T['input']): Promise<T['output']>
	abstract publish(event: BaseEvent): Promise<void>
	abstract dispatch(event: BaseEvent): Promise<void>
	abstract removeAllListeners(): void
	abstract registerCallback(callback: EventCallback, eventName?: string): Unsubscribe

	// Lifecycle hooks — default no-op. Concrete mediators with networked transports
	// (Redis, Kafka, ...) override to open/close connections.
	async start(): Promise<void> {
		// no-op — see class comment above
	}
	async stop(): Promise<void> {
		// no-op — see class comment above
	}

	static async register(
		container: DependencyContainer,
		mediator: Mediator,
		handlers: Record<string, new (...args: any[]) => Handler>,
	): Promise<number> {
		const handlerInstances: Handler[] = []
		let successCount = 0

		for (const [handlerName, HandlerClass] of Object.entries(handlers)) {
			if (typeof HandlerClass === 'function' && handlerName !== 'default') {
				const result = tryCatch(() => {
					const handlerInstance = container.resolve(HandlerClass).bindContainer(container)
					handlerInstances.push(handlerInstance)
					successCount++
				})
				if (!result.success) {
					console.warn(`Failed to resolve Handler ${handlerName}:`, result.error)
				}
			}
		}

		for (const handler of handlerInstances) {
			const result = await tryCatchAsync(async () => {
				await mediator.register(handler)
			})
			if (!result.success) {
				console.warn(`Failed to register Handler:`, result.error)
				successCount--
			}
		}

		console.log(`✅ Registered ${successCount} Handlers`)
		return successCount
	}
}

export abstract class InternalMediator extends Mediator {}

export abstract class ExternalMediator extends Mediator {}
