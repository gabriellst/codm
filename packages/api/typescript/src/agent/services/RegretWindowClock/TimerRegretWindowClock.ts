import { injectable } from 'tsyringe-neo'
import { RegretWindowClock } from './RegretWindowClock'

/** Wall-clock wait — what a session about to push actually experiences. */
@injectable()
export class TimerRegretWindowClock extends RegretWindowClock {
	wait(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms))
	}
}
