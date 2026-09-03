// packages/api/typescript/src/agent/services/McpUpstreamRegistry/unreachable.test.ts — arquivo final COMPLETO
import 'reflect-metadata'
import { beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { McpTransport } from '@codm/contracts-typescript/wire/enums'
import { MockLoggingService } from '@codm/core-typescript'
import { McpServer } from '../../entities/McpServer'
import { MockMcpServerRepository } from '../../repositories/McpServerRepository'
import { DefaultMcpUpstreamRegistry } from './DefaultMcpUpstreamRegistry'

/**
 * OS DOIS ACs QUE ESTAVAM SEM CAMINHO VERDE (auditoria de fechamento do recurso).
 *
 * **AC-15** — "um upstream que não conecta não derruba a porta: `tools/list` responde com as nossas
 * ferramentas e a falha fica visível no console". A primeira metade o `safeListTools` já cumpria; a
 * segunda NÃO — o `catch` era mudo, e o teste que existia (`GetSettings`) só observava a tela
 * devolvendo `reachable: false`, sem nada provando que a causa fica registrada em algum lugar. Um
 * servidor MCP quebrado numa máquina sem ninguém olhando é diagnosticado por log, depois do fato: um
 * `catch` mudo transforma "o agente rodou sem a ferramenta que o dono cadastrou" num mistério.
 *
 * **AC-14** — "um servidor desabilitado não aparece nem em `tools/list` nem na lista de ferramentas
 * permitidas entregue ao CLI". O filtro em si (`listEnabledByOwner`) tinha teste no repositório, e a
 * ponta de `--allowedTools` tinha o guard do T5 no `IssueWorkAgent` — mas só no sentido POSITIVO
 * (habilitado aparece). A metade negativa, que é a que protege o dono, não era exercida em lugar
 * nenhum: um `listEnabled` trocado por um `list` passaria por toda a suíte.
 *
 * Nenhum dos dois casos precisa de door nem de DI: o objeto sob teste é o registry, que é quem decide
 * quais servidores são consultados e o que acontece quando um deles não responde.
 */

const require = createRequire(import.meta.url)
const serverIndexUrl = pathToFileURL(require.resolve('@modelcontextprotocol/sdk/server/index.js')).href
const serverStdioUrl = pathToFileURL(require.resolve('@modelcontextprotocol/sdk/server/stdio.js')).href
const typesUrl = pathToFileURL(require.resolve('@modelcontextprotocol/sdk/types.js')).href

/**
 * Um servidor MCP stdio REAL e mínimo que publica UMA ferramenta e depois fica ocioso no stdin —
 * escrito no temp do SO (nunca no repo), como o fixture da suíte de teardown ao lado. Ele existe para
 * que o caso de isolamento tenha um vizinho SAUDÁVEL de verdade: um mock de cliente provaria que o
 * `Promise.all` não rejeita, mas não que uma conexão real sobreviveu ao vizinho quebrado.
 */
function writeFixtureServer(dir: string, name: string, toolName: string): string {
	const path = join(dir, `${name}.mjs`)
	writeFileSync(
		path,
		[
			`import { Server } from ${JSON.stringify(serverIndexUrl)}`,
			`import { StdioServerTransport } from ${JSON.stringify(serverStdioUrl)}`,
			`import { ListToolsRequestSchema } from ${JSON.stringify(typesUrl)}`,
			`const server = new Server({ name: ${JSON.stringify(name)}, version: '0.0.0' }, { capabilities: { tools: {} } })`,
			`server.setRequestHandler(ListToolsRequestSchema, async () => ({`,
			`  tools: [{ name: ${JSON.stringify(toolName)}, inputSchema: { type: 'object' } }],`,
			`}))`,
			`await server.connect(new StdioServerTransport())`,
		].join('\n'),
		'utf8',
	)
	return path
}

const OWNER_ID = '019e4d24-6524-7041-9e1c-8108180cddae'

describe('DefaultMcpUpstreamRegistry.listTools — o upstream inalcançável e o desabilitado', () => {
	let dir: string
	let repo: MockMcpServerRepository
	let logging: MockLoggingService
	let registry: DefaultMcpUpstreamRegistry

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'mcp-unreachable-'))
		repo = new MockMcpServerRepository()
		logging = new MockLoggingService()
		registry = new DefaultMcpUpstreamRegistry(repo, logging)
	})

	it('AC-15 — um STDIO que não sobe devolve lista vazia E deixa um warn nomeando o servidor', async () => {
		await repo.save(
			McpServer.create({
				ownerId: OWNER_ID,
				key: 'quebrado',
				transport: McpTransport.STDIO,
				// Um binário que não existe: o spawn falha, e é exatamente a forma de um dono digitando
				// errado o comando no formulário de settings.
				command: join(dir, 'nao-existe-em-lugar-nenhum'),
			}),
		)

		const tools = await registry.listTools(OWNER_ID)

		expect(tools).toEqual([])

		// A METADE DO AC QUE FALTAVA. Não basta "não explodiu": a causa tem de estar registrada, e pelo
		// `LoggingService` injetado — um `console.warn` cru aqui reprovaria no rail
		// `tests/architecture/console-discipline.test.ts` e nunca chegaria ao Loki com correlação.
		const warns = logging.getLogsByLevel('warn')
		expect(warns).toHaveLength(1)
		expect(warns[0]?.args.content).toMatchObject({ serverKey: 'quebrado', transport: McpTransport.STDIO })
	}, 20_000)

	it('AC-14 — um servidor DESABILITADO nunca é consultado, mesmo quando o comando funcionaria', async () => {
		const scriptPath = writeFixtureServer(dir, 'desligado', 'browser_navigate')
		const server = McpServer.create({
			ownerId: OWNER_ID,
			key: 'desligado',
			transport: McpTransport.STDIO,
			command: process.execPath,
			args: [scriptPath],
		})
		server.disable()
		await repo.save(server)

		const tools = await registry.listTools(OWNER_ID)

		// Vazio, e — o que distingue "filtrado" de "quebrado" — SEM warn: um servidor desligado não é
		// uma falha, é uma escolha do dono. Se `listEnabledByOwner` virasse um `list`, este teste
		// ficaria vermelho nas duas asserções ao mesmo tempo (a conexão subiria e publicaria a
		// ferramenta), que é a razão de as duas viverem no mesmo caso.
		expect(tools).toEqual([])
		expect(logging.getLogsByLevel('warn')).toHaveLength(0)
	}, 20_000)

	it('AC-15 — um upstream quebrado NÃO derruba os outros: as ferramentas do saudável continuam vindo', async () => {
		const scriptPath = writeFixtureServer(dir, 'saudavel', 'browser_navigate')
		await repo.save(
			McpServer.create({
				ownerId: OWNER_ID,
				key: 'saudavel',
				transport: McpTransport.STDIO,
				command: process.execPath,
				args: [scriptPath],
			}),
		)
		await repo.save(
			McpServer.create({
				ownerId: OWNER_ID,
				key: 'quebrado',
				transport: McpTransport.STDIO,
				command: join(dir, 'nao-existe-em-lugar-nenhum'),
			}),
		)

		const tools = await registry.listTools(OWNER_ID)

		expect(tools.map(tool => `${tool.serverKey}__${tool.name}`)).toEqual(['saudavel__browser_navigate'])
		expect(logging.getLogsByLevel('warn')).toHaveLength(1)

		await registry.shutdown()
	}, 20_000)
})
