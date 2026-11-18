/**
 * THE WAIT OF THE REGRET WINDOW (fase 2, item 3) — a port so that a test never sleeps twenty seconds.
 *
 * One method, the only time-shaped thing `OpenRegretWindow` does: hold for `ms`. Real time everywhere a
 * person is on the other side; the `mock` column returns at once, and a test that needs something to
 * HAPPEN during the window (a steer arriving, a pause) overrides it with a clock whose wait does that.
 */
export abstract class RegretWindowClock {
	abstract wait(ms: number): Promise<void>
}
