import { describe, expect, it } from 'bun:test'
import { deriveKeyFromCommand } from './index'

/**
 * A CHAVE SUGERIDA A PARTIR DO COMANDO.
 *
 * Os casos abaixo são nomes REAIS do ecossistema, incluindo os três medidos no `~/.claude.json` desta
 * máquina em 04/09/2026 (`@supermemory/mcp`, `@playwright/mcp`, `@modelcontextprotocol/server-github`).
 * Uma derivação testada contra nomes inventados acertaria o formato e erraria a realidade.
 */
describe('deriveKeyFromCommand', () => {
	it('extrai o nome do pacote escopado — o caso comum do ecossistema', () => {
		expect(deriveKeyFromCommand('npx', '-y @playwright/mcp')).toBe('mcp')
		expect(deriveKeyFromCommand('npx', '-y @supermemory/mcp')).toBe('mcp')
	})

	/**
	 * O ÚLTIMO SEGMENTO, NÃO O PRIMEIRO. `@modelcontextprotocol/server-github` vira `server-github`
	 * porque o escopo é do PUBLICADOR: derivar dele daria `modelcontextprotocol` para TODOS os
	 * servidores oficiais, e três cadastros colidiriam na mesma chave.
	 */
	it('usa o basename, não o escopo — o escopo é do publicador e colidiria', () => {
		expect(deriveKeyFromCommand('npx', '-y @modelcontextprotocol/server-github')).toBe('server-github')
		expect(deriveKeyFromCommand('npx', '-y @modelcontextprotocol/server-filesystem')).toBe('server-filesystem')
	})

	it('pacote sem escopo funciona igual', () => {
		expect(deriveKeyFromCommand('npx', '-y mcp-server-fetch')).toBe('mcp-server-fetch')
	})

	/** Flags não nomeiam nada — `-y` nunca pode virar chave. */
	it('ignora flags', () => {
		expect(deriveKeyFromCommand('npx', '-y --silent @playwright/mcp')).toBe('mcp')
	})

	it('um script local vira o nome do arquivo, sem a extensão', () => {
		expect(deriveKeyFromCommand('node', '/home/eu/servidores/meu-mcp.js')).toBe('meu-mcp')
	})

	/**
	 * MAIÚSCULA E UNDERSCORE NÃO PASSAM NO PADRÃO — e em vez de recusar, a derivação NORMALIZA. É a
	 * diferença entre "não consigo sugerir" e "sugiro a forma válida do que você escreveu".
	 */
	it('normaliza para o padrão da chave em vez de desistir', () => {
		expect(deriveKeyFromCommand('node', 'My_Server.js')).toBe('my-server')
	})

	/**
	 * SUGESTÃO, NUNCA CHUTE. Um palpite errado preenche um campo que o dono talvez não releia — e a
	 * chave é PERMANENTE, porque vira o namespace pelo qual o agente chama a ferramenta.
	 */
	it('devolve undefined quando não há nada de onde extrair', () => {
		expect(deriveKeyFromCommand('', '')).toBeUndefined()
		expect(deriveKeyFromCommand('-', '--only --flags')).toBeUndefined()
	})

	/** Sem argumentos, o próprio comando serve — `node` sozinho não nomeia servidor, mas `uvx-algo` sim. */
	it('cai no comando quando não há argumento que sirva', () => {
		expect(deriveKeyFromCommand('meu-servidor-mcp', '')).toBe('meu-servidor-mcp')
	})

	/**
	 * O TESTE QUE PROVA QUE A SUGESTÃO É UTILIZÁVEL. Uma derivação que produzisse chave inválida seria
	 * pior que nenhuma: o dono clicaria em salvar e receberia erro num campo que ele não digitou.
	 */
	it('toda chave sugerida é aceita pelo padrão do contrato', () => {
		const comandos: [string, string][] = [
			['npx', '-y @playwright/mcp'],
			['npx', '-y @modelcontextprotocol/server-github'],
			['node', 'My_Server.js'],
			['meu-servidor-mcp', ''],
		]

		for (const [command, args] of comandos) {
			const derived = deriveKeyFromCommand(command, args)
			expect(derived, `${command} ${args}`).toMatch(/^[a-z][a-z0-9-]{0,31}$/)
		}
	})
})
