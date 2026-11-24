import { describe, expect, it } from 'bun:test'
import { batchOf, buildConversation, createdAt, requesterEntryId, retryCount, type OpenStop, type TimelineItem } from './taskConversation'

const at = (minute: number) => new Date(Date.UTC(2026, 10, 24, 10, minute)).toISOString()

const created: TimelineItem = { kind: 'CREATED', id: 't1', at: at(0), title: 'Botão de cupom' }
const fromPerson: TimelineItem = {
	kind: 'MESSAGE',
	id: 't2',
	at: at(1),
	entryId: 'e-person',
	transcriptKind: 'CONTACT',
	text: 'o botão some',
}
const fromAgent: TimelineItem = {
	kind: 'MESSAGE',
	id: 't3',
	at: at(2),
	entryId: 'e-agent',
	transcriptKind: 'SYSTEM',
	text: 'achei',
	routing: 'GROUP',
}
const direct: TimelineItem = { kind: 'MESSAGE', id: 't4', at: at(3), entryId: 'e-direct', transcriptKind: 'DIRECT', text: 'respondendo' }
const whisper: TimelineItem = {
	kind: 'MESSAGE',
	id: 't5',
	at: at(4),
	entryId: 'e-whisper',
	transcriptKind: 'WHISPER',
	text: 'só no mobile',
}
const action: TimelineItem = { kind: 'MESSAGE', id: 't6', at: at(5), entryId: 'e-action', transcriptKind: 'ACTION', text: 'abriu PR' }
const steer: TimelineItem = { kind: 'STEER', id: 't7', at: at(6), text: 'não mexe no desktop', readAt: at(7), reminder: false }
const deadSteer: TimelineItem = { kind: 'STEER', id: 't8', at: at(8), text: 'não chegou', reminder: false, failed: true }
const artifact: TimelineItem = { kind: 'ARTIFACT', id: 't9', at: at(9), artifactId: 'a1', artifactKind: 'LINK', name: 'Prévia' }
const delivered: TimelineItem = {
	kind: 'MESSAGE',
	id: 't9b',
	at: at(9),
	entryId: 'e-deliver',
	transcriptKind: 'SYSTEM',
	text: 'prévia no ar',
	artifactId: 'a1',
}
const askRaised: TimelineItem = {
	kind: 'STOP_RAISED',
	id: 't10',
	at: at(10),
	stopId: 's-ask',
	stopKind: 'DECISION_REQUESTED',
	title: 'Decidir',
	ask: { code: 'APP-12 · D1', question: 'Publico agora?', options: [] },
}
const stopRaised: TimelineItem = { kind: 'STOP_RAISED', id: 't11', at: at(11), stopId: 's-stop', stopKind: 'SERVER_ERROR', title: 'Erro' }
const retry: TimelineItem = { kind: 'RETRY_SCHEDULED', id: 't12', at: at(12), attempt: 2, maxAttempts: 5, retryAt: at(16) }
const batch: TimelineItem = { kind: 'BATCH_LINKED', id: 't13', at: at(13), batchCode: 'L-31', n: 2 }

/** The surface's own ask view — opaque to the builder. */
type Ask = { code: string }
const openAsk: OpenStop<Ask> = { ask: { code: 'APP-12 · D1' }, resolutions: [] }
const openStop: OpenStop<Ask> = { resolutions: ['RETRY', 'TAKE_OVER'] }
const open = (stopId: string) => ({ 's-ask': openAsk, 's-stop': openStop })[stopId]

describe('buildConversation', () => {
	it('gives each message its look by who spoke, and turns an action into a line', () => {
		const looks = buildConversation([fromPerson, fromAgent, direct, whisper, action]).map(shown => shown.look)
		expect(looks).toEqual(['person', 'agent', 'agent', 'whisper', 'event'])
	})

	it('keeps the timeline order and shows non-chat facts as lines', () => {
		const shown = buildConversation([created, fromPerson, retry, batch])
		expect(shown.map(entry => entry.item.id)).toEqual(['t1', 't2', 't12', 't13'])
		expect(shown.map(entry => entry.look)).toEqual(['event', 'person', 'event', 'event'])
	})

	it('folds the message that delivered an artifact into the artifact chip, keeping its words as the caption', () => {
		const shown = buildConversation([delivered, artifact])
		expect(shown).toEqual([{ look: 'artifact', item: artifact, caption: 'prévia no ar' }])
		expect(buildConversation([artifact])).toEqual([{ look: 'artifact', item: artifact, caption: undefined }])
	})

	it('shows a steer with its receipt, and one the queue gave up on as failed', () => {
		expect(buildConversation([steer, deadSteer])).toEqual([
			{ look: 'steer', item: steer, failed: false },
			{ look: 'steer', item: deadSteer, failed: true },
		])
	})

	it('makes an OPEN stop a card — an ask is answerable, a plain stop resolvable — and a closed one a line', () => {
		expect(buildConversation([askRaised, stopRaised], { openStopOf: open })).toEqual([
			{ look: 'ask', item: askRaised, open: { ask: { code: 'APP-12 · D1' }, resolutions: [] } },
			{ look: 'stop', item: stopRaised, open: openStop },
		])
		expect(buildConversation([askRaised, stopRaised]).map(entry => entry.look)).toEqual(['event', 'event'])
	})
})

describe('timeline facts for the details panel', () => {
	const items = [created, fromPerson, fromAgent, retry, retry, batch]

	it('finds who asked (the first message from a person), when, how many retries and the batch', () => {
		expect(requesterEntryId(items)).toBe('e-person')
		expect(createdAt(items)).toBe(at(0))
		expect(retryCount(items)).toBe(2)
		expect(batchOf(items)).toEqual({ batchCode: 'L-31', n: 2 })
	})

	it('answers nothing when the timeline has none of it', () => {
		expect(requesterEntryId([fromAgent])).toBeUndefined()
		expect(createdAt([fromAgent])).toBeUndefined()
		expect(retryCount([fromAgent])).toBe(0)
		expect(batchOf([fromAgent])).toBeUndefined()
	})
})
