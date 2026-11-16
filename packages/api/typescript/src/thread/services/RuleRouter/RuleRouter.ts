import type { Transaction } from '@codm/core-typescript'
import { injectable } from 'tsyringe-neo'
import { OpenIssuesReader, type SteerableIssueRef } from '../OpenIssuesReader'

/** A short issue key a person types in a message (`APP-12`, `BDA-142`) — the format `ForkIssue` mints. */
const ISSUE_KEY_IN_TEXT = /\b([A-Z][A-Z0-9]{1,5}-\d{1,6})\b/g

export type RuleRouteVia = 'REPLY_QUOTE' | 'KEY_IN_TEXT'

/**
 * THE RULE LAYER OF THE ROUTER (fase 2, item 1 — `.specs/2026-11-16-falar-e-parar-na-hora-design.md`).
 *
 * Decides, WITHOUT a model and in milliseconds, whether an incoming message belongs to one running
 * issue, so it can go straight to that issue's session instead of waiting in the orchestrator's queue:
 *
 *  1. It QUOTES a message linked to an issue (fase 0 records that link) → that issue. Measured on a real
 *     install: more than half of what people write in a group quotes the agent.
 *  2. It NAMES exactly one issue by its short key → that issue.
 *
 * Only a WORKING issue is routed: a completed or waiting one needs reopening or a stop resolution, which
 * is the orchestrator's decision. Anything ambiguous (two keys, no match) returns nothing and the message
 * takes the usual path — the rule layer never guesses.
 */
@injectable()
export class RuleRouter {
	constructor(private readonly issues: OpenIssuesReader) {}

	async route(
		input: { threadId: string; quotedIssueId?: string; text: string },
		tx?: Transaction,
	): Promise<{ issue: SteerableIssueRef; via: RuleRouteVia } | undefined> {
		const found = await this.resolve(input, tx)
		return found && !found.issue.needsReopen ? found : undefined
	}

	/**
	 * The TARGET of a control word (fase 2, item 2 — "pare APP-12", "continue" quoting an issue): the same
	 * two rules as `route`, but ANY non-archived issue of the thread, not only a WORKING one. A NEEDS_INPUT
	 * issue can be paused, and a paused one resumed — the lifecycle is the entity's to judge, not the
	 * router's. Ambiguity still returns nothing: a command never guesses its target.
	 */
	async target(
		input: { threadId: string; quotedIssueId?: string; text: string },
		tx?: Transaction,
	): Promise<{ issue: SteerableIssueRef; via: RuleRouteVia } | undefined> {
		return this.resolve(input, tx)
	}

	private async resolve(
		input: { threadId: string; quotedIssueId?: string; text: string },
		tx?: Transaction,
	): Promise<{ issue: SteerableIssueRef; via: RuleRouteVia } | undefined> {
		if (input.quotedIssueId) {
			const issue = await this.issues.steerableIssue(input.threadId, input.quotedIssueId, tx)
			return issue ? { issue, via: 'REPLY_QUOTE' } : undefined
		}
		const keys = [...new Set([...input.text.matchAll(ISSUE_KEY_IN_TEXT)].map(match => match[1] ?? ''))].filter(Boolean)
		if (keys.length !== 1) return undefined
		const issue = await this.issues.steerableIssueByKey(input.threadId, keys[0] ?? '', tx)
		return issue ? { issue, via: 'KEY_IN_TEXT' } : undefined
	}
}
