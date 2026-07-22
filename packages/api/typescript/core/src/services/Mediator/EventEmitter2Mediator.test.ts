import 'reflect-metadata'
import { describe, expect, it } from 'bun:test'
import { z } from 'zod'
import { BaseEvent } from '../../types/BaseEvent'
import { Handler } from '../../types/Handler'
import { EventEmitter2Mediator } from './EventEmitter2Mediator'

class SubscriptionCreatedTestEvent extends BaseEvent {
	static override readonly name = 'billing.subscription.created' as const
}

/**
 * Minimal Handler that records its label into a shared log. `name` is the event
 * name the mediator subscribes it to (handlerEventNames fallback path).
 */
class RecordingHandler extends Handler<z.ZodTypeAny, z.ZodTypeAny> {
	readonly inputSchema = z.any()
	readonly outputSchema = z.any()

	constructor(
		readonly name: string,
		private readonly label: string,
		private readonly log: string[],
		private readonly fail = false,
	) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		this.log.push(this.label)
		if (this.fail) {
			throw new Error(`${this.label} failed`)
		}
		return input
	}
}

const EVENT_NAME = SubscriptionCreatedTestEvent.name

describe('EventEmitter2Mediator multicast fan-out', () => {
	it('dispatch invokes EVERY handler registered on one event name (no last-write-wins)', async () => {
		const mediator = new EventEmitter2Mediator()
		const log: string[] = []
		await mediator.register(new RecordingHandler(EVENT_NAME, 'handler', log))
		await mediator.register(new RecordingHandler(EVENT_NAME, 'quota-publisher', log))

		await mediator.dispatch(new SubscriptionCreatedTestEvent({ id: 'sub-1' }))

		expect(log).toEqual(['handler', 'quota-publisher'])
	})

	it('dispatch preserves registration order across many subscribers', async () => {
		const mediator = new EventEmitter2Mediator()
		const log: string[] = []
		for (const label of ['a', 'b', 'c', 'd']) {
			await mediator.register(new RecordingHandler(EVENT_NAME, label, log))
		}

		await mediator.dispatch(new SubscriptionCreatedTestEvent({ id: 'sub-1' }))

		expect(log).toEqual(['a', 'b', 'c', 'd'])
	})

	it('a throwing first handler does not prevent the second from running; the error still propagates', async () => {
		const mediator = new EventEmitter2Mediator()
		const log: string[] = []
		await mediator.register(new RecordingHandler(EVENT_NAME, 'boom', log, true))
		await mediator.register(new RecordingHandler(EVENT_NAME, 'survivor', log))

		await expect(mediator.dispatch(new SubscriptionCreatedTestEvent({ id: 'sub-1' }))).rejects.toMatchObject({
			message: 'boom failed',
		})

		expect(log).toEqual(['boom', 'survivor'])
	})

	it('multiple throwing handlers reject with an AggregateError after the full fan-out ran', async () => {
		const mediator = new EventEmitter2Mediator()
		const log: string[] = []
		await mediator.register(new RecordingHandler(EVENT_NAME, 'boom-1', log, true))
		await mediator.register(new RecordingHandler(EVENT_NAME, 'boom-2', log, true))
		await mediator.register(new RecordingHandler(EVENT_NAME, 'survivor', log))

		await expect(mediator.dispatch(new SubscriptionCreatedTestEvent({ id: 'sub-1' }))).rejects.toBeInstanceOf(AggregateError)

		expect(log).toEqual(['boom-1', 'boom-2', 'survivor'])
	})

	it('publish fans out to every subscriber, isolating a throwing handler (fire-and-forget)', async () => {
		const mediator = new EventEmitter2Mediator()
		const log: string[] = []
		await mediator.register(new RecordingHandler(EVENT_NAME, 'boom', log, true))
		await mediator.register(new RecordingHandler(EVENT_NAME, 'survivor', log))

		await mediator.publish(new SubscriptionCreatedTestEvent({ id: 'sub-1' }))
		// publish is fire-and-forget — flush the async listener chain before asserting.
		await new Promise(resolve => setTimeout(resolve, 0))

		expect(log).toEqual(['boom', 'survivor'])
	})

	it('getHandlerCount counts every registration; removeAllListeners drops them all', async () => {
		const mediator = new EventEmitter2Mediator()
		const log: string[] = []
		await mediator.register(new RecordingHandler(EVENT_NAME, 'a', log))
		await mediator.register(new RecordingHandler(EVENT_NAME, 'b', log))
		expect(mediator.getHandlerCount()).toBe(2)

		mediator.removeAllListeners()
		expect(mediator.getHandlerCount()).toBe(0)

		await mediator.dispatch(new SubscriptionCreatedTestEvent({ id: 'sub-1' }))
		await mediator.publish(new SubscriptionCreatedTestEvent({ id: 'sub-1' }))
		await new Promise(resolve => setTimeout(resolve, 0))
		expect(log).toEqual([])
	})
})
