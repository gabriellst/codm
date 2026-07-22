import { injectable } from 'tsyringe-neo'
import { StopPolicyConfigRepository, type StopPolicy, DEFAULT_STOP_POLICY } from './StopPolicyConfigRepository'

@injectable()
export class MockStopPolicyConfigRepository extends StopPolicyConfigRepository {
	private byOwner = new Map<string, StopPolicy>()

	async get(ownerId: string): Promise<StopPolicy> {
		return this.byOwner.get(ownerId) ?? { ...DEFAULT_STOP_POLICY }
	}
	async upsert(ownerId: string, policy: StopPolicy): Promise<void> {
		this.byOwner.set(ownerId, { ...policy })
	}
}
