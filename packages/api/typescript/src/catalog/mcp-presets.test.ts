import { describe, expect, it } from 'bun:test'
import { McpTransport } from '@codm/contracts-typescript/wire/enums'
import { MCP_SERVER_KEY_PATTERN } from '../agent/entities/McpServer'
import { MCP_PRESETS, presetByKey } from './mcp-presets'

/**
 * RAIL DO CATÁLOGO DE PRESETS.
 *
 * Um preset é uma sugestão que vira cadastro com UM clique — então um preset inválido não falha na
 * revisão, falha na cara do dono, no meio de um formulário, com uma mensagem sobre um campo que ele
 * não digitou. Estes testes existem para que a linha inválida seja reprovada AQUI, na única vez em
 * que alguém edita a lista, e não N vezes em produção.
 */
describe('MCP_PRESETS — rail do catálogo', () => {
	/**
	 * A CHAVE SUGERIDA TEM DE SER ACEITÁVEL PELA ENTIDADE, e o padrão é lido de lá — nunca redigitado
	 * aqui. Duas cópias do mesmo regex divergem no primeiro que alguém mudar, e esta seria a pior
	 * divergência possível: entre o que o catálogo SUGERE e o que o cadastro ACEITA.
	 */
	it('toda chave sugerida passa no padrão que a entidade exige', () => {
		for (const preset of MCP_PRESETS) {
			expect(MCP_SERVER_KEY_PATTERN.test(preset.key), `preset "${preset.key}" tem chave inválida`).toBe(true)
		}
	})

	it('nenhuma chave repetida — duas sugestões com o mesmo nome colidiriam no cadastro', () => {
		const keys = MCP_PRESETS.map(preset => preset.key)

		expect(new Set(keys).size).toBe(keys.length)
	})

	/**
	 * NENHUM PRESET CARREGA VALOR DE SEGREDO. `envKeys` são NOMES; um valor aqui seria um segredo
	 * commitado num arquivo versionado. O teste varre o catálogo inteiro serializado, não campo a
	 * campo, justamente para pegar um valor que alguém acrescentasse num campo NOVO amanhã.
	 */
	it('o catálogo inteiro não contém nada que pareça um segredo', () => {
		const serialized = JSON.stringify(MCP_PRESETS)

		expect(serialized).not.toMatch(/sk-|ghp_|Bearer\s|secret|password/i)
	})

	it('todo preset STDIO tem comando — um preset sem comando não cadastra nada', () => {
		for (const preset of MCP_PRESETS.filter(p => p.transport === McpTransport.STDIO)) {
			expect(preset.command.length, `preset "${preset.key}" sem comando`).toBeGreaterThan(0)
		}
	})

	/**
	 * A CHAVE DE i18n É DECLARADA, e o catálogo NÃO carrega texto de UI. Se um dia alguém puser a frase
	 * em vez da chave, este teste reprova — e o rótulo teria escapado do sistema de tradução inteiro.
	 */
	it('a descrição é uma CHAVE de i18n, não a frase', () => {
		for (const preset of MCP_PRESETS) {
			expect(preset.descriptionKey, `preset "${preset.key}"`).toMatch(/^settings\.mcpServers\.presets\.[a-z-]+$/)
		}
	})

	it('presetByKey acha o que existe e não inventa o que não existe', () => {
		expect(presetByKey('playwright')?.command).toBe('npx')
		expect(presetByKey('nao-existe-neste-catalogo')).toBeUndefined()
	})

	/** Anti-vacuidade: um catálogo vazio faria TODOS os testes acima passarem varrendo o nada. */
	it('o catálogo não está vazio — sem isto, os testes acima passariam por vacuidade', () => {
		expect(MCP_PRESETS.length).toBeGreaterThan(0)
	})
})
