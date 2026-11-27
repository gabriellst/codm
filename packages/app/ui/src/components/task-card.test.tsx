import { describe, expect, it } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { TaskCard, taskCardMetaVariants, taskCardTitleVariants, taskCardVariants } from './task-card'

/**
 * TASK CARD — a voz da meta, a seleção e o tamanho do título.
 *
 * Três vozes de meta (padrão cinza, forte para a decisão aberta, aviso para a escalada) — trocar uma
 * pela outra muda o que o operador lê primeiro no quadro. `selected` é a borda escura de 1.5 e NÃO
 * convive com o hover de linha (o cartão aberto não "acende" verde por cima da seleção).
 */

describe('TaskCard — variantes', () => {
	it('cada voz de meta tem sua cor', () => {
		expect(taskCardMetaVariants({ metaTone: 'default' })).toContain('text-caption-foreground')
		expect(taskCardMetaVariants({ metaTone: 'strong' })).toContain('text-foreground')
		expect(taskCardMetaVariants({ metaTone: 'strong' })).toContain('font-semibold')
		expect(taskCardMetaVariants({ metaTone: 'warn' })).toContain('text-attention-foreground')
	})

	it('selecionado é a borda escura e não acende no hover', () => {
		const on = taskCardVariants({ selected: true })
		const off = taskCardVariants({ selected: false })
		expect(on).toContain('border-foreground')
		expect(on).not.toContain('hover:border-primary')
		expect(off).toContain('border-border')
		expect(off).toContain('hover:border-primary')
	})

	it('o kanban usa o título menor', () => {
		expect(taskCardTitleVariants({ size: 'default' })).toContain('text-[15px]')
		expect(taskCardTitleVariants({ size: 'compact' })).toContain('text-sm')
	})
})

describe('TaskCard — render', () => {
	it('sem render é um div; com render vira o link', () => {
		const inert = renderToStaticMarkup(<TaskCard taskKey="APP-12" title="Cupom" />)
		const link = renderToStaticMarkup(<TaskCard taskKey="APP-12" title="Cupom" render={<a href="#APP-12" />} />)
		expect(inert.startsWith('<div')).toBe(true)
		expect(link.startsWith('<a')).toBe(true)
		expect(link).toContain('data-slot="task-card"')
	})

	it('sem meta não desenha a linha de meta', () => {
		const html = renderToStaticMarkup(<TaskCard taskKey="APP-12" title="Cupom" />)
		expect(html).not.toContain('task-card-meta')
	})
})
