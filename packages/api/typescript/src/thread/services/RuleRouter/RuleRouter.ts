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
		if (input.quotedIssueId) {
			const issue = await this.issues.steerableIssue(input.threadId, input.quotedIssueId, tx)
			if (issue && !issue.needsReopen) return { issue, via: 'REPLY_QUOTE' }
			return undefined
		}
		const keys = [...new Set([...input.text.matchAll(ISSUE_KEY_IN_TEXT)].map(match => match[1] ?? ''))].filter(Boolean)
		if (keys.length !== 1) return undefined
		const issue = await this.issues.steerableIssueByKey(input.threadId, keys[0] ?? '', tx)
		return issue && !issue.needsReopen ? { issue, via: 'KEY_IN_TEXT' } : undefined
	}
}
