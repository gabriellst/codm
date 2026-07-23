import { injectable } from 'tsyringe-neo'
import type { z as Zod } from 'zod'
import { z, BaseError } from '@codedm/core-typescript'
import { ClassificationMethod, ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import { TerminalLLMRunner } from '../TerminalLLMRunner'
import type { TerminalApplicationErrors } from '../../errors'
import { uniqueSlugKey } from './slug'
import { ClassificationVerdict } from '../../enums'

/** An open issue the classifier may route an inbound message to. */
export interface OpenIssueRef {
	issueId: string
	key: string
	title: string
}

export interface ClassifyInput {
	/** The inbound message text to demultiplex. */
	message: string
	/**
	 * The issue a channel reply-quote points at, ALREADY resolved by the caller (BC4 maps the
	 * channel-native quotedEntryId → issueId). When present and open, it routes authoritatively and
	 * the LLM is never consulted.
	 */
	quotedIssueId?: string
	openIssues: OpenIssueRef[]
	/** Rolling per-thread context the agent can read, oldest→newest. */
	contextBuffer?: string[]
	/** Confidence floor for a context match (0..1). Overrides the configured default when present. */
	threshold?: number
	/** Provider CLI to run the structured-generate against. Defaults to claude-code. */
	provider?: ProviderKind
}

/**
 * The routing decision — `{ matchIssue | newIssue(slugKey) | clarify(question) }`, per the task
 * seam. `MATCH_ISSUE` carries the `ClassificationMethod` that produced it (REPLY_QUOTE for the
 * deterministic shortcut, CONTEXT_MATCH for an LLM match).
 */
export type ClassificationDecision =
	| { kind: 'MATCH_ISSUE'; method: ClassificationMethod; issueId: string; confidence?: number }
	| { kind: 'NEW_ISSUE'; slugKey: string; title: string; confidence?: number }
	| { kind: 'CLARIFY'; question: string; candidateIssueIds: string[] }

/** The structured shape the runner's `generate()` returns. Nullish fields since the LLM omits the
 *  ones that don't apply to its chosen decision. */
const LlmDecisionSchema = z.object({
	decision: z.enum(ClassificationVerdict),
	issueId: z.string().nullish(),
	confidence: z.number().min(0).max(1).nullish(),
	title: z.string().nullish(),
	question: z.string().nullish(),
})

/**
 * Demultiplexes a single-stream inbound message into an issue decision — CodeDM's Router engine as a
 * SERVICE (the source-map's "classification Service", NOT an aggregate). It lives HERE, in the
 * terminal/agent-runtime context, and is CONSUMED later by BC4 Thread & Routing (phase 6). This
 * phase keeps the seam clean: no thread/transcript/clarification-persistence domain — just the
 * decision plumbing.
 *
 * Resolution order (the modeling's authoritative order):
 *   1. REPLY-QUOTE — deterministic, BEFORE any LLM call: a reply-quote to an open issue routes there.
 *   2. CONTEXT-MATCH / NEW / CLARIFY — an LLM structured-generate (`TerminalLLMRunner.generate`) over the
 *      message + open issues + context buffer; a match below `threshold` degrades to a clarification.
 *
 * Tested against a stubbed runner — never a real LLM (house rule: no real provider calls in tests).
 */
@injectable()
export class IssueClassifier {
	/** Default confidence floor for a context match — configurable per-call via `ClassifyInput.threshold`. */
	static readonly DEFAULT_THRESHOLD = 0.6

	constructor(private readonly runner: TerminalLLMRunner) {}

	async classify(input: ClassifyInput): Promise<ClassificationDecision> {
		// 1. Deterministic reply-quote shortcut — authoritative, wins over context matching, no LLM.
		if (input.quotedIssueId && input.openIssues.some(issue => issue.issueId === input.quotedIssueId)) {
			return { kind: 'MATCH_ISSUE', method: ClassificationMethod.REPLY_QUOTE, issueId: input.quotedIssueId }
		}

		// 2. LLM structured-generate for context-match / new-issue / clarification.
		const threshold = input.threshold ?? IssueClassifier.DEFAULT_THRESHOLD
		const decision = await this.generateDecision(input)

		if (decision.decision === ClassificationVerdict.MATCH_ISSUE) {
			const matched = decision.issueId ? input.openIssues.find(issue => issue.issueId === decision.issueId) : undefined
			const confidence = decision.confidence ?? 0
			if (matched && confidence >= threshold) {
				return { kind: 'MATCH_ISSUE', method: ClassificationMethod.CONTEXT_MATCH, issueId: matched.issueId, confidence }
			}
			// A match the model isn't confident about (or points nowhere) is ambiguous → clarify.
			return this.clarify(input, decision.question)
		}

		if (decision.decision === ClassificationVerdict.NEW_ISSUE) {
			const title = decision.title?.trim() || defaultTitle(input.message)
			const slugKey = uniqueSlugKey(
				title,
				input.openIssues.map(issue => issue.key),
			)
			return { kind: 'NEW_ISSUE', slugKey, title, confidence: decision.confidence ?? undefined }
		}

		return this.clarify(input, decision.question)
	}

	private clarify(input: ClassifyInput, question?: string | null): ClassificationDecision {
		return {
			kind: 'CLARIFY',
			question: question?.trim() || 'Which issue is this about?',
			candidateIssueIds: input.openIssues.map(issue => issue.issueId),
		}
	}

	private async generateDecision(input: ClassifyInput): Promise<Zod.output<typeof LlmDecisionSchema>> {
		try {
			return await this.runner.generate({
				provider: input.provider ?? ProviderKind.CLAUDE_CODE,
				systemPrompt: SYSTEM_PROMPT,
				prompt: buildClassificationPrompt(input),
				outputSchema: LlmDecisionSchema,
			})
		} catch (cause) {
			throw new BaseError<TerminalApplicationErrors>('CLASSIFICATION_FAILED', `classification generate failed: ${String(cause)}`)
		}
	}
}

const SYSTEM_PROMPT =
	'You demultiplex a single messaging stream into coding issues. Decide whether an inbound message ' +
	'continues an existing open issue (MATCH_ISSUE with its issueId and a 0..1 confidence), starts new ' +
	'work (NEW_ISSUE with a short imperative title), or is too ambiguous to route (CLARIFY with a short ' +
	'question). Reply with the structured decision only.'

function buildClassificationPrompt(input: ClassifyInput): string {
	const issues = input.openIssues.length
		? input.openIssues.map(issue => `- ${issue.issueId} [${issue.key}] ${issue.title}`).join('\n')
		: '(none)'
	const buffer = input.contextBuffer?.length ? input.contextBuffer.slice(-20).join('\n') : '(empty)'
	return [`OPEN ISSUES:\n${issues}`, `RECENT CONTEXT:\n${buffer}`, `INBOUND MESSAGE:\n${input.message}`].join('\n\n')
}

/** Fallback title when the model opens a new issue without proposing one — the message, clamped. */
function defaultTitle(message: string): string {
	const firstLine = message.trim().split('\n')[0]?.trim() ?? ''
	return (firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine) || 'New request'
}
