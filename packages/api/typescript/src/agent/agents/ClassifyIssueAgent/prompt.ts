import { injectable } from 'tsyringe-neo'
import type Z from 'zod'
import type { ClassifyIssueInputSchema } from './types'

type ClassifyIssueInput = Z.output<typeof ClassifyIssueInputSchema>

/** How many buffer lines the prompt renders. The reader may hand over more; older context is noise. */
const CONTEXT_WINDOW = 20

/**
 * The prompt half of `ClassifyIssueAgent`, split out per §4.8 (one directory per agent:
 * `{Agent.ts, prompt.ts, types.ts, index.ts}`), mirroring the medscall `ServicePromptBuilder`.
 *
 * A CLASS, injected — not two loose functions — for the same reason the medscall builders are
 * classes: the day this prompt needs a repo/owner/config read to render (per-tenant tone, a
 * project-specific glossary), the dependency arrives through the constructor and the agent does not
 * change shape. It is STATELESS today, and that is fine; what it buys is that "the prompt grew a
 * dependency" never becomes "the agent grew a dependency".
 */
@injectable()
export class ClassifyIssuePromptBuilder {
	/** Standing instructions — what the model is for, and the vocabulary of its verdict. */
	system(): string {
		return (
			'You demultiplex a single messaging stream into coding issues. Decide whether an inbound message ' +
			'continues an existing open issue (MATCH_ISSUE with its issueId and a 0..1 confidence), starts new ' +
			'work (NEW_ISSUE with a short imperative title), or is too ambiguous to route (CLARIFY with a short ' +
			'question). Reply with the structured decision only.'
		)
	}

	/** The single user turn: the candidate set, the recent context window, and the message itself. */
	user(input: ClassifyIssueInput): string {
		const issues = input.openIssues.length
			? input.openIssues.map(issue => `- ${issue.issueId} [${issue.key}] ${issue.title}`).join('\n')
			: '(none)'
		const buffer = input.contextBuffer?.length ? input.contextBuffer.slice(-CONTEXT_WINDOW).join('\n') : '(empty)'
		return [`OPEN ISSUES:\n${issues}`, `RECENT CONTEXT:\n${buffer}`, `INBOUND MESSAGE:\n${input.message}`].join('\n\n')
	}
}
