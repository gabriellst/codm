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

	it('declares a publish command as an argument list, and removes it with null', () => {
		const w = Workspace.create({ ownerId, path: '/tmp/plain', badges: [] })
		expect(w.publishCommand).toBeUndefined()
		w.setPublishCommand({ argv: ['bun', 'run', 'deploy'] })
		expect(w.publishCommand).toEqual({ argv: ['bun', 'run', 'deploy'] })
		w.setPublishCommand(null)
		expect(w.publishCommand).toBeUndefined()
	})

	it('refuses an empty argument list (schema invariant)', () => {
		const w = Workspace.create({ ownerId, path: '/tmp/plain', badges: [] })
		expect(() => w.setPublishCommand({ argv: [] })).toThrow(BaseError)
	})
})
