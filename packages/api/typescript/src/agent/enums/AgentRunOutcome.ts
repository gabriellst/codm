/**
 * How a terminal run ended, as reported on RunIssueTurn's output. Context-private
 * (not a contracts enum): the outcome FACTS cross contexts as the frozen integration events,
 * never as this value.
 */
export enum AgentRunOutcome {
	COMPLETED = 'COMPLETED',
	STOPPED = 'STOPPED',
}
