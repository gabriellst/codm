import { describe, expect, it } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { AskCard, AskCardOption, askCardOptionVariants } from './ask-card'

/**
 * ASK CARD — `locked` TRAVA de verdade.
 *
 * Quem não pode liberar a decisão vê o cartão, mas não pode responder. Escurecer o botão não basta
 * (ele continuaria clicável por teclado e por leitor de tela): a trava tem que virar `disabled` real
 * em toda opção, vinda do cartão — o chamador não precisa lembrar de repassar a trava a cada botão.
 */

const card = (locked: boolean) =>
	renderToStaticMarkup(
		<AskCard code="APP-12 · D1" kind="Decisão" question="Publico agora?" locked={locked}>
			<AskCardOption variant="primary">Publicar agora</AskCardOption>
			<AskCardOption variant="outline">Esperar</AskCardOption>
		</AskCard>,
	)

describe('AskCard — trava', () => {
	it('destravado: opções são botões habilitados de type="button"', () => {
		const html = card(false)
		expect(html.match(/<button/g)?.length).toBe(2)
		expect(html.match(/type="button"/g)?.length).toBe(2)
		expect(html).not.toContain('disabled=""')
		expect(html).not.toContain('data-locked')
	})

	it('travado: toda opção sai disabled e o cartão expõe data-locked', () => {
		const html = card(true)
		expect(html.match(/disabled=""/g)?.length).toBe(2)
		expect(html).toContain('data-locked')
	})

	it('uma opção solta pode ser desabilitada sozinha', () => {
		const html = renderToStaticMarkup(<AskCardOption disabled>Publicar</AskCardOption>)
		expect(html).toContain('disabled=""')
	})
})

describe('AskCardOption — variantes no cartão escuro', () => {
	it('primária é o verde cheio', () => {
		expect(askCardOptionVariants({ variant: 'primary' })).toContain('bg-primary')
	})

	it('contorno é o contorno claro sobre o escuro, texto claro', () => {
		const classes = askCardOptionVariants({ variant: 'outline' })
		expect(classes).toContain('border-background/20')
		expect(classes).toContain('text-background')
	})
})
