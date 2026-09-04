import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { McpApprovalPolicy, McpTransport } from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { McpServer } from '@agent/entities/McpServer'
import { McpServerRepository } from '@agent/repositories/McpServerRepository'
import { McpUpstreamRegistry, MockMcpUpstreamRegistry } from '@agent/services/McpUpstreamRegistry'
import pkg from '../../../package.json' with { type: 'json' }
import { GetSettings, resolveAppVersion } from './GetSettings'

/**
 * De onde vem o número que a linha "Sobre" mostra.
 *
 * A tela exibia `0.0.1` — a versão do package.json deste workspace — enquanto o app instalado era
 * `0.1.10`, porque versão é fato do BUNDLE e quem o conhece é o shell (que passa `CODM_APP_VERSION`
 * a cada sidecar). O fallback existe para o `bun dev`, onde não há bundle.
 *
 * O caso do VAZIO é o que quebrou o CI em 2026-08-07: a chave é declarada no registry com exemplo
 * vazio, todo `.env` gerado a define como `''`, e um `??` teria aceitado isso como versão válida —
 * publicando uma linha em branco. O falsificador é exato: troque `||` por `??` na implementação e
 * só este caso fica vermelho.
 */
describe('resolveAppVersion', () => {
	it('usa a versão que o shell injeta', () => {
		expect(resolveAppVersion({ CODM_APP_VERSION: '0.1.11' })).toBe('0.1.11')
	})

	it('cai no package.json quando ninguém injetou (bun dev)', () => {
		expect(resolveAppVersion({})).toBe(pkg.version)
	})

	it('trata vazio como ausente — o .env gerado define a chave em branco', () => {
		expect(resolveAppVersion({ CODM_APP_VERSION: '' })).toBe(pkg.version)
	})
})

/**
 * A tela de settings enxerga os servidores MCP cadastrados — e, tão importante quanto, NUNCA vê
 * `env`/`headers` (as variáveis e headers carregam token de API de terceiros; este DTO vira
 * `openapi.json` público mais SDK do cliente).
 */
describe('GetSettings — mcpServers', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	const ownerId = MOCK_CLOUD_OWNER_ID

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

	it('devolve os servidores MCP cadastrados, habilitados e desabilitados', async () => {
		const repo = testBed.resolve(McpServerRepository)
		const on = McpServer.create({ ownerId, key: 'playwright', transport: McpTransport.STDIO, command: 'npx' })
		const off = McpServer.create({ ownerId, key: 'shell', transport: McpTransport.STDIO, command: 'bash' })
		off.disable()
		await repo.save(on)
		await repo.save(off)

		const settings = await testBed.resolve(GetSettings).execute({ ownerId })

		expect(settings.mcpServers.map(s => s.key).sort()).toEqual(['playwright', 'shell'])
		expect(settings.mcpServers.find(s => s.key === 'shell')?.enabled).toBe(false)
		// O segredo NUNCA atravessa: env e headers não estão no DTO.
		expect(settings.mcpServers[0]).not.toHaveProperty('env')
		expect(settings.mcpServers[0]).not.toHaveProperty('headers')
	})

	/**
	 * Contract Lock final (T13): a leitura de settings carrega, por servidor, as ferramentas que ele
	 * publicou — com o override de política por ferramenta de volta na LEITURA, não só na escrita —
	 * mais um `reachable` que nunca deixa um upstream quebrado derrubar a tela inteira.
	 */
	it('devolve as ferramentas de cada servidor, com o override de política e reachable=true', async () => {
		const repo = testBed.resolve(McpServerRepository)
		const upstream = testBed.resolve(McpUpstreamRegistry) as MockMcpUpstreamRegistry

		const server = McpServer.create({ ownerId, key: 'playwright', transport: McpTransport.STDIO, command: 'npx' })
		server.setToolPolicy('click', McpApprovalPolicy.AUTO)
		await repo.save(server)

		upstream.tools = [
			{ serverKey: 'playwright', name: 'click', description: 'click an element', inputSchema: {}, approvalPolicy: McpApprovalPolicy.ASK },
			{ serverKey: 'playwright', name: 'navigate', description: 'go to a url', inputSchema: {}, approvalPolicy: McpApprovalPolicy.ASK },
		]

		const settings = await testBed.resolve(GetSettings).execute({ ownerId })

		const playwright = settings.mcpServers.find(s => s.key === 'playwright')
		expect(playwright?.reachable).toBe(true)
		expect(playwright?.tools.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
			{ name: 'click', policy: McpApprovalPolicy.AUTO },
			{ name: 'navigate', policy: null },
		])
	})

	/**
	 * A propriedade que torna a feature usável: um upstream quebrado NÃO derruba a tela. O servidor
	 * quebrado volta `tools: []` / `reachable: false`, e os SOBREVIVENTES continuam com suas próprias
	 * ferramentas — asserta os dois lados, nunca só o quebrado (isso passaria mesmo se a lista inteira
	 * tivesse colapsado).
	 */
	it('um upstream quebrado não derruba a tela — os outros servidores continuam com suas ferramentas', async () => {
		const repo = testBed.resolve(McpServerRepository)
		const upstream = testBed.resolve(McpUpstreamRegistry) as MockMcpUpstreamRegistry

		const broken = McpServer.create({ ownerId, key: 'broken', transport: McpTransport.STDIO, command: 'boom' })
		const healthy = McpServer.create({ ownerId, key: 'healthy', transport: McpTransport.STDIO, command: 'npx' })
		await repo.save(broken)
		await repo.save(healthy)

		// `safeListTools` engole a exceção do upstream quebrado e devolve lista vazia — o mock simula o
		// MESMO resultado observável: nenhuma entrada com `serverKey: 'broken'` no achatado.
		upstream.tools = [
			{ serverKey: 'healthy', name: 'run', description: 'run a command', inputSchema: {}, approvalPolicy: McpApprovalPolicy.ASK },
		]

		const settings = await testBed.resolve(GetSettings).execute({ ownerId })

		const brokenSummary = settings.mcpServers.find(s => s.key === 'broken')
		expect(brokenSummary?.reachable).toBe(false)
		expect(brokenSummary?.tools).toEqual([])

		const healthySummary = settings.mcpServers.find(s => s.key === 'healthy')
		expect(healthySummary?.reachable).toBe(true)
		expect(healthySummary?.tools).toEqual([{ name: 'run', policy: null }])
	})

	it('um servidor desabilitado volta tools: [] e reachable: false, mesmo se o upstream reportar ferramentas', async () => {
		const repo = testBed.resolve(McpServerRepository)
		const upstream = testBed.resolve(McpUpstreamRegistry) as MockMcpUpstreamRegistry

		const off = McpServer.create({ ownerId, key: 'disabled-server', transport: McpTransport.STDIO, command: 'npx' })
		off.disable()
		await repo.save(off)

		// Nunca deveria ter sido conectado — mesmo que o mock devolva algo sob essa key, o servidor
		// desabilitado precisa aparecer sem ferramentas na leitura.
		upstream.tools = [
			{ serverKey: 'disabled-server', name: 'ghost', description: undefined, inputSchema: {}, approvalPolicy: McpApprovalPolicy.ASK },
		]

		const settings = await testBed.resolve(GetSettings).execute({ ownerId })

		const disabled = settings.mcpServers.find(s => s.key === 'disabled-server')
		expect(disabled?.enabled).toBe(false)
		expect(disabled?.reachable).toBe(false)
		expect(disabled?.tools).toEqual([])
	})
})
