import { describe, expect, it } from 'bun:test'
import { BaseError } from '@codm/core-typescript'
import { WorkspaceBadge } from '@codm/contracts-typescript/wire/enums'
import { Workspace } from './Workspace'

const ownerId = '00000000-0000-4000-8000-000000000001'

describe('Workspace entity', () => {
	it('creates with a path and detected badges', () => {
		const w = Workspace.create({ ownerId, path: '/Users/dev/acme', badges: [WorkspaceBadge.GIT, WorkspaceBadge.CLAUDE_PROJECT] })
		expect(w.path).toBe('/Users/dev/acme')
		expect(w.badges).toEqual([WorkspaceBadge.GIT, WorkspaceBadge.CLAUDE_PROJECT])
		expect(w.ownerId).toBe(ownerId)
		expect(w.id.value).toBeDefined()
	})

	it('allows a folder with no detected badges', () => {
		const w = Workspace.create({ ownerId, path: '/tmp/plain', badges: [] })
		expect(w.badges).toEqual([])
	})

	it('rejects an empty path (schema invariant)', () => {
		expect(() => Workspace.create({ ownerId, path: '   ', badges: [] })).toThrow(BaseError)
	})
})
