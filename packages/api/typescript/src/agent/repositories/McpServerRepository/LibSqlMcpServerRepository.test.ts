import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { McpTransport } from '@codm/contracts-typescript/wire/enums'
import { McpServer } from '../../entities/McpServer'
import { McpServerRepository } from './McpServerRepository'

describe('LibSqlMcpServerRepository', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let repo: McpServerRepository
	const ownerId = '019e4d24-6524-7041-9e1c-8108180cdd01'

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId })
		repo = testBed.resolve(McpServerRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('salva e reidrata um servidor STDIO com args e env', async () => {
		const server = McpServer.create({
			ownerId,
			key: 'playwright',
			transport: McpTransport.STDIO,
			command: 'npx',
			args: ['-y', '@playwright/mcp'],
			env: { TOKEN: 'abc' },
		})
		await repo.save(server)

		const loaded = await repo.findByKey(ownerId, 'playwright')
		expect(loaded?.command).toBe('npx')
		expect(loaded?.args).toEqual(['-y', '@playwright/mcp'])
		expect(loaded?.env).toEqual({ TOKEN: 'abc' })
	})

	it('lista só os habilitados quando pedido', async () => {
		const on = McpServer.create({ ownerId, key: 'on', transport: McpTransport.STDIO, command: 'a' })
		const off = McpServer.create({ ownerId, key: 'off', transport: McpTransport.STDIO, command: 'b' })
		off.disable()
		await repo.save(on)
		await repo.save(off)

		expect((await repo.listByOwner(ownerId)).length).toBe(2)
		expect((await repo.listEnabledByOwner(ownerId)).map(s => s.key)).toEqual(['on'])
	})

	it('o banco recusa a segunda key igual, mesmo que a checagem em memória passe', async () => {
		await repo.save(McpServer.create({ ownerId, key: 'dup', transport: McpTransport.STDIO, command: 'a' }))
		const twin = McpServer.create({ ownerId, key: 'dup', transport: McpTransport.STDIO, command: 'b' })
		await expect(repo.save(twin)).rejects.toThrow()
	})
})
