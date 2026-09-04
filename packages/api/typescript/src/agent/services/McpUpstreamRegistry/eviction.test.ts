// packages/api/typescript/src/agent/services/McpUpstreamRegistry/eviction.test.ts — arquivo final COMPLETO
import 'reflect-metadata'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
 * OS TRÊS DEFEITOS DO §2 DA REVISÃO DO PR-56 — todos no mesmo arquivo, todos no mesmo mecanismo de
 * cache do `DefaultMcpUpstreamRegistry`.
 *
 * (1) O cache de conexão nunca é invalidado: `UpdateMcpServer`/`RemoveMcpServer` não falam com o
 *     registry, então editar `command`/`env` continua servindo o processo VELHO até o daemon
 *     reiniciar — sem erro em lugar nenhum. `evict` é a porta que falta.
 * (2) Duas chamadas paralelas contra o mesmo servidor ainda-não-conectado (o caso COMUM de uso
 *     paralelo de ferramentas) fazem as duas entrarem em `connect`; a segunda sobrescreve o mapa e a
 *     primeira fica órfã — invisível ao `shutdown()`.
 * (3) `tools/list` do upstream roda a CADA `listTools`, mesmo quando nada mudou — o desenho prometia
 *     cache e a implementação não tinha nenhum.
 *
 * As três provas abaixo dirigem processos STDIO REAIS (o mesmo padrão de `teardown.test.ts` e
 * `unreachable.test.ts` ao lado) porque o que está sob teste é justamente COMO o registry lida com
 * spawn e conexão — um cliente mockado provaria só que o `Promise.all` não rejeita, nunca que apenas
 * UM processo de SO nasceu.
 */

const require = createRequire(import.meta.url)
const serverIndexUrl = pathToFileURL(require.resolve('@modelcontextprotocol/sdk/server/index.js')).href
const serverStdioUrl = pathToFileURL(require.resolve('@modelcontextprotocol/sdk/server/stdio.js')).href
const typesUrl = pathToFileURL(require.resolve('@modelcontextprotocol/sdk/types.js')).href

/**
 * Um servidor MCP stdio real que REGISTRA, em arquivos no disco, os dois fatos que estes testes
 * precisam observar de FORA do processo do registry: quantas vezes ele foi SPAWNADO (um `appendFileSync`
 * do próprio pid ao nascer) e quantas vezes seu handler de `tools/list` foi CHAMADO. Um contador em
 * memória do fixture não serviria — o fixture roda num processo filho separado.
 *
 * `SIGTERM` termina o processo de propósito (ao contrário do fixture de `teardown.test.ts`, que o
 * ignora para provar a escalada): aqui o que está sob teste é o `evict`, não a escalada graciosa, e
 * um processo que morre rápido no primeiro sinal mantém o teste rápido.
 */
function writeFixtureServer(dir: string, name: string, toolName: string, spawnLogFile: string, listCallsLogFile: string): string {
	const path = join(dir, `${name}.mjs`)
	writeFileSync(
		path,
		[
			`import { Server } from ${JSON.stringify(serverIndexUrl)}`,
			`import { StdioServerTransport } from ${JSON.stringify(serverStdioUrl)}`,
			`import { ListToolsRequestSchema } from ${JSON.stringify(typesUrl)}`,
			`import { appendFileSync } from 'node:fs'`,
			`appendFileSync(${JSON.stringify(spawnLogFile)}, process.pid + '\\n')`,
			`const server = new Server({ name: ${JSON.stringify(name)}, version: '0.0.0' }, { capabilities: { tools: {} } })`,
			`server.setRequestHandler(ListToolsRequestSchema, async () => {`,
			`  appendFileSync(${JSON.stringify(listCallsLogFile)}, '1\\n')`,
			`  return { tools: [{ name: ${JSON.stringify(toolName)}, inputSchema: { type: 'object' } }] }`,
			`})`,
			`process.on('SIGTERM', () => process.exit(0))`,
			`await server.connect(new StdioServerTransport())`,
		].join('\n'),
		'utf8',
	)
	return path
}

/** `process.kill(pid, 0)` sends no signal — it only probes whether the pid still resolves to a process. */
function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0)
		return true
	} catch {
		return false
	}
}

