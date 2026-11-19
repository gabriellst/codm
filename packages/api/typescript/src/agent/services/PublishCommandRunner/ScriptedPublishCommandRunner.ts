import { injectable } from 'tsyringe-neo'
import { PublishRunOutcome } from '@codm/contracts-typescript/wire/enums'
import { PublishCommandRunner, type PublishCommandResult, type PublishCommandRun } from './PublishCommandRunner'

/**
 * The runner of the `mock` / `integration` environments — never spawns anything. It records every run it was asked
 * for and answers the scripted result (by default: exit 0, no output). A test scripts `next` before the run.
 */
@injectable()
export class ScriptedPublishCommandRunner extends PublishCommandRunner {
	readonly runs: PublishCommandRun[] = []
	next: Omit<PublishCommandResult, 'durationMs'> & { durationMs?: number } = {
		outcome: PublishRunOutcome.SUCCEEDED,
		exitCode: 0,
		output: '',
		truncated: false,
	}

	async run(run: PublishCommandRun): Promise<PublishCommandResult> {
		this.runs.push(run)
		return { durationMs: 0, ...this.next }
	}
}
