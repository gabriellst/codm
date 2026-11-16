import { injectable } from 'tsyringe-neo'
import { PanelRosterRelay, type PanelCodeDelivery, type PanelRosterBatch } from './PanelRosterRelay'

/**
 * Records every batch instead of opening a socket. `pending` is what the "cloud" hands back on the
 * next sync (then cleared, like the real one hands a request out once). `offline` = not logged in.
 */
@injectable()
export class MockPanelRosterRelay extends PanelRosterRelay {
	readonly batches: PanelRosterBatch[] = []
	pending: PanelCodeDelivery[] = []
	offline = false

	async sync(batch: PanelRosterBatch): Promise<PanelCodeDelivery[] | undefined> {
		if (this.offline) return undefined
		this.batches.push(structuredClone(batch))
		const deliveries = this.pending
		this.pending = []
		return deliveries
	}
}
