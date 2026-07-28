import { injectable } from 'tsyringe-neo'
import type Z from 'zod'
import type { IssueWorkInputSchema } from './types'

type IssueWorkInput = Z.output<typeof IssueWorkInputSchema>

/**
 * The prompt half of `IssueWorkAgent` (§4.8), a stateful builder in the shape of the medscall
 * `ServicePromptBuilder`: it renders the STANDING context of a turn — which workspace the CLI is
 * running in, which issue it is working, under what key.
 *
 * ### The declaration instruction is deliberately ABSENT until Fase 6
 * §4.8 says this prompt must explicitly instruct the model to call `TransitionIssueStatus` when it
 * finishes and `RaiseStop` when it is stuck — "the declaration only exists if it is asked
 * for". That instruction lands in the SAME phase as the tools it names: the MCP router, the four tool
 * handlers and the `RunTokenService` implementation are all Fase 6, and `IssueWorkAgent.tools` is
 * empty until then. Telling a model to call a tool that is not in its `--allowedTools` scope produces
 * a turn that narrates a tool call it cannot make — worse than saying nothing, and exactly the kind of
 * half-built surface §8 forbids. Fase 6 adds the paragraph and the scope together.
 */
@injectable()
export class IssueWorkPromptBuilder {
	/** Standing instructions for the turn: the workspace, the issue under work, and the reply contract. */
	system(input: IssueWorkInput): string {
		return [
			`You are working on a coding issue inside the repository at ${input.cwd}.`,
			`ISSUE [${input.key}] ${input.title}`,
			'Do the work the message asks for in that repository. When you are done, reply with a short ' +
				'summary the requester will read in a chat message — not a diff, not a transcript.',
		].join('\n')
	}
}
