import { describe, expect, it } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { STATUS_TONES, StatusPill, statusDotVariants, statusPillVariants } from './status-pill'

/**
 * STATUS PILL — o tom É o estado, e o ponto viaja com ele.
 *
 * Cada um dos seis tons precisa pintar um ponto próprio (o ponto é o que distingue "na fila" de
 * "esperando" num relance) e os dois tons de destaque têm superfície própria: `needsYou` é a pílula
 * escura (o mesmo preto do cartão de decisão), `stalled` a superfície de atenção. Afirmar a string de
 * classe é deliberado (happy-dom não avalia Tailwind — mesmo raciocínio de `badge.test.tsx`).
 */

describe('StatusPill — tons', () => {
	it('todo tom tem um ponto com cor', () => {
		for (const tone of STATUS_TONES) {
			expect(statusDotVariants({ tone }), `ponto de ${tone}`).toMatch(/\bbg-\S+/)
		}
	})

	it('os pontos dos seis tons são distintos', () => {
		const dots = STATUS_TONES.map(tone => statusDotVariants({ tone }))
		expect(new Set(dots).size).toBe(STATUS_TONES.length)
	})

	it('needsYou é a pílula escura com ponto verde-vivo', () => {
		expect(statusPillVariants({ tone: 'needsYou' })).toContain('bg-foreground')
		expect(statusPillVariants({ tone: 'needsYou' })).toContain('text-background')
		expect(statusDotVariants({ tone: 'needsYou' })).toContain('bg-success-bright')
	})

	it('stalled usa a superfície de atenção', () => {
		expect(statusPillVariants({ tone: 'stalled' })).toContain('bg-attention-surface')
		expect(statusPillVariants({ tone: 'stalled' })).toContain('text-attention-foreground')
	})

	it('o ponto é decorativo e o rótulo vem do chamador', () => {
		const html = renderToStaticMarkup(
			<StatusPill tone="working" className="extra">
				Fazendo
			</StatusPill>,
		)
		expect(html).toContain('data-slot="status-pill"')
		expect(html).toContain('aria-hidden="true"')
		expect(html).toContain('Fazendo')
		expect(html).toContain('extra')
	})
})
