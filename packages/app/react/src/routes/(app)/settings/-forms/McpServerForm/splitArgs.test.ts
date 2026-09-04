import { describe, expect, it } from 'bun:test'
import { splitArgs } from './index'

/**
 * O QUE O DONO DIGITA NA CAIXA DE ARGUMENTOS — e por que separar por espaço não serve.
 *
 * A caixa recebe a linha inteira, como ele a escreveria num terminal. Separar por espaço estava
 * certo enquanto os exemplos fossem `-y @pacote/mcp`; o caso motivador do recurso não é esse.
 * O browser-use recebe `--profile "My Profile"`, e três argumentos no lugar de dois fazem o
 * servidor subir com configuração errada e falhar de um jeito que não aponta para o formulário.
 *
 * Não é um shell: sem expansão de variável, sem glob, sem pipe. É só a regra de aspas, que é a
 * única que a caixa precisa entender para não mentir sobre o que o dono escreveu.
 */
describe('splitArgs', () => {
	it('separa por espaço, como antes', () => {
		expect(splitArgs('-y @agent/browser-use-mcp')).toEqual(['-y', '@agent/browser-use-mcp'])
	})

	it('mantém junto o que está entre aspas — o caso do browser-use', () => {
		expect(splitArgs('--profile "My Profile" --headless')).toEqual(['--profile', 'My Profile', '--headless'])
	})

	it('aspas simples valem igual', () => {
		expect(splitArgs("--path 'C:/Program Files/app'")).toEqual(['--path', 'C:/Program Files/app'])
	})

	it('aspas ABERTAS e não fechadas não engolem o resto em silêncio', () => {
		// Devolver `['--profile', 'My Profile --headless']` seria adivinhar onde ele queria fechar.
		// `undefined` faz o campo reprovar na validação, e o dono vê que faltou fechar a aspa.
		expect(splitArgs('--profile "My Profile')).toBeUndefined()
	})

	it('linha vazia continua sendo ausência de argumentos, não lista vazia', () => {
		expect(splitArgs('   ')).toBeUndefined()
	})
})
