import type { PublishRunOutcome } from '@codm/contracts-typescript/wire/enums'

/** How long a publish command may run before it is killed — its whole process group (fase 4, item 6c). */
export const PUBLISH_COMMAND_TIMEOUT_MS = 10 * 60 * 1000
/** The most output (stdout + stderr, interleaved) kept from one run — the TAIL, where the error usually is. */
export const PUBLISH_OUTPUT_MAX_BYTES = 64 * 1024

/** What to run: an argument list (never a shell line), where, and for how long at most. */
export interface PublishCommandRun {
	argv: readonly string[]
	cwd: string
	timeoutMs: number
}

/** The outcomes a run that STARTED can have — the cancelled ones never reach the runner. */
export type RanOutcome = PublishRunOutcome.SUCCEEDED | PublishRunOutcome.FAILED | PublishRunOutcome.TIMED_OUT

export interface PublishCommandResult {
	outcome: RanOutcome
	/** Absent when the process never started (spawn failed) or was killed. */
	exitCode?: number
	durationMs: number
	/** The captured output's tail, at most `PUBLISH_OUTPUT_MAX_BYTES` — local only (the task's terminal log). */
	output: string
	/** Whether the head of the output was dropped to fit. */
	truncated: boolean
}

/**
 * RUNS THE WORKSPACE'S PUBLISH COMMAND (fase 4, item 6c) — a port, so no test ever spawns a real deploy.
 *
 * `real` spawns `argv[0]` with the rest as literal arguments (no shell, no expansion), in `cwd`, with the daemon's
 * environment minus its own secrets, kills the whole process group at `timeoutMs`, and keeps the output's tail.
 * `mock` / `integration` are scripted.
 *
 * NEVER THROWS for anything the command does: a spawn that fails is `FAILED`, a non-zero exit is `FAILED`, the
 * deadline is `TIMED_OUT` — an outcome, never an exception that could send the item back to the queue and run the
 * command a second time. And never puts the argv in a message: it may carry a credential.
 */
export abstract class PublishCommandRunner {
	abstract run(run: PublishCommandRun): Promise<PublishCommandResult>
}
