import { injectable } from 'tsyringe-neo'
import type { StopKind } from '@codm/contracts-typescript/wire/enums'
import { OpenStopReader } from './OpenStopReader'

/** The `mock` environment's answer: no open stop, unless a test raises one (`raise`). */
@injectable()
export class MockOpenStopReader extends OpenStopReader {
	private readonly open = new Map<string, StopKind[]>()

	raise(issueId: string, kind: StopKind): void {
		this.open.set(issueId, [...(this.open.get(issueId) ?? []), kind])
	}

	async openStopKinds(issueId: string): Promise<StopKind[]> {
		return [...(this.open.get(issueId) ?? [])]
	}
}