/** Polls for the pid's death against a generous deadline instead of a single fixed sleep — see the
 * identical helper in `teardown.test.ts` for why a deadline, not a sleep, is the right shape here. */
async function waitUntilDead(pid: number, timeoutMs = 10_000): Promise<boolean> {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		if (!isAlive(pid)) return true
		await new Promise(resolve => setTimeout(resolve, 50))
	}
	return !isAlive(pid)
}

/** Lê um log de `appendFileSync` de linha única por evento e devolve as linhas não vazias. */
function readLines(path: string): string[] {
	return readFileSync(path, 'utf8')
		.split('\n')
		.map(line => line.trim())
		.filter(Boolean)
}

const OWNER_ID = '019e4d24-6524-7041-9e1c-8108180cddae'

describe('DefaultMcpUpstreamRegistry — evict, connect concorrente e cache de tools/list (Task T8)', () => {
	let dir: string
	let repo: MockMcpServerRepository
	let registry: DefaultMcpUpstreamRegistry

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'mcp-eviction-'))
		repo = new MockMcpServerRepository()
		registry = new DefaultMcpUpstreamRegistry(repo, new MockLoggingService())
	})

	afterEach(async () => {
		await registry.shutdown()
		rmSync(dir, { recursive: true, force: true })
	})

	it('(1) evict derruba o processo antigo — editar um servidor não pode continuar servindo o processo velho', async () => {
		const spawnLog = join(dir, 'spawn-editavel.log')
		const listLog = join(dir, 'list-editavel.log')
		const scriptPath = writeFixtureServer(dir, 'editavel', 'tool_a', spawnLog, listLog)
		const server = McpServer.create({
			ownerId: OWNER_ID,
			key: 'editavel',
			transport: McpTransport.STDIO,
			command: process.execPath,
			args: [scriptPath],
		})
		await repo.save(server)

		await registry.listTools(OWNER_ID) // conecta de verdade, spawnando o processo do SO

		const pids = readLines(spawnLog).map(Number)
		expect(pids).toHaveLength(1)
		const pid = pids[0]!
		expect(isAlive(pid)).toBe(true)

		await registry.evict(OWNER_ID, 'editavel')

		expect(await waitUntilDead(pid)).toBe(true)
	}, 20_000)

	it('(2) duas chamadas paralelas contra o mesmo servidor ainda não conectado spawnam UM processo só', async () => {
		const spawnLog = join(dir, 'spawn-concorrente.log')
		const listLog = join(dir, 'list-concorrente.log')
		const scriptPath = writeFixtureServer(dir, 'concorrente', 'tool_b', spawnLog, listLog)
		const server = McpServer.create({
			ownerId: OWNER_ID,
			key: 'concorrente',
			transport: McpTransport.STDIO,
			command: process.execPath,
			args: [scriptPath],
		})
		await repo.save(server)

		// Uso paralelo de ferramentas é o caso COMUM, não o exótico — duas chamadas concorrentes contra
		// um servidor que ainda não tem conexão viva devem compartilhar UM spawn, não dois.
		await Promise.all([registry.listTools(OWNER_ID), registry.listTools(OWNER_ID)])

		expect(readLines(spawnLog)).toHaveLength(1)
	}, 20_000)

	it('(3) listTools não re-consulta o upstream a cada chamada — usa o cache até um evict', async () => {
		const spawnLog = join(dir, 'spawn-cacheavel.log')
		const listLog = join(dir, 'list-cacheavel.log')
		const scriptPath = writeFixtureServer(dir, 'cacheavel', 'tool_c', spawnLog, listLog)
		const server = McpServer.create({
			ownerId: OWNER_ID,
			key: 'cacheavel',
			transport: McpTransport.STDIO,
			command: process.execPath,
			args: [scriptPath],
		})
		await repo.save(server)

		await registry.listTools(OWNER_ID)
		await registry.listTools(OWNER_ID)

		// UM spawn (a conexão já era cacheada antes deste task) e UMA consulta de tools/list — a
		// segunda chamada de listTools() tem de vir do cache, não de um novo round-trip ao upstream.
		expect(readLines(spawnLog)).toHaveLength(1)
		expect(readLines(listLog)).toHaveLength(1)
	}, 20_000)
})
