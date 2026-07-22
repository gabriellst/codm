import { describe, it, expect } from 'bun:test'
import { BaseError } from '@codedm/core-typescript'
import { BlockType } from '@codedm/contracts-typescript/wire/enums'
import { Page } from './Page'

const WORKSPACE = '11111111-1111-4111-8111-111111111111'

function makePage() {
	return Page.create({ workspaceId: WORKSPACE, parentPageId: null, title: 'Test Page' })
}

describe('Page', () => {
	it('create → blocks is empty', () => {
		const page = makePage()
		expect(page.blocks).toHaveLength(0)
	})

	it('add a TEXT block at root → one root block, type TEXT, id returned', () => {
		const page = makePage()
		const id = page.addBlock({ type: BlockType.TEXT, content: 'Hello', parentBlockId: null })
		expect(page.blocks).toHaveLength(1)
		expect(page.blocks[0]!.type).toBe(BlockType.TEXT)
		expect(page.blocks[0]!.id).toBe(id)
	})

	it('add TOGGLE at root then TEXT under the toggle → toggle has 1 child whose id matches', () => {
		const page = makePage()
		const toggleId = page.addBlock({ type: BlockType.TOGGLE, content: 'Toggle', parentBlockId: null })
		const childId = page.addBlock({ type: BlockType.TEXT, content: 'Child', parentBlockId: toggleId })
		expect(page.blocks).toHaveLength(1)
		const toggle = page.blocks[0]!
		expect(toggle.children).toHaveLength(1)
		expect(toggle.children[0]!.id).toBe(childId)
	})

	it('add under a TEXT block → throws BLOCK_PARENT_NOT_CONTAINER', () => {
		const page = makePage()
		const textId = page.addBlock({ type: BlockType.TEXT, content: 'Text', parentBlockId: null })
		expect(() => page.addBlock({ type: BlockType.TEXT, content: 'Child', parentBlockId: textId })).toThrow(BaseError)
		try {
			page.addBlock({ type: BlockType.TEXT, content: 'Child', parentBlockId: textId })
		} catch (err) {
			expect(err).toBeInstanceOf(BaseError)
			expect((err as BaseError).name).toBe('BLOCK_PARENT_NOT_CONTAINER')
		}
	})

	it('add under an unknown parentBlockId → throws BLOCK_NOT_FOUND', () => {
		const page = makePage()
		expect(() => page.addBlock({ type: BlockType.TEXT, content: 'Child', parentBlockId: 'nonexistent-id' })).toThrow(BaseError)
		try {
			page.addBlock({ type: BlockType.TEXT, content: 'Child', parentBlockId: 'nonexistent-id' })
		} catch (err) {
			expect(err).toBeInstanceOf(BaseError)
			expect((err as BaseError).name).toBe('BLOCK_NOT_FOUND')
		}
	})

	it('editBlock existing → content updated', () => {
		const page = makePage()
		const id = page.addBlock({ type: BlockType.TEXT, content: 'Original', parentBlockId: null })
		page.editBlock({ blockId: id, content: 'Updated' })
		expect(page.blocks[0]!.content).toBe('Updated')
	})

	it('editBlock unknown id → throws BLOCK_NOT_FOUND', () => {
		const page = makePage()
		expect(() => page.editBlock({ blockId: 'no-such-id', content: 'x' })).toThrow(BaseError)
		try {
			page.editBlock({ blockId: 'no-such-id', content: 'x' })
		} catch (err) {
			expect(err).toBeInstanceOf(BaseError)
			expect((err as BaseError).name).toBe('BLOCK_NOT_FOUND')
		}
	})
})
