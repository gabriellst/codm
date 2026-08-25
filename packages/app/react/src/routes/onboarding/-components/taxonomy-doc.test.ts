import { describe, expect, it } from 'bun:test'
import { STEP_IMPACTS, STEP_KINDS } from './steps'

/**
 * A TAXONOMIA DOCUMENTADA NÃO PODE ENVELHECER EM SILÊNCIO.
 *
 * `docs/FRONTEND.md` descreve os dois eixos (`kind` × `impact`) como conceito de arquitetura, não
 * como detalhe desta feature — é lá que quem for somar um passo vai ler antes de escrever código.
 * Um documento assim tem um modo de falha próprio: o código ganha um valor novo, ninguém lembra do
 * doc, e a próxima pessoa desenha contra uma tabela incompleta.
 *
 * Este teste amarra os dois. Ele NÃO julga a prosa — julga que todo valor que o código declara
 * aparece nela. Um `kind` ou `impact` novo fica vermelho aqui até ser documentado, que é
 * exatamente o momento em que documentar custa menos.
 */

const DOC = await Bun.file(new URL('../../../../../../../docs/FRONTEND.md', import.meta.url)).text()

describe('a taxonomia de passos está documentada', () => {
	it('a seção existe em docs/FRONTEND.md', () => {
		expect(DOC).toContain('## Onboarding Step Taxonomy')
	})

	it('todo valor de STEP_KINDS aparece na documentação', () => {
		const missing = STEP_KINDS.filter(kind => !DOC.includes(kind))
		expect(missing).toEqual([])
	})

	it('todo valor de STEP_IMPACTS aparece na documentação', () => {
		const missing = STEP_IMPACTS.filter(impact => !DOC.includes(impact))
		expect(missing).toEqual([])
	})

	/**
	 * A regra que o desenho inteiro protege: um fato do host é revogável, então nunca pode ser
	 * gravado como vencido. Se essa frase sumir do doc, sumiu a razão de `SystemPrecondition` ser
	 * uma espécie separada.
	 */
	it('a regra do fato revogável está registrada', () => {
		// A seção está em inglês, como o resto de docs/FRONTEND.md — "revocable", não "revogável".
		expect(DOC.toLowerCase()).toContain('revocable')
	})
})
