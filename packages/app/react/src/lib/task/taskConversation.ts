import { IssueTimelineItemKindEnum as K, TranscriptKindEnum } from '@codm/client-typescript/typescript'
import type { GetIssueTimelineQueryResponse, IssueTimelineItemKind, StopResolution } from '@codm/client-typescript/typescript'

/** One item of a task's timeline, as the daemon (`GET /ui/issues/:id/timeline`) and the cloud panel
 *  (`GET /panel/g/:token/issues/:id`) both serve it — the panel stores the daemon's items verbatim. */
export type TimelineItem = GetIssueTimelineQueryResponse['items'][number]

type ItemOf<K extends IssueTimelineItemKind> = Extract<TimelineItem, { kind: K }>

/**
 * A stop that is open right now, as the surface knows it: the desktop from the needs-you panel, the cloud
 * panel from the issue's `openStops`. `A` is that surface's ask view (same shape, generated twice).
 */
export interface OpenStop<A> {
	ask?: A
	resolutions: readonly StopResolution[]
}

/**
 * How one timeline item shows up in the task conversation. The item itself travels along untouched:
 * the renderer owns the words (catalog keys), this function only decides the LOOK and what is hidden.
 *
 * - `person` / `agent` / `whisper` — a chat bubble (who spoke, read from the transcript kind).
 * - `steer` — a steer sent to the task, with its delivery receipt; `failed` when the queue gave up on it.
 * - `artifact` — an artifact chip; `caption` is what the message that delivered it said.
 * - `ask` — an OPEN decision/question — answerable (`open.ask` carries how).
 * - `stop` — an OPEN stop without an ask — resolvable by `open.resolutions`.
 * - `event` — everything else, as one thin line.
 */
export type ConversationItem<A = unknown> =
	| { look: 'person'; item: ItemOf<'MESSAGE'> }
	| { look: 'agent'; item: ItemOf<'MESSAGE'> }
	| { look: 'whisper'; item: ItemOf<'MESSAGE'> }
	| { look: 'steer'; item: ItemOf<'STEER'>; failed: boolean }
	| { look: 'artifact'; item: ItemOf<'ARTIFACT'>; caption?: string }
	| { look: 'ask'; item: ItemOf<'STOP_RAISED'>; open: OpenStop<A> & { ask: A } }
	| { look: 'stop'; item: ItemOf<'STOP_RAISED'>; open: OpenStop<A> }
	| { look: 'event'; item: TimelineItem }

export interface ConversationJoin<A> {
	/** The stop, if it is still open — an open STOP_RAISED becomes a card, a closed one a line. */
	openStopOf?: (stopId: string) => OpenStop<A> | undefined
}

const event = <A>(item: TimelineItem): ConversationItem<A> => ({ look: 'event', item })

function classifyMessage<A>(item: ItemOf<'MESSAGE'>): ConversationItem<A> | null {
	// A message that delivered an artifact is folded into the artifact's chip (its text becomes the caption).
	if (item.artifactId) return null
	switch (item.transcriptKind) {
		case TranscriptKindEnum.CONTACT:
			return { look: 'person', item }
		case TranscriptKindEnum.SYSTEM:
		case TranscriptKindEnum.DIRECT:
			return { look: 'agent', item }
		case TranscriptKindEnum.WHISPER:
			return { look: 'whisper', item }
		case TranscriptKindEnum.ACTION:
			return event(item)
		default: {
			const _exhaustive: never = item.transcriptKind
			return _exhaustive
		}
	}
}

function classifyStop<A>(item: ItemOf<'STOP_RAISED'>, join: ConversationJoin<A>): ConversationItem<A> {
	const open = join.openStopOf?.(item.stopId)
	if (!open) return event(item)
	const { ask } = open
	return ask === undefined ? { look: 'stop', item, open } : { look: 'ask', item, open: { ...open, ask } }
}

/** One rule per kind — a kind added to the contract fails to compile until it is placed here. */
function classify<A>(item: TimelineItem, join: ConversationJoin<A>, captions: ReadonlyMap<string, string>): ConversationItem<A> | null {
	switch (item.kind) {
		case K.MESSAGE:
			return classifyMessage(item)
		case K.STEER:
			return { look: 'steer', item, failed: item.failed ?? false }
		case K.ARTIFACT:
			return { look: 'artifact', item, caption: captions.get(item.artifactId) }
		case K.STOP_RAISED:
			return classifyStop(item, join)
		case K.CREATED:
		case K.TURN_STARTED:
		case K.STOP_RESOLVED:
		case K.COMPLETED:
		case K.ARCHIVED:
		case K.PAUSED:
		case K.RESUMED:
		case K.REGRET_WINDOW:
		case K.BATCH_LINKED:
		case K.PUBLISH_RAN:
		case K.NUDGED:
		case K.RETRY_SCHEDULED:
		case K.SUPERVISOR_REVIEWED:
			return event(item)
		default: {
			const _exhaustive: never = item
			return _exhaustive
		}
	}
}

/** The task conversation: the timeline in its own order (oldest first), each item given its look. */
export function buildConversation<A>(items: readonly TimelineItem[], join: ConversationJoin<A> = {}): ConversationItem<A>[] {
	const captions = new Map<string, string>()
	for (const item of items) if (item.kind === K.MESSAGE && item.artifactId && item.text.trim()) captions.set(item.artifactId, item.text)
	const out: ConversationItem<A>[] = []
	for (const item of items) {
		const shown = classify(item, join, captions)
		if (shown) out.push(shown)
	}
	return out
}

/** Who asked for the task: the first message a person sent into it (its transcript entry id). */
export function requesterEntryId(items: readonly TimelineItem[]): string | undefined {
	for (const item of items) if (item.kind === K.MESSAGE && item.transcriptKind === TranscriptKindEnum.CONTACT) return item.entryId
	return undefined
}

/** When the task was created (the CREATED item), if the timeline has it. */
export function createdAt(items: readonly TimelineItem[]): string | undefined {
	return items.find(item => item.kind === K.CREATED)?.at
}

/** How many retries were scheduled for the task — "Tentativas" in the details. */
export function retryCount(items: readonly TimelineItem[]): number {
	return items.filter(item => item.kind === K.RETRY_SCHEDULED).length
}

/** The batch the task belongs to (the last BATCH_LINKED), if any. */
export function batchOf(items: readonly TimelineItem[]): { batchCode: string; n: number } | undefined {
	let found: { batchCode: string; n: number } | undefined
	for (const item of items) if (item.kind === K.BATCH_LINKED) found = { batchCode: item.batchCode, n: item.n }
	return found
}
