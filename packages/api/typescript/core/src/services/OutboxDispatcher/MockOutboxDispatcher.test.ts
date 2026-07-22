import { describe, it, expect } from 'bun:test'
import { MockOutboxDispatcher } from './MockOutboxDispatcher'
import type { InternalMediator, ExternalMediator } from '../Mediator'
import type { BaseEvent } from '../../types/BaseEvent'

/**
 * Outbox routing invariant — the regression lock for the "integration event never reached its
 * external handler" gap: both dispatchers (this Mock + the production DrizzleOutboxDispatcher) route
 * by the event NAME prefix. Integration events (`integration.*`) cross bounded contexts / services
 * via the ExternalMediator; domain events stay context-private on the InternalMediator. Before this
 * routing existed, EVERY outbox event went to the InternalMediator, so the ONLY cross-context flow in
 * the template — billing SubscriptionChangedEvent → quota GovernResources — was silently dropped
 * (handler registered on a separate ExternalMediator instance that never received the event).
 *
 * DrizzleOutboxDispatcher carries the identical `event.name.startsWith('integration.')` branch; this
 * unit test locks the shared contract without needing a live DB + poller.
 */

/** Records the event names a mediator was asked to dispatch — stands in for both mediator roles. */
class RecordingMediator {
	readonly received: string[] = []
	async dispatch(event: BaseEvent): Promise<void> {
		this.received.push(event.name)
	}
}

const ev = (name: string): BaseEvent => ({ name, id: `id-${name}`, time: '2026-01-01T00:00:00.000Z' }) as unknown as BaseEvent

describe('MockOutboxDispatcher routing', () => {
	it('routes integration.* events to the ExternalMediator and domain events to the InternalMediator', async () => {
		const internal = new RecordingMediator()
		const external = new RecordingMediator()
		const dispatcher = new MockOutboxDispatcher(internal as unknown as InternalMediator, external as unknown as ExternalMediator)

		dispatcher.enqueue(ev('billing.invoice.paid')) // domain → internal
		dispatcher.enqueue(ev('integration.billing.subscription_changed')) // integration → external
		dispatcher.enqueue(ev('auth.user.registered')) // domain → internal
		await dispatcher.flush()

		expect(internal.received).toEqual(['billing.invoice.paid', 'auth.user.registered'])
		expect(external.received).toEqual(['integration.billing.subscription_changed'])
	})
})
