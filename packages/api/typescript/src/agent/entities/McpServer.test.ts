import { describe, it, expect } from 'bun:test'
import { McpTransport, McpApprovalPolicy } from '@codm/contracts-typescript/wire/enums'
import { McpServer } from './McpServer'

describe('McpServer', () => {
	const stdio = {
		ownerId: '019e4d24-6524-7041-9e1c-8108180cdd01',
		key: 'playwright',
		transport: McpTransport.STDIO,
		command: 'npx',
		args: ['-y', '@playwright/mcp'],
	}

	it('nasce ASK — o padrão é perguntar, não executar', () => {
		const server = McpServer.create(stdio)
		expect(server.approvalPolicy).toBe(McpApprovalPolicy.ASK)
		expect(server.enabled).toBe(true)
	})

	it('recusa STDIO sem command', () => {
		expect(() => McpServer.create({ ...stdio, command: undefined })).toThrow()
	})

	it('recusa HTTP sem url', () => {
		expect(() => McpServer.create({ ownerId: stdio.ownerId, key: 'notion', transport: McpTransport.HTTP })).toThrow()
	})

	it('recusa key que não serve de namespace de ferramenta', () => {
		expect(() => McpServer.create({ ...stdio, key: 'play wright' })).toThrow()
		expect(() => McpServer.create({ ...stdio, key: 'play__wright' })).toThrow()
	})

	it('liga, desliga e troca de política sem recriar', () => {
		const server = McpServer.create(stdio)
		server.disable()
		expect(server.enabled).toBe(false)
		server.enable()
		expect(server.enabled).toBe(true)
		server.setApprovalPolicy(McpApprovalPolicy.AUTO)
		expect(server.approvalPolicy).toBe(McpApprovalPolicy.AUTO)
	})
})
