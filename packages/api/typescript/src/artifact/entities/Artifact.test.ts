import { describe, expect, it } from 'bun:test'
import { ArtifactKind } from '@codedm/contracts-typescript/wire/enums'
import { Artifact } from './Artifact'

const base = {
	ownerId: '00000000-0000-4000-8000-000000000001',
	threadId: '00000000-0000-4000-8000-0000000000aa',
	kind: ArtifactKind.IMAGE,
	name: 'screenshot.png',
	ref: '/tmp/screenshot.png',
	meta: '{}',
}

describe('Artifact entity', () => {
	it('constructs with a generated id and stamps recordedAt', () => {
		const a = Artifact.create(base)
		expect(a.id.value).toBeTruthy()
		expect(a.kind).toBe(ArtifactKind.IMAGE)
		expect(a.name).toBe('screenshot.png')
		expect(a.ref).toBe('/tmp/screenshot.png')
		expect(a.recordedAt).toBeInstanceOf(Date)
		expect(a.issueId).toBeUndefined()
	})

	it('carries the optional issueId when provided', () => {
		const issueId = '00000000-0000-4000-8000-0000000000bb'
		const a = Artifact.create({ ...base, issueId })
		expect(a.issueId).toBe(issueId)
	})

	it('rejects a blank name', () => {
		expect(() => Artifact.create({ ...base, name: '   ' })).toThrow()
	})

	it('rejects a blank ref', () => {
		expect(() => Artifact.create({ ...base, ref: '' })).toThrow()
	})

	it('accepts every ArtifactKind', () => {
		for (const kind of Object.values(ArtifactKind)) {
			expect(() => Artifact.create({ ...base, kind })).not.toThrow()
		}
	})
})
