import { afterEach, describe, expect, it } from 'bun:test'
import { byEnvironment, getBoundedContextEnvironment, setBoundedContextEnvironment } from './BoundedContext'

/**
 * A COSTURA DA SPEC (Decision 6) E SEUS DOIS FALSEADORES.
 *
 * O boot de produção era `registry.real` hardcoded; agora é uma SELEÇÃO com default `real` — o
 * caller de produção não muda uma linha e não pode ser mudado por env var ambiente (a seleção é
 * uma CHAMADA explícita, o oposto de configuração ambiente). `integration` é recusado sob
 * NODE_ENV=production: um servidor de produção com bindings em memória é o desastre silencioso
 * que este teste existe para tornar barulhento.
 */
describe('seleção de ambiente do BoundedContext', () => {
	const originalNodeEnv = process.env.NODE_ENV

	afterEach(() => {
		process.env.NODE_ENV = originalNodeEnv
		setBoundedContextEnvironment('real')
	})

	it('o default é real — produção não muda uma linha', () => {
		expect(getBoundedContextEnvironment()).toBe('real')
	})

	it('a seleção explícita de integration vale fora de produção', () => {
		process.env.NODE_ENV = 'test'
		setBoundedContextEnvironment('integration')
		expect(getBoundedContextEnvironment()).toBe('integration')
	})

	it('FALSEADOR: integration sob NODE_ENV=production é recusado, alto', () => {
		process.env.NODE_ENV = 'production'
		expect(() => setBoundedContextEnvironment('integration')).toThrow(/production/)
		expect(getBoundedContextEnvironment()).toBe('real')
	})

	it('e2e é selecionável e lida de volta', () => {
		setBoundedContextEnvironment('e2e')
		expect(getBoundedContextEnvironment()).toBe('e2e')
	})

	it('FALSEADOR: e2e sob NODE_ENV=production é recusado, alto', () => {
		process.env.NODE_ENV = 'production'
		expect(() => setBoundedContextEnvironment('e2e')).toThrow(/production/)
		expect(getBoundedContextEnvironment()).toBe('real')
	})

	it('byEnvironment devolve a coluna do ambiente selecionado, com default', () => {
		setBoundedContextEnvironment('e2e')
		expect(byEnvironment({ default: 'a', e2e: 'b' })).toBe('b')
		setBoundedContextEnvironment('real')
		expect(byEnvironment({ default: 'a', e2e: 'b' })).toBe('a')
	})
})
