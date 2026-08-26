import { BaseEvent } from '../../types/BaseEvent'
import { Handler } from '../../types/Handler'

type HandlerName = string
import { EventCallback, InternalMediator, Mediator, Unsubscribe, handlerEventNames } from './Mediator'
import { injectable } from 'tsyringe-neo'

export interface HandlerExecution {
	handler: HandlerName
	event: BaseEvent | unknown
	result: 'success' | 'error'
	error?: Error
}

@injectable()
export class SpyMediator extends Mediator {
	private dispatched: BaseEvent[] = []
	private published: BaseEvent[] = []
	private handlerExecutions: HandlerExecution[] = []

	constructor(private internalMediator: InternalMediator) {
		super()
	}

	async register(handler: Handler): Promise<void> {
		await this.internalMediator.register(this.wrapWithSpy(handler))
	}

	async dispatch(event: BaseEvent): Promise<void> {
		this.dispatched.push(event)
		await this.internalMediator.dispatch(event)
	}

	async publish(event: BaseEvent): Promise<void> {
		this.published.push(event)
		await this.internalMediator.publish(event)
	}

	async execute<T extends Handler>(handler: T['name'], input: T['input']): Promise<T['output']> {
		return this.internalMediator.execute(handler, input)
	}

	removeAllListeners(): void {
		this.internalMediator.removeAllListeners()
	}

	registerCallback(callback: EventCallback, eventName?: string): Unsubscribe {
		return this.internalMediator.registerCallback(callback, eventName)
	}

	// --- Spy query methods ---

	getDispatched(): BaseEvent[] {
		return [...this.dispatched]
	}

	getPublished(): BaseEvent[] {
		return [...this.published]
	}

	getHandlerExecutions(): HandlerExecution[] {
		return [...this.handlerExecutions]
	}

	wasHandlerActivated(handlerName: HandlerName): boolean {
		return this.handlerExecutions.some(e => e.handler === handlerName && e.result === 'success')
	}

	getEventsOfType(name: string): BaseEvent[] {
		return this.dispatched.filter(e => e.name === name)
	}

	getPublishedOfType(name: string): BaseEvent[] {
		return this.published.filter(e => e.name === name)
	}

	reset(): void {
		this.dispatched = []
		this.published = []
		this.handlerExecutions = []
	}

	// --- Internal ---

	private wrapWithSpy(handler: Handler): Handler {
		const original = handler.execute.bind(handler)

		const wrapped = Object.create(handler)
		wrapped.execute = async (input: unknown, tx?: unknown) => {
			try {
				const result = await original(input, tx)
				this.handlerExecutions.push({
					handler: handlerEventNames(handler).join('+'),
					event: input,
					result: 'success',
				})
				return result
			} catch (error) {
				this.handlerExecutions.push({
					handler: handlerEventNames(handler).join('+'),
					event: input,
					result: 'error',
					error: error instanceof Error ? error : new Error(String(error)),
				})
				throw error
			}
		}
		return wrapped
	}
}
