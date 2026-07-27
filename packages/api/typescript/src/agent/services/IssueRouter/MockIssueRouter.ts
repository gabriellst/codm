import { injectable } from 'tsyringe-neo'
import { ClassificationMethod } from '@codedm/contracts-typescript/wire/enums'
import { IssueRouter, type ClassificationDecision, type RouteMessageInput } from './IssueRouter'

/**
 * The `mock`-env `IssueRouter`: a canned decision, no agent, no model, no process.
 *
 * It exists for the consumer, not for the router's own tests. `thread/usecases/ClassifyMessage`
 * injects this port and persists transcript + clarification around whatever it answers — a flow test
 * of THAT wants to fix the decision and assert the persistence, not to re-exercise the confidence
 * floor. The policy itself is tested in `IssueRouter.test.ts`, against the real
 * `DefaultIssueRouter` + the real `ClassifyIssueAgent` over a stubbed `AgentRunner`, so stubbing here
 * never hides the behaviour it stands in for.
 *
 * Default answer is CLARIFY with no candidates: the inert branch, which persists a clarification
 * rather than silently routing a message somewhere a test did not ask for.
 */
@injectable()
export class MockIssueRouter extends IssueRouter {
	/** The decision the next `classify()` returns. Set it per test; `undefined` = the inert CLARIFY. */
	nextDecision: ClassificationDecision | undefined

	/** Every input the consumer routed — the "was the router consulted, and with what?" assertion. */
	readonly inputs: RouteMessageInput[] = []

	async classify(input: RouteMessageInput): Promise<ClassificationDecision> {
		this.inputs.push(input)
		if (this.nextDecision) return this.nextDecision

		// The reply-quote shortcut is DETERMINISTIC policy, so honouring it costs nothing and keeps a
		// consumer test of the reply-quote path meaningful without staging a decision.
		if (input.quotedIssueId && input.openIssues.some(issue => issue.issueId === input.quotedIssueId)) {
			return { kind: 'MATCH_ISSUE', method: ClassificationMethod.REPLY_QUOTE, issueId: input.quotedIssueId }
		}

		return {
			kind: 'CLARIFY',
			question: 'Which issue is this about?',
			candidateIssueIds: input.openIssues.map(issue => issue.issueId),
		}
	}
}
