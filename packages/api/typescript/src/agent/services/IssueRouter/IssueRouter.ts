import { injectable } from 'tsyringe-neo'
import type Z from 'zod'
import { ClassificationMethod, type ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import type { OpenIssueRef } from '@thread/services/OpenIssuesReader'
import { ClassifyIssueAgent, type LlmDecisionSchema } from '../../agents/ClassifyIssueAgent'
import { ClassificationVerdict } from '../../enums'
import { AgentRunnerFactory } from '../AgentRunnerFactory'
import { uniqueSlugKey } from './slug'

/** What the router is asked to route. The envelope fields it needs to run the agent are part of it. */
export interface RouteMessageInput {
	ownerId: string
	threadId: string
	/**
	 * WHICH CLI classifies — the thread's primary provider (`thread.providers[0]`), the same one the
	 * turn itself will run under. Supplied by the caller rather than resolved here because the router
	 * has no thread repository and should not grow one: it is POLICY over an agent, not a reader.
	 * `DefaultIssueRouter` turns it into a runner via `AgentRunnerFactory`.
	 */
	provider: ProviderKind
	/** The thread's ABSOLUTE workspace path — the classification run's `cwd`. Never `process.cwd()`. */
	cwd: string
	/** The inbound message text to demultiplex. */
	message: string
	/**
	 * The issue a channel reply-quote points at, ALREADY resolved by the caller (BC4 maps the
	 * channel-native quotedEntryId → issueId). When present and open, it routes authoritatively and the
	 * agent is never consulted.
	 */
	quotedIssueId?: string
	openIssues: OpenIssueRef[]
	/** Rolling per-thread context the agent can read, oldest→newest. */
	contextBuffer?: string[]
	/** Confidence floor for a context match (0..1). Overrides the configured default when present. */
	threshold?: number
}

/**
 * The routing decision — `{ matchIssue | newIssue(slugKey) | clarify(question) }`. `MATCH_ISSUE`
 * carries the `ClassificationMethod` that produced it (REPLY_QUOTE for the deterministic shortcut,
 * CONTEXT_MATCH for a model match above the floor).
 */
export type ClassificationDecision =
	| { kind: 'MATCH_ISSUE'; method: ClassificationMethod; issueId: string; confidence?: number }
	| { kind: 'NEW_ISSUE'; slugKey: string; title: string; confidence?: number }
	| { kind: 'CLARIFY'; question: string; candidateIssueIds: string[] }

/**
 * Demultiplexes one inbound message into a routing decision — the POLICY half of what used to be a
 * single `IssueClassifier`, split by the founder critique that produced Fase 4.5: the classifier is an
 * AGENT (`agents/ClassifyIssueAgent`, the prompt + `outputSchema` + the one structured call), and what
 * remains here is the routing policy around it (GOAL-agent-abstraction §4.8/§5.3).
 *
 * Four things live HERE and deliberately not in the agent, because each is a DECISION rather than an
 * inference — an agent that made them would be two things at once:
 *   1. the deterministic reply-quote shortcut (authoritative, taken BEFORE any model call);
 *   2. the confidence floor a context match has to clear (`DEFAULT_THRESHOLD`);
 *   3. minting the thread-unique slug key for a new issue (`uniqueSlugKey`);
 *   4. the clarification fallback, including the degrade path for a low-confidence match.
 *
 * Resolution order is the modeling's authoritative one:
 *   1. REPLY-QUOTE — a reply-quote to an open issue routes there, no model call at all.
 *   2. CONTEXT-MATCH / NEW / CLARIFY — ONE `ClassifyIssueAgent.classify(...)`; a match below the
 *      threshold, or one pointing at an issue that is no longer open, degrades to a clarification.
 *
 * ### Why `thread/usecases/ClassifyMessage` injects THIS and not the agent
 * §5.2's divergence from the medscall stands: the classification decision is consumed INSIDE the
 * caller's own transaction (transcript + clarification are persisted with it), so it cannot be
 * event-driven without splitting one routing decision across two transactions. What §5.2 named as the
 * injected token was the AGENT, which cannot be right once the policy moved out — the four items above
 * would have had to live in the thread use case, i.e. split across two contexts. The use case injects
 * the router; the router injects the agent. The Partnership edge is unchanged and still annotated.
 */
export abstract class IssueRouter {
	/** Default confidence floor for a context match — configurable per-call via `RouteMessageInput.threshold`. */
	static readonly DEFAULT_THRESHOLD = 0.6

	abstract classify(input: RouteMessageInput): Promise<ClassificationDecision>
}

/**
 * The real policy, over the real `ClassifyIssueAgent`. The abstract port above exists for the usual
 * reason a service has one here: `thread/usecases/ClassifyMessage` injects the ROUTER, and a test of
 * that use case wants a deterministic decision without reaching an agent at all — that is what
 * `MockIssueRouter` is for. The agent's own stubbing seam (the `AgentRunnerFactory` DI binding, swapped
 * per-suite with `new FixedAgentRunnerFactory(stub)`) stays available for tests that DO want the policy
 * exercised end to end, which is what `IssueRouter.test.ts` does.
 */
@injectable()
export class DefaultIssueRouter extends IssueRouter {
	constructor(
		private readonly agent: ClassifyIssueAgent,
		private readonly runners: AgentRunnerFactory,
	) {
		super()
	}

	async classify(input: RouteMessageInput): Promise<ClassificationDecision> {
		// 1. Deterministic reply-quote shortcut — authoritative, wins over context matching, no model call.
		if (input.quotedIssueId && input.openIssues.some(issue => issue.issueId === input.quotedIssueId)) {
			return { kind: 'MATCH_ISSUE', method: ClassificationMethod.REPLY_QUOTE, issueId: input.quotedIssueId }
		}

		// 2. ONE structured agent run for context-match / new-issue / clarification.
		//
		// The runner is resolved HERE and handed to the agent, which is the whole of decision (2): the
		// agent holds no I/O, and `for()` raises the named NOT_IMPLEMENTED when the thread declares a CLI
		// no runner class drives. Note the ORDER against the shortcut above — a reply-quote routes
		// without ever touching a runner, so a thread on a detect-only provider still classifies
		// deterministically instead of failing on a lookup it did not need.
		const runner = this.runners.for(input.provider)
		const threshold = input.threshold ?? IssueRouter.DEFAULT_THRESHOLD
		const decision = await this.agent.classify(runner, {
			ownerId: input.ownerId,
			threadId: input.threadId,
			cwd: input.cwd,
			message: input.message,
			openIssues: input.openIssues,
			contextBuffer: input.contextBuffer,
		})

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

	private clarify(input: RouteMessageInput, question?: Z.output<typeof LlmDecisionSchema>['question']): ClassificationDecision {
		return {
			kind: 'CLARIFY',
			question: question?.trim() || 'Which issue is this about?',
			candidateIssueIds: input.openIssues.map(issue => issue.issueId),
		}
	}
}

/** Fallback title when the model opens a new issue without proposing one — the message, clamped. */
function defaultTitle(message: string): string {
	const firstLine = message.trim().split('\n')[0]?.trim() ?? ''
	return (firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine) || 'New request'
}
