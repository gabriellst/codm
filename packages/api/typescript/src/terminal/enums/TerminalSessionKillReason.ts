/**
 * Why a terminal CLI session was killed (terminal.session_killed domain event). The engine's
 * `SessionKillReason` literal union (services/TerminalLLMRunner/types.ts) DERIVES from these
 * values — one vocabulary, declared here.
 */
export enum TerminalSessionKillReason {
	IDLE = 'idle',
	SHUTDOWN = 'shutdown',
	CRASH = 'crash',
	EXPLICIT = 'explicit',
}
