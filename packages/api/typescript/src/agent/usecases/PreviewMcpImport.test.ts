import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { McpConfigSource, McpImportRejection, McpTransport } from '@codm/contracts-typescript/wire/enums'
import { McpServer } from '../entities/McpServer'
import { McpServerRepository } from '../repositories/McpServerRepository'
import { MockMcpConfigDiscovery } from '../services/McpConfigDiscovery'
import { PreviewMcpImport, type McpImportCandidateDto, type McpImportSourceDto } from './PreviewMcpImport'

/**
 * A prévia junta três coisas que vivem em lugares diferentes — o que o disco tem (porta), o que o
 * documento diz (parser puro) e o que o dono JÁ registrou (repositório) — e a junção é o que este
 * teste mede. As duas primeiras já têm suíte própria; aqui interessa que elas se encontrem sem que
 * nenhuma apague a outra.
 */

const OWNER = '019e4d24-6524-7041-9e1c-8108180cddae'

describe('PreviewMcpImport', () => {
	let testContainer: DependencyContainer
	let testBed: TestBed
	let discovery: MockMcpConfigDiscovery
	/**
	 * O use case é CONSTRUÍDO À MÃO com o mock, em vez de resolvido pelo container.
	 *
	 * Não é atalho: o ciclo de vida do binding (singleton × transient) decidiria se este teste
	 * enxerga o que ele mesmo semeou, e essa é uma pergunta sobre o REGISTRO, não sobre a prévia. Um
	 * mock semeado por um lado e lido por outro dá lista vazia sem erro — medido aqui antes de trocar
	 * a abordagem. A resolução por container tem rail próprio (`real-di-resolution`); aqui interessa a
	 * composição descoberta + parser + repositório, e ela fica determinística e sem vazar entre casos.
	 */
	const subject = (): PreviewMcpImport => new PreviewMcpImport(discovery, testBed.resolve(McpServerRepository))

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OWNER })
	})
	beforeEach(async () => {
		await testBed.reset()
		discovery = new MockMcpConfigDiscovery()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('o documento COLADO vira uma fonte como qualquer outra, sem caminho de código próprio', async () => {
		const { sources } = await subject().execute({
			ownerId: OWNER,
			pasted: JSON.stringify({ mcpServers: { playwright: { command: 'npx', args: ['-y', '@playwright/mcp'] } } }),
		})

		expect(sources).toHaveLength(1)
		expect(sources[0]?.source).toBe(McpConfigSource.PASTE)
		expect(sources[0]?.candidates[0]).toMatchObject({ key: 'playwright', transport: McpTransport.STDIO, command: 'npx' })
		// Sem arquivo, sem `path` — o `PASTE` é a fonte que não tem de onde ter vindo.
		expect(sources[0]?.path).toBeUndefined()
	})

	/**
	 * AS FONTES SÃO INDEPENDENTES, e achatá-las destruiria a informação que o dono usa para decidir:
	 * "isto veio do MEU repositório" e "isto veio da config global da máquina" são confianças
	 * diferentes, mesmo quando o conteúdo é idêntico.
	 */
	it('cada fonte sai separada, com o caminho de onde veio', async () => {
		discovery.seed(
			{
				source: McpConfigSource.WORKSPACE_FILE,
				path: '/repo/.mcp.json',
				raw: JSON.stringify({ mcpServers: { 'do-repo': { command: 'node' } } }),
			},
			{
				source: McpConfigSource.CLAUDE_CODE,
				path: '/home/eu/.claude.json',
				raw: JSON.stringify({ projects: { '/repo': { mcpServers: { global: { command: 'npx' } } } } }),
			},
		)

		const { sources } = await subject().execute({ ownerId: OWNER, workspacePath: '/repo' })

		expect(sources.map((s: McpImportSourceDto) => s.source)).toEqual([McpConfigSource.WORKSPACE_FILE, McpConfigSource.CLAUDE_CODE])
		expect(sources[0]?.path).toBe('/repo/.mcp.json')
		expect(sources[0]?.candidates.map((c: McpImportCandidateDto) => c.key)).toEqual(['do-repo'])
		expect(sources[1]?.candidates.map((c: McpImportCandidateDto) => c.key)).toEqual(['global'])
	})

	/** "Já existe" é fato do REPOSITÓRIO, não do documento — por isso é resolvido aqui e passado ao parser. */
	it('o que o dono já registrou vira rejeição, não uma segunda cópia', async () => {
		await testBed
			.resolve(McpServerRepository)
			.save(McpServer.create({ ownerId: OWNER, key: 'existente', transport: McpTransport.STDIO, command: 'npx' }))

		const { sources } = await subject().execute({
			ownerId: OWNER,
			pasted: JSON.stringify({ mcpServers: { existente: { command: 'npx' }, novo: { command: 'node' } } }),
		})

		expect(sources[0]?.candidates.map((c: McpImportCandidateDto) => c.key)).toEqual(['novo'])
		expect(sources[0]?.rejections).toEqual([{ key: 'existente', reason: McpImportRejection.ALREADY_REGISTERED }])
	})

	it('sem nada colado e sem arquivo nenhum, a prévia é vazia — e vazia não é erro', async () => {
		const { sources } = await subject().execute({ ownerId: OWNER })

		expect(sources).toEqual([])
	})

	/**
	 * O CASO QUE PROVA QUE UMA FONTE RUIM NÃO APAGA AS BOAS. Um `~/.claude.json` corrompido é comum
	 * (edição manual, escrita interrompida) e não pode custar ao dono o import do repositório dele.
	 */
	it('uma fonte malformada é recusada SOZINHA — as outras seguem entregando candidatos', async () => {
		discovery.seed(
			{ source: McpConfigSource.CLAUDE_CODE, path: '/home/eu/.claude.json', raw: '{ quebrado' },
			{
				source: McpConfigSource.WORKSPACE_FILE,
				path: '/repo/.mcp.json',
				raw: JSON.stringify({ mcpServers: { bom: { command: 'node' } } }),
			},
		)

		const { sources } = await subject().execute({ ownerId: OWNER, workspacePath: '/repo' })

		const quebrada = sources.find((s: McpImportSourceDto) => s.source === McpConfigSource.CLAUDE_CODE)
		const boa = sources.find((s: McpImportSourceDto) => s.source === McpConfigSource.WORKSPACE_FILE)
		expect(quebrada?.rejections).toEqual([{ key: '', reason: McpImportRejection.MALFORMED }])
		expect(boa?.candidates.map((c: McpImportCandidateDto) => c.key)).toEqual(['bom'])
	})
})
