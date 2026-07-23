/**
 * How a terminal run ended, as reported on RunTerminalSession's output. Context-private
 * (not a contracts enum): the outcome FACTS cross contexts as the frozen integration events,
 * never as this value.
 */
export enum TerminalRunOutcome {
	COMPLETED = 'COMPLETED',
	STOPPED = 'STOPPED',
}
