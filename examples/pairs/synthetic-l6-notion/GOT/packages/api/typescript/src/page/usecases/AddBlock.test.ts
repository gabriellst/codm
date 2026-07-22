import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { BlockType } from '@template/contracts-typescript/wire/enums'
import { CreatePage } from './CreatePage'
import { AddBlock } from './AddBlock'
import { EditBlock } from './EditBlock'
import { PageRepository } from '../repositories/PageRepository'

const OWNER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

describe('AddBlock (integration)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let createPage: CreatePage
	let addBlock: AddBlock
	let editBlock: EditBlock
	let pages: PageRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OWNER_ID })
		createPage = testBed.resolve(CreatePage)
		addBlock = testBed.resolve(AddBlock)
		editBlock = testBed.resolve(EditBlock)
		pages = testBed.resolve(PageRepository)
	})

	beforeEach(async () => {
		await testBed.reset()
	})

	afterAll(async () => {
		await testBed.destroy()
	})

	it('AddBlock at root: persists a TEXT block and rehydrates it via findById', async () => {
		const workspaceId = crypto.randomUUID()

		const { pageId } = await createPage.execute({
			ownerId: OWNER_ID,
			workspaceId,
			parentPageId: null,
			title: 'Doc',
		})

		const { blockId } = await addBlock.execute({
			pageId,
			type: BlockType.TEXT,
			content: 'hello',
			parentBlockId: null,
		})

		const page = await pages.findById(pageId)
		expect(page).toBeDefined()
		expect(page!.blocks).toHaveLength(1)
		expect(page!.blocks[0]!.id).toBe(blockId)
		expect(page!.blocks[0]!.type).toBe(BlockType.TEXT)
		expect(page!.blocks[0]!.content).toBe('hello')
	})

	it('Nested AddBlock: persists a TEXT child under a TOGGLE and round-trips through adjacency list', async () => {
		const workspaceId = crypto.randomUUID()

		const { pageId } = await createPage.execute({
			ownerId: OWNER_ID,
			workspaceId,
			parentPageId: null,
			title: 'Nested',
		})

		const { blockId: toggleId } = await addBlock.execute({
			pageId,
			type: BlockType.TOGGLE,
			content: 'toggle',
			parentBlockId: null,
		})

		const { blockId: childId } = await addBlock.execute({
			pageId,
			type: BlockType.TEXT,
			content: 'child text',
			parentBlockId: toggleId,
		})

		const page = await pages.findById(pageId)
		expect(page).toBeDefined()
		expect(page!.blocks).toHaveLength(1)
		const toggle = page!.blocks[0]!
		expect(toggle.id).toBe(toggleId)
		expect(toggle.children).toHaveLength(1)
		expect(toggle.children[0]!.id).toBe(childId)
		expect(toggle.children[0]!.type).toBe(BlockType.TEXT)
	})

	it('EditBlock: updates the content of an existing block', async () => {
		const workspaceId = crypto.randomUUID()

		const { pageId } = await createPage.execute({
			ownerId: OWNER_ID,
			workspaceId,
			parentPageId: null,
			title: 'Edit me',
		})

		const { blockId } = await addBlock.execute({
			pageId,
			type: BlockType.HEADING,
			content: 'original',
			parentBlockId: null,
		})

		await editBlock.execute({ pageId, blockId, content: 'updated' })

		const page = await pages.findById(pageId)
		expect(page).toBeDefined()
		const block = page!.blocks.find(b => b.id === blockId)
		expect(block).toBeDefined()
		expect(block!.content).toBe('updated')
	})

	it('AddBlock on a missing page rejects with PAGE_NOT_FOUND', async () => {
		await expect(
			addBlock.execute({
				pageId: crypto.randomUUID(),
				type: BlockType.TEXT,
				content: 'x',
				parentBlockId: null,
			}),
		).rejects.toMatchObject({ name: 'PAGE_NOT_FOUND' })
	})
})
