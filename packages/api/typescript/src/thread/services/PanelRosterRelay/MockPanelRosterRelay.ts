import { injectable } from 'tsyringe-neo'
import type { PanelActionDelivery } from '@shared/schemas'
import { PanelRosterRelay, type PanelCodeDelivery, type PanelRosterBatch, type PanelRosterReply } from './PanelRosterRelay'

/**
 * Records every batch instead of opening a socket. `pending` / `actions` are what the "cloud" hands back
 * on the next sync (then cleared, like the real one hands a request out once). `offline` = not logged in;
 * `failing` = the cloud could not be reached (the batch is recorded, the call throws).
 */
@injectable()
export class MockPanelRosterRelay extends PanelRosterRelay {
	readonly batches: PanelRosterBatch[] = []
	pending: PanelCodeDelivery[] = []
	actions: PanelActionDelivery[] = []
	offline = false
	failing = false

	async sync(batch: PanelRosterBatch): Promise<PanelRosterReply | undefined> {
		if (this.offline) return undefined
		this.batches.push(structuredClone(batch))
		if (this.failing) throw new Error('cloud unreachable')
		const reply = { deliveries: this.pending, actions: this.actions }
		this.pending = []
		this.actions = []
		return reply
	}
}
