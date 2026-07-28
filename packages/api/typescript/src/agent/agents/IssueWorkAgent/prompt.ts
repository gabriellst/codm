import { injectable } from 'tsyringe-neo'
import type Z from 'zod'
import { ISSUE_HANDLING_OPERATION } from '../../mcp/manifest'
import type { AgentInputEnvelope } from '../../types/AgentInput'
import type { IssueWorkInputSchema } from './types'

type IssueWorkInput = Z.output<typeof IssueWorkInputSchema> & AgentInputEnvelope

/**
 * The prompt half of `IssueWorkAgent` (§4.8), a stateful builder in the shape of the medscall
 * `ServicePromptBuilder`: it renders the STANDING context of a turn — which workspace the CLI is
 * running in, which issue it is working, under what key.
 *
 * ### THE DECLARATION INSTRUCTION — added in Fase 6, together with the scope it names
 * §4.8: "the declaration only exists if it is asked for". The inversion this phase is about only
 * happens if the model is TOLD to say when it is done and when it is stuck; a daemon that stops
 * inferring completion and never asks for a declaration has simply stopped closing issues. The
 * paragraph therefore lands in the same phase as the tools — earlier it would have named tools absent
 * from `--allowedTools`, producing a turn that narrates a call it cannot make.
 *
 * ### WHY THE IDS ARE IN THE PROMPT — the visible face of the amendment's conscious regression
 * Fase 1 froze hand-written tool schemas with NO identity field, which made "declare against the
 * wrong issue" inexpressible. Generated tools inherit their controller's PATH PARAMETERS, so
 * `threadId` and `issueId` are now arguments the caller must supply — which means the caller has to
 * know them, which means the prompt has to carry them. The guarantee moved rather than vanished: the
 * MCP router rejects any argument disagreeing with the run token's claims, on every axis (AC-6.6).
 * Rendering the ids here is not a widening — it is the model being handed the only values that will
 * be accepted.
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
			'',
			...this.declarationInstruction(input),
		].join('\n')
	}

	/**
	 * How this turn REPORTS what happened. Tool names are read from the manifest, never typed out: the
	 * scope and the sentence that names it cannot drift apart, and a rename follows the symbol.
	 *
	 * `issueId` is optional on the envelope because the CLASSIFIER runs before an issue exists. It is
	 * always present by the time this agent runs — the base `Agent` refuses to mint a run token without
	 * one — so its absence here means there is no issue to declare against and the paragraph is
	 * omitted rather than rendered with a hole a model would try to fill.
	 */
	private declarationInstruction(input: IssueWorkInput): string[] {
		if (!input.issueId) return []
		return [
			'HOW TO REPORT THE RESULT — do not just describe it in prose, DECLARE it:',
			`  · finished → call the ${ISSUE_HANDLING_OPERATION.transitionIssueStatus} tool with status COMPLETED and a short summary.`,
			`  · blocked and you need the operator to decide or approve → call the ${ISSUE_HANDLING_OPERATION.raiseStop} tool.`,
			`  · you need one specific answer to keep going → call the ${ISSUE_HANDLING_OPERATION.askOperator} tool.`,
			`  · produced a link, image or file worth keeping → call the ${ISSUE_HANDLING_OPERATION.recordArtifact} tool.`,
			'Every one of those tools takes the ids of THIS issue, and no other values are accepted:',
			`  threadId: ${input.threadId}`,
			`  issueId: ${input.issueId}`,
		]
	}
}
