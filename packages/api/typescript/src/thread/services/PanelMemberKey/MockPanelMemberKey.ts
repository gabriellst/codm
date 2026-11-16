import { injectable } from 'tsyringe-neo'
import { PanelMemberKey } from './PanelMemberKey'

/** A fixed key for tests — no file under the data dir. */
@injectable()
export class MockPanelMemberKey extends PanelMemberKey {
	private readonly fixed = Buffer.alloc(32, 7)

	protected key(): Buffer {
		return this.fixed
	}
}
