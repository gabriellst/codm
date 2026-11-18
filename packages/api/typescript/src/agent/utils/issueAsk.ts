import { uuidv7 } from 'uuidv7'
import type { Language } from '@codm/contracts-typescript/wire/enums'
import { ASK_QUESTION_MAX, type StopAsk as StopAskShape } from '@shared/objects'
import { resolveThreadLanguage, type CatalogLanguage } from '@shared/i18n/messages'
import type { CloudSession } from '@shared/services/CloudSession'
import { StopAsk, type AskStopKind } from '@thread/objects'
import type { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { AgentRunStopRaisedEvent } from '../events/AgentRunStopRaisedEvent'
import { FactSource } from '../enums'

// THE ASK OF AN ISSUE, as the agent's tools put it (fase 3, item 1) — `AskDecision`, `AskQuestion` and the
// legacy doors that alias to them (`AskOperator`, `RaiseStop`, `TransitionIssueStatus NEEDS_INPUT`).

/**
 * The stop fact for an ask — built SYNCHRONOUSLY, on the tool call. The `StopAsk` value object (the thread's,
 * the one owner of the ask's invariants and of the escalation rule) validates it HERE: a duplicated option,
 * a default naming no option or a question without a default is refused to the model as a named error by
 * the call itself. Discovered later by the thread's consumer, the same mistake would be retried and
 * dead-lettered while the issue sat in NEEDS_INPUT with no stop for anyone to answer.
 *
 * The fact carries the kind the value object decided (any declared effect makes a question a decision) and
 * the ask's wire shape; `detail` is the question unless the caller has fuller words (a legacy door whose
 * text was longer than an ask's question may be).
 */
export function askStopFact(input: {
	ownerId: string
	issueId: string
	threadId: string
	requested: AskStopKind
	ask: StopAskShape
	detail?: string
}): { event: AgentRunStopRaisedEvent; stopId: string; kind: AskStopKind } {
	const ask = StopAsk.forKind(input.requested, input.ask)
	const stopId = uuidv7()
	const event = new AgentRunStopRaisedEvent({
		entityId: input.issueId,
		ownerId: input.ownerId,
		payload: {
			stopId,
			issueId: input.issueId,
			threadId: input.threadId,
			kind: ask.kind,
			detail: input.detail ?? ask.question,
			source: FactSource.DECLARED,
			ask: ask.toAsk(),
		},
	})
	return { event, stopId, kind: ask.kind }
}

/**
 * A legacy door's text as an ask's question. Those doors accept up to 4000 characters and an ask's question
 * fits one WhatsApp line block (`ASK_QUESTION_MAX`); the sessions already running call them with whatever
 * they wrote, so the text is CUT (the full words stay in the stop's `detail`), never refused.
 */
export function askQuestionOf(text: string): string {
	const flat = text.trim()
	return flat.length > ASK_QUESTION_MAX ? `${flat.slice(0, ASK_QUESTION_MAX - 1)}…` : flat
}

/**
 * The language the group reads — for the few words a legacy door has to WRITE itself (the yes/no labels of an
 * approval, the question of a NEEDS_INPUT declared without a summary). The conversation's declared language
 * wins; otherwise the owner's.
 */
export async function conversationLanguage(threads: ThreadRepository, session: CloudSession, threadId: string): Promise<CatalogLanguage> {
	const thread = await threads.findById(threadId)
	const ownerLanguage: Language | undefined = thread?.language ? undefined : (await session.identity())?.user.language
	return resolveThreadLanguage(thread?.language, ownerLanguage)
}
