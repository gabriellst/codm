import { injectable } from 'tsyringe-neo'
import { CloudSession } from './CloudSession'

/**
 * Test/dev double, bound in `mock` and `integration` (S2S rule — no test opens a socket or touches a
 * real data dir). Defaults to ENTITLED: the hundreds of agent/thread suites that predate this gate
 * (Task T7) construct and drive `DrizzleMailboxDispatcher` with no idea `CloudSession` exists, and
 * defaulting to "blocked" would fail every one of them. A test that exercises the BLOCKED path calls
 * `setEntitled(false)` explicitly — see `DrizzleMailboxDispatcher.test.ts`.
 */
@injectable()
export class MockCloudSession extends CloudSession {
	private entitled = true

	setToken(_token: string): void {
		this.entitled = true
	}

	isEntitled(): boolean {
		return this.entitled
	}

	async revalidate(): Promise<void> {}

	/** Test helper — flips the gate directly, no fake cache file or HTTP round-trip needed. */
	setEntitled(entitled: boolean): void {
		this.entitled = entitled
	}
}
