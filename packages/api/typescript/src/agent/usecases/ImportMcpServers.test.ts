import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { BaseError } from '@codm/core-typescript'
import { McpApprovalPolicy, McpTransport } from '@codm/contracts-typescript/wire/enums'
import { McpServer } from '../entities/McpServer'
import { McpServerRepository } from '../repositories/McpServerRepository'
import { ImportMcpServers } from './ImportMcpServers'

const OWNER = '019e4d24-6524-7041-9e1c-8108180cddae'

describe('ImportMcpServers', () => {
	let testContainer: DependencyContainer
	let testBed: TestBed

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OWNER })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const subject = (): ImportMcpServers => testBed.resolve(ImportMcpServers)
	const repo = (): McpServerRepository => testBed.resolve(McpServerRepository)

	it('registra vários numa chamada só', async () => {
		const { imported } = await subject().execute({
			ownerId: OWNER,
			entries: [
				{ key: 'playwright', transport: McpTransport.STDIO, command: 'npx', args: ['-y', '@playwright/mcp'] },
				{ key: 'github', transport: McpTransport.HTTP, url: 'https://api.github.com/mcp' },
			],
		})

		expect(imported.map(i => i.key)).toEqual(['playwright', 'github'])
		expect(await repo().listByOwner(OWNER)).toHaveLength(2)
	})

	/**
	 * O CONTRATO DESTA OPERAÇÃO É "TRAGA A FORMA, NÃO O SEGREDO".
	 *
	 * O nome da variável sobrevive; o valor entra VAZIO, e é o vazio que faz o `hasBlankSecret` do
	 * formulário bloquear o salvar até o dono preencher. Reaproveitar aquele mecanismo em vez de
	 * inventar um segundo é o ponto: importado e reconfigurado chegam ao dono no mesmo estado.
	 */
	it('o nome da variável sobrevive, o VALOR entra vazio', async () => {
		await subject().execute({
			ownerId: OWNER,
			entries: [{ key: 'comsegredo', transport: McpTransport.STDIO, command: 'node', envKeys: ['GITHUB_TOKEN', 'REGION'] }],
		})

		const saved = await repo().findByKey(OWNER, 'comsegredo')
		expect(saved?.env).toEqual({ GITHUB_TOKEN: '', REGION: '' })
	})

	it('headers de um HTTP seguem a mesma regra', async () => {
		await subject().execute({
			ownerId: OWNER,
			entries: [{ key: 'httpsecret', transport: McpTransport.HTTP, url: 'https://x.dev/mcp', headerKeys: ['Authorization'] }],
		})

		expect((await repo().findByKey(OWNER, 'httpsecret'))?.headers).toEqual({ Authorization: '' })
	})

	/**
	 * `undefined`, não `{}`. Um record vazio gravado é diferente de "este servidor não tem env": a tela
	 * mostraria uma seção de variáveis sem variável nenhuma.
	 */
	it('sem nome nenhum, não grava um record vazio', async () => {
		await subject().execute({ ownerId: OWNER, entries: [{ key: 'semsegredo', transport: McpTransport.STDIO, command: 'node' }] })

		expect((await repo().findByKey(OWNER, 'semsegredo'))?.env).toBeUndefined()
	})

	it('a política escolhida vale para todos os importados', async () => {
		await subject().execute({
			ownerId: OWNER,
			entries: [
				{ key: 'a', transport: McpTransport.STDIO, command: 'node' },
				{ key: 'b', transport: McpTransport.STDIO, command: 'node' },
			],
			approvalPolicy: McpApprovalPolicy.AUTO,
		})

		expect((await repo().findByKey(OWNER, 'a'))?.approvalPolicy).toBe(McpApprovalPolicy.AUTO)
		expect((await repo().findByKey(OWNER, 'b'))?.approvalPolicy).toBe(McpApprovalPolicy.AUTO)
	})

	/**
	 * TUDO OU NADA, e o teste conta LINHAS em vez de confiar na ausência de exceção.
	 *
	 * Importar 3 de 4 deixaria o dono com um estado que ele não pediu e não consegue nomear. A lista de
	 * rejeições da prévia existe justamente para dizer com ANTECEDÊNCIA o que não vai entrar; uma falha
	 * aqui é surpresa, e surpresa não se resolve pela metade.
	 */
	it('colisão no meio da lista não deixa NADA para trás', async () => {
		await repo().save(McpServer.create({ ownerId: OWNER, key: 'jatem', transport: McpTransport.STDIO, command: 'npx' }))

		const attempt = subject().execute({
			ownerId: OWNER,
			entries: [
				{ key: 'primeiro', transport: McpTransport.STDIO, command: 'node' },
				{ key: 'jatem', transport: McpTransport.STDIO, command: 'node' },
				{ key: 'terceiro', transport: McpTransport.STDIO, command: 'node' },
			],
		})

		await expect(attempt).rejects.toBeInstanceOf(BaseError)
		// A CONTAGEM é a medição: só o servidor que já existia sobrou. Nem `primeiro` nem `terceiro`
		// entraram, e é isso que "tudo ou nada" significa.
		const remaining = await repo().listByOwner(OWNER)
		expect(remaining.map(s => s.key)).toEqual(['jatem'])
	})
})
