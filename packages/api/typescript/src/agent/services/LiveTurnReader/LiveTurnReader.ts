/** What is known of an issue's running turn in this process: when it began, and its last sign of life. */
export interface LiveTurn {
	/** When the dispatcher registered the turn (`IssueTurnAborter.begin`) — just before the spawn. */
	startedAt: Date
	/** The instant of the turn's LAST stream frame — absent until the first one arrives. */
	lastFrameAt?: Date
}

/**
 * IS AN ISSUE'S TURN RUNNING, AND WHEN DID IT LAST SPEAK (fase 5, item 3) — the read-only face of the running-turn
 * registry (`IssueTurnAborter`), with none of its kill switches.
 *
 * The supervisor's `SILENT_TURN` rule needs a real silence signal: nothing is persisted while a turn streams (no
 * terminal line, no fact per frame), so "quiet for 20 min" had nothing to measure and degraded to "running for 30
 * min". The runners already observe every frame — the inactivity watchdog renews its deadline on each one — and every
 * frame reaches `RunIssueTurn`'s stream loop, which stamps it here. IN MEMORY, like the registry: the turn, its frames
 * and this reading live in one process, and a stamp is a `Map` write — no database write per frame, so no throttle. A
 * daemon restart loses nothing that matters: the turn died with it, and a turn that is not registered is never called
 * silent.
 *
 * A port of its own so the supervisor can ask "is a turn live, and is it quiet" without the abort and the interrupt in
 * reach (`tests/architecture/supervisor-reach.test.ts`).
 */
export abstract class LiveTurnReader {
	/** The issue's running turn in this process, or `undefined` when none is registered. */
	abstract liveTurn(issueId: string): LiveTurn | undefined
}
