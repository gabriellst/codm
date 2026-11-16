import { injectable } from 'tsyringe-neo'
import { PanelPublisher, type PanelBatch } from './PanelPublisher'

/** Records every batch instead of opening a socket; tokens are `token-<threadId>`. `offline` simulates "not logged in". */
@injectable()
export class MockPanelPublisher extends PanelPublisher {
	readonly batches: PanelBatch[] = []
	offline = false

	protected async send(batch: PanelBatch): Promise<{ threadId: string; token: string }[] | undefined> {
		if (this.offline) return undefined
		this.batches.push(batch)
		return batch.groups.map(group => ({ threadId: group.threadId, token: `token-${group.threadId}` }))
	}

	protected async sendRotate(threadId: string): Promise<string | undefined> {
		return this.offline ? undefined : `rotated-${threadId}`
	}

	protected cloudOrigin(): string {
		return 'https://cloud.test'
	}
}
