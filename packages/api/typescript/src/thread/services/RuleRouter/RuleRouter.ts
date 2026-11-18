import type { Transaction } from '@codm/core-typescript'
import { injectable } from 'tsyringe-neo'
import { OpenIssuesReader, type SteerableIssueRef } from '../OpenIssuesReader'
import { ThreadRepository } from '../../repositories/ThreadRepository'
import type { Stop } from '../../entities/Thread'
import { ANSWERED_IN_GROUP_AS } from '../../utils/answerRules'
import { parseAskCode } from '../../utils/askAnswer'

/** A short issue key a person types in a message (`APP-12`, `BDA-142`) — the format `ForkIssue` mints. */
const ISSUE_KEY_IN_TEXT = /\b([A-Z][A-Z0-9]{1,5}-\d{1,6})\b/g

export type RuleRouteVia = 'REPLY_QUOTE' | 'KEY_IN_TEXT'

/**
 * The stop(s) a message ANSWERS (fase 3, item 3): one ⇒ that stop, several ⇒ a digest quoted without a code
 * (the caller asks which). Open or already resolved — a resolved one is a late reply, which the caller tells
 * apart. `answerText` is what is left to read as the answer once the code is taken out.
 */
export interface AnswerTarget {
	via: 'REPLY_QUOTE' | 'CODE'
	stops: Stop[]
	answerText: string
}

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
	constructor(
		private readonly issues: OpenIssuesReader,
		private readonly threads: ThreadRepository,
	) {}

	/**
	 * THE ANSWER RULES (fase 3, item 3 — rules 1, 2 and 4 of the spec), decided before every other rule: a
	 * quote of a question is more specific than a quote of an issue, and "segue" quoting a question is an
	 * answer, not a RESUME.
	 *
	 *  1. It QUOTES a message that put stops to the group (its own, or a digest's) → those of them a reply
	 *     answers at all (`ANSWERED_IN_GROUP_AS` — a block notice is quoted to talk about it); in a digest, the
	 *     code in the text picks one.
	 *  2. It writes an ask's CODE (`APP-12 · D1`, or `D1` quoting a message of the issue) → that ask.
	 *
	 * Only this conversation's stops, by construction: the quote resolved inside this thread, the key is looked
	 * up among its issues. No freshness and no mention gate here — the answer is tied to one specific stop, so
	 * a message ingested late (a reconnect backlog) still answers it; who may answer is the caller's to judge.
	 */
	async answerTarget(
		input: { threadId: string; quotedEntryId?: string; quotedIssueId?: string; text: string },
		tx?: Transaction,
	): Promise<AnswerTarget | undefined> {
		const code = parseAskCode(input.text)
		const answerText = code?.rest ?? input.text

		if (input.quotedEntryId) {
			const carried = (await this.threads.stopsCarriedBy(input.quotedEntryId, tx)).filter(
				stop => stop.threadId === input.threadId && ANSWERED_IN_GROUP_AS[stop.kind] !== undefined,
			)
			const picked = code && carried.length > 1 ? carried.filter(stop => stop.seq === code.seq) : carried
			if (picked.length > 0) return { via: 'REPLY_QUOTE', stops: picked, answerText }
		}

		if (!code) return undefined
		const issueId = code.key ? (await this.issues.steerableIssueByKey(input.threadId, code.key, tx))?.issueId : input.quotedIssueId
		if (!issueId) return undefined
		const stop = await this.threads.findAsk(issueId, code.seq, tx)
		if (!stop || stop.threadId !== input.threadId || ANSWERED_IN_GROUP_AS[stop.kind] === undefined) return undefined
		return { via: 'CODE', stops: [stop], answerText }
	}

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
