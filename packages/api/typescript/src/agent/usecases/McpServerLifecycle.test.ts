import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { McpApprovalPolicy, McpTransport } from '@codm/contracts-typescript/wire/enums'
import { McpServerRepository } from '../repositories/McpServerRepository'
import { RegisterMcpServer } from './RegisterMcpServer'
import { UpdateMcpServer } from './UpdateMcpServer'
import { RemoveMcpServer } from './RemoveMcpServer'

describe('ciclo de vida de um servidor MCP', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	const ownerId = '019e4d24-6524-7041-9e1c-8108180cdd01'
	const stdio = { transport: McpTransport.STDIO, command: 'npx', args: ['-y', '@playwright/mcp'] }

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('registra e devolve o id', async () => {
		const { mcpServerId } = await testBed.resolve(RegisterMcpServer).execute({ ownerId, key: 'playwright', ...stdio })
		const saved = await testBed.resolve(McpServerRepository).findById(mcpServerId)
		expect(saved?.key).toBe('playwright')
	})

	it('recusa key duplicada com MCP_SERVER_KEY_CONFLICT e não grava linha nova', async () => {
		const repo = testBed.resolve(McpServerRepository)
		await testBed.resolve(RegisterMcpServer).execute({ ownerId, key: 'dup', ...stdio })
		const before = (await repo.listByOwner(ownerId)).length

		await expect(testBed.resolve(RegisterMcpServer).execute({ ownerId, key: 'dup', ...stdio })).rejects.toMatchObject({
			name: 'MCP_SERVER_KEY_CONFLICT',
		})

		// A prova é a CONTAGEM de linhas, não a ausência de exceção.
		expect((await repo.listByOwner(ownerId)).length).toBe(before)
	})

	it('troca política e desabilita', async () => {
		const repo = testBed.resolve(McpServerRepository)
		const { mcpServerId } = await testBed.resolve(RegisterMcpServer).execute({ ownerId, key: 'shell', ...stdio })
		await testBed.resolve(UpdateMcpServer).execute({ ownerId, mcpServerId, enabled: false, approvalPolicy: McpApprovalPolicy.AUTO })

		const saved = await repo.findById(mcpServerId)
		expect(saved?.enabled).toBe(false)
		expect(saved?.approvalPolicy).toBe(McpApprovalPolicy.AUTO)
	})

	it('remove', async () => {
		const repo = testBed.resolve(McpServerRepository)
		const { mcpServerId } = await testBed.resolve(RegisterMcpServer).execute({ ownerId, key: 'gone', ...stdio })
		await testBed.resolve(RemoveMcpServer).execute({ ownerId, mcpServerId })
		expect(await repo.findById(mcpServerId)).toBeUndefined()
	})

	it('não deixa um dono mexer no servidor de outro', async () => {
		const { mcpServerId } = await testBed.resolve(RegisterMcpServer).execute({ ownerId, key: 'mine', ...stdio })
		const intruder = '019e4d24-6524-7041-9e1c-8108180cdd99'
		await expect(testBed.resolve(RemoveMcpServer).execute({ ownerId: intruder, mcpServerId })).rejects.toMatchObject({
			name: 'MCP_SERVER_NOT_FOUND',
		})
	})
})
