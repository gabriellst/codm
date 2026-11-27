import { describe, expect, it } from 'bun:test'
import { cardMetaOf, type CardFacts } from './cardMeta'

const base: CardFacts = { lifeState: 'RUNNING' }

describe('cardMetaOf — what a kanban card says in its column', () => {
	it('needs you: the exact state (the 0.9 item carries no open decision)', () => {
		expect(cardMetaOf({ ...base, lifeState: 'WAITING_PERSON' })).toEqual({ kind: 'state', lifeState: 'WAITING_PERSON' })
	})

	it('waiting: the quota time, else the exact state', () => {
		expect(cardMetaOf({ ...base, lifeState: 'WAITING_PROVIDER', waitingForProviderUntil: 'p' })).toEqual({ kind: 'backAt', at: 'p' })
		expect(cardMetaOf({ ...base, lifeState: 'WAITING_PROVIDER' })).toEqual({ kind: 'state', lifeState: 'WAITING_PROVIDER' })
	})

	it('stalled: paused first, else the exact state', () => {
		expect(cardMetaOf({ ...base, lifeState: 'PAUSED' })).toEqual({ kind: 'paused' })
		expect(cardMetaOf({ ...base, lifeState: 'STALLED', paused: true })).toEqual({ kind: 'paused' })
		expect(cardMetaOf({ ...base, lifeState: 'REMINDED' })).toEqual({ kind: 'state', lifeState: 'REMINDED' })
		expect(cardMetaOf({ ...base, lifeState: 'STALLED' })).toEqual({ kind: 'state', lifeState: 'STALLED' })
	})

	it('queued, working and done say nothing more', () => {
		expect(cardMetaOf(base)).toEqual({ kind: 'none' })
		expect(cardMetaOf({ ...base, lifeState: 'QUEUED' })).toEqual({ kind: 'none' })
		expect(cardMetaOf({ ...base, lifeState: 'DONE' })).toEqual({ kind: 'none' })
	})
})
