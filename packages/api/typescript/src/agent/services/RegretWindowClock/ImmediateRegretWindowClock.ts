import { injectable } from 'tsyringe-neo'
import { RegretWindowClock } from './RegretWindowClock'

/** No wait at all — the `mock` column, and the base a test extends to make something happen mid-window. */
@injectable()
export class ImmediateRegretWindowClock extends RegretWindowClock {
	/** Every wait asked for, in order — what a test asserts the window's length on. */
	readonly waits: number[] = []

	async wait(ms: number): Promise<void> {
		this.waits.push(ms)
	}
}
