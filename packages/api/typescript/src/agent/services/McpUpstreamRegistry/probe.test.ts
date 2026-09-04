import 'reflect-metadata'
import { describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { McpTransport } from '@codm/contracts-typescript/wire/enums'
import { MockLoggingService } from '@codm/core-typescript'
import { MockMcpServerRepository } from '../../repositories/McpServerRepository'
import { DefaultMcpUpstreamRegistry } from './DefaultMcpUpstreamRegistry'

/**
 * A SONDA, contra processos REAIS — porque o que ela promete entregar é justamente o que só um
 * processo real produz: a mensagem de erro do sistema operacional.
 *
 * O valor desta operação inteira está no campo `error`. Um teste que mockasse a conexão provaria o
 * roteamento e não provaria a única coisa que o dono ganha: saber que o `npx` não está no PATH em vez
 * de ler "não alcançável".
 */

const require = createRequire(import.meta.url)
const serverIndexUrl = pathToFileURL(require.resolve('@modelcontextprotocol/sdk/server/index.js')).href
const serverStdioUrl = pathToFileURL(require.resolve('@modelcontextprotocol/sdk/server/stdio.js')).href
const typesUrl = pathToFileURL(require.resolve('@modelcontextprotocol/sdk/types.js')).href

/** Um servidor MCP stdio real e mínimo, que publica UMA ferramenta. */
function writeServer(dir: string): string {
	const path = join(dir, 'probe-server.mjs')
	writeFileSync(
		path,
		[
			`import { Server } from ${JSON.stringify(serverIndexUrl)}`,
			`import { StdioServerTransport } from ${JSON.stringify(serverStdioUrl)}`,
			// O SCHEMA REAL do SDK, não um parser inventado: `setRequestHandler` casa o handler pelo
			// `method` que o schema declara, então um objeto com `parse` improvisado nunca é escolhido.
			`import { ListToolsRequestSchema } from ${JSON.stringify(typesUrl)}`,
			`const server = new Server({ name: 'sonda', version: '0.0.0' }, { capabilities: { tools: {} } })`,
			`server.setRequestHandler(ListToolsRequestSchema, async () => ({`,
			`  tools: [{ name: 'ping', description: 'p', inputSchema: { type: 'object' } }],`,
			`}))`,
			`await server.connect(new StdioServerTransport())`,
		].join('\n'),
		'utf8',
	)
	return path
}

function registry(): DefaultMcpUpstreamRegistry {
	return new DefaultMcpUpstreamRegistry(new MockMcpServerRepository(), new MockLoggingService())
}

describe('DefaultMcpUpstreamRegistry.probe', () => {
	/**
	 * O CASO QUE JUSTIFICA A OPERAÇÃO EXISTIR: um comando que não existe.
	 *
	 * Hoje o dono salva, recarrega a tela e lê "não alcançável" — o mesmo texto que apareceria se o
	 * servidor tivesse subido e publicado zero ferramentas. Aqui ele recebe a mensagem do SO.
	 */
	it('um comando inexistente volta com ok=false E o motivo, não só um booleano', async () => {
		const result = await registry().probe({
			key: 'inexistente',
			transport: McpTransport.STDIO,
			command: 'este-binario-nao-existe-em-lugar-nenhum-12345',
		})

		expect(result.ok).toBe(false)
		// Não assertamos a frase exata — ela é do SO e muda entre plataformas. Assertamos que ela EXISTE
		// e não é vazia, que é a diferença entre "não alcançável" e um diagnóstico.
		if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
	})

	it('STDIO sem comando é recusado antes de tentar spawnar coisa nenhuma', async () => {
		const result = await registry().probe({ key: 'semcmd', transport: McpTransport.STDIO })

		expect(result).toEqual({ ok: false, error: 'STDIO requer um comando' })
	})

	it('HTTP sem url, idem', async () => {
		expect(await registry().probe({ key: 'semurl', transport: McpTransport.HTTP })).toEqual({ ok: false, error: 'HTTP requer uma url' })
	})

	/**
	 * A SONDA NÃO PODE DEIXAR ESTADO ATRÁS. Um dono que testa cinco variações de comando acumularia
	 * cinco servidores fantasma se a sonda registrasse o que abre — por isso ela não escreve em
	 * `clients`/`transports`/`toolsCache`, e o `shutdown` seguinte não tem o que derrubar.
	 */
	it('nada fica registrado depois de sondar — nem cliente, nem cache', async () => {
		const subject = registry()
		await subject.probe({ key: 'efemera', transport: McpTransport.STDIO, command: 'este-binario-nao-existe-12345' })

		// `listTools` de um dono sem servidores habilitados: se a sonda tivesse cacheado algo sob esta
		// chave, ele apareceria aqui.
		expect(await subject.listTools('019e4d24-6524-7041-9e1c-8108180cddae')).toEqual([])
		await subject.shutdown()
	})

	it('um servidor real responde ok=true com as ferramentas que publicou', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'mcp-probe-'))
		try {
			const result = await registry().probe({
				key: 'real',
				transport: McpTransport.STDIO,
				command: process.execPath,
				args: [writeServer(dir)],
			})

			expect(result.ok).toBe(true)
			if (result.ok) expect(result.tools.map(t => t.name)).toContain('ping')
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	}, 30_000)
})
