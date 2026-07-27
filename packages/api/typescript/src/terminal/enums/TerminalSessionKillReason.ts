/**
 * Why a terminal CLI session was killed (terminal.session_killed domain event).
 *
 * PRODUCER-LESS since Fase 3: the PTY engine that raised it is deleted, and a run over pipes has no
 * "the session died" state distinct from "the run ended". The literal union that used to derive from
 * this enum went with the engine. Kept because `TerminalSessionKilledEvent` still types its payload
 * on it, and §5.3 assigns THAT event's keep-or-delete call to Fase 4.
 */
export enum TerminalSessionKillReason {
	IDLE = 'idle',
	SHUTDOWN = 'shutdown',
	CRASH = 'crash',
	EXPLICIT = 'explicit',
}
