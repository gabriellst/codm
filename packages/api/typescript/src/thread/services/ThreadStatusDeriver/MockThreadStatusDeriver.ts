import { injectable } from 'tsyringe-neo'
import { ThreadStatus } from '@codedm/contracts-typescript/wire/enums'
import { ThreadStatusDeriver } from './ThreadStatusDeriver'

/** Test double — every thread reads IDLE by default. Suites exercising RUNNING / NEEDS_ATTENTION /
 *  PAUSED override with a stub, the same way `MockChannelConnectivity` is overridden for the
 *  not-connected paths. `derive` is inherited: the precedence is not a test seam. */
@injectable()
export class MockThreadStatusDeriver extends ThreadStatusDeriver {
	async forThread(_threadId: string): Promise<ThreadStatus> {
		return ThreadStatus.IDLE
	}

	async forOwner(_ownerId: string): Promise<Map<string, ThreadStatus>> {
		return new Map()
	}
}
