import { describe, expect, it } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { KanbanColumn, KanbanColumnHeader, kanbanColumnCountVariants, kanbanColumnHeaderVariants } from './kanban'
import { STATUS_TONES, statusDotVariants } from './status-pill'

/**
 * KANBAN — a coluna compõe o `BoardColumn` existente e o cabeçalho usa o MESMO ponto da pílula.
 *
 * O ponto da coluna e o ponto da pílula de status dizem a mesma coisa em dois lugares da tela; se
 * cada um tivesse seu mapa, eles divergiriam no primeiro ajuste de cor. `emphasis` é a faixa escura
 * da coluna "precisa de você", com a contagem no cinza sobre escuro.
 */

describe('KanbanColumnHeader', () => {
	it('o ponto de cada tom é o mesmo da StatusPill', () => {
		for (const tone of STATUS_TONES) {
			const html = renderToStaticMarkup(<KanbanColumnHeader tone={tone} title="Coluna" count={1} />)
			expect(html, `ponto de ${tone}`).toContain(statusDotVariants({ tone }))
		}
	})

	it('emphasis é a faixa escura com contagem clara', () => {
		expect(kanbanColumnHeaderVariants({ emphasis: true })).toContain('bg-foreground')
		expect(kanbanColumnHeaderVariants({ emphasis: false })).not.toContain('bg-foreground')
		expect(kanbanColumnCountVariants({ emphasis: true })).toContain('text-background/60')
		expect(kanbanColumnCountVariants({ emphasis: false })).toContain('text-caption-foreground')
	})

	it('título e contagem vêm por prop', () => {
		const html = renderToStaticMarkup(<KanbanColumnHeader tone="working" title="Fazendo" count={3} />)
		expect(html).toContain('Fazendo')
		expect(html).toContain('>3<')
	})
})

describe('KanbanColumn', () => {
	it('é um BoardColumn com fundo --card e slot próprio', () => {
		const html = renderToStaticMarkup(<KanbanColumn />)
		expect(html.startsWith('<section')).toBe(true)
		expect(html).toContain('data-slot="kanban-column"')
		expect(html).toContain('bg-card')
		expect(html).not.toContain('bg-muted/40')
	})
})
