import { describe, expect, it } from 'bun:test'
import { cardMetaOf, type CardFacts } from './cardMeta'

const base: CardFacts = { lifeState: 'RUNNING', openAsks: [], artifactCount: 0 }

describe('cardMetaOf — what a kanban card says in its column', () => {
	it('needs you: the first open ask, by code and question', () => {
		const meta = cardMetaOf({
			...base,
			lifeState: 'WAITING_PERSON',
			openAsks: [
				{ code: 'APP-12 · D1', question: 'Publico?' },
				{ code: 'APP-12 · D2', question: 'Qual?' },
			],
		})
		expect(meta).toEqual({ kind: 'ask', code: 'APP-12 · D1', question: 'Publico?' })
		expect(cardMetaOf({ ...base, lifeState: 'WAITING_PERSON' })).toEqual({ kind: 'none' })
	})

	it('waiting: the retry time first, then the quota time, else the exact state', () => {
		expect(cardMetaOf({ ...base, lifeState: 'WAITING_RETRY', retryingAt: 'r', waitingForProviderUntil: 'p' })).toEqual({
			kind: 'retryAt',
			at: 'r',
		})
		expect(cardMetaOf({ ...base, lifeState: 'WAITING_PROVIDER', waitingForProviderUntil: 'p' })).toEqual({ kind: 'backAt', at: 'p' })
		expect(cardMetaOf({ ...base, lifeState: 'WAITING_BUDGET' })).toEqual({ kind: 'state', lifeState: 'WAITING_BUDGET' })
	})

	it('stalled: escalated first, then paused, else the exact state', () => {
		expect(cardMetaOf({ ...base, lifeState: 'STALLED', escalatedAt: 'e', paused: true })).toEqual({ kind: 'escalated' })
		expect(cardMetaOf({ ...base, lifeState: 'PAUSED' })).toEqual({ kind: 'paused' })
		expect(cardMetaOf({ ...base, lifeState: 'REMINDED' })).toEqual({ kind: 'state', lifeState: 'REMINDED' })
	})

	it('working: how many artifacts, when any; queued and done say nothing more', () => {
		expect(cardMetaOf({ ...base, artifactCount: 2 })).toEqual({ kind: 'artifacts', count: 2 })
		expect(cardMetaOf(base)).toEqual({ kind: 'none' })
		expect(cardMetaOf({ ...base, lifeState: 'QUEUED', artifactCount: 3 })).toEqual({ kind: 'none' })
		expect(cardMetaOf({ ...base, lifeState: 'DONE', artifactCount: 3 })).toEqual({ kind: 'none' })
	})
})
