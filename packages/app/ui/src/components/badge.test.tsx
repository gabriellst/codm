import { describe, expect, it } from 'bun:test'
import { badgeVariants } from './badge'

/**
 * A BADGE WITHOUT STATUS DRAWS NOTHING BUT ITS TEXT.
 *
 * Tailwind injects `content: var(--tw-content, "")` into every `before:*` utility, so a
 * `before:size-1.5` sitting on the BASE generates the pseudo-element on every variant — including
 * the ones with no dot to show. That is not a style detail: it put an invisible 6px box plus its
 * flex `gap` in front of the label of every neutral badge in the app, which is how it was caught
 * (a `::before` under the span in devtools, on a `secondary` badge).
 *
 * The rule this pins is the one the primitive's docblock states: the dot IS the status. So the
 * geometry travels with the color — a variant either sets `before:content-['']` AND its size AND a
 * `before:bg-*`, or it emits no `before:` utility at all. Asserting the class string (not a
 * rendered box) is deliberate: jsdom/happy-dom do not evaluate Tailwind, so the only honest place
 * to catch the regression is where the utility is declared.
 */

const STATUS = ['destructive', 'success', 'info', 'warning', 'error'] as const
const NEUTRAL = ['default', 'secondary', 'solid', 'outline', 'ghost', 'link'] as const

describe('Badge — o ponto pertence às variantes de status', () => {
	it('nenhuma variante neutra emite `before:` — nem geometria, nem content', () => {
		for (const variant of NEUTRAL) {
			const classes = badgeVariants({ variant })
			expect(classes, `variante ${variant} não pode gerar pseudo-elemento`).not.toContain('before:')
		}
	})

	it('toda variante de status leva content + geometria + cor juntos', () => {
		for (const variant of STATUS) {
			const classes = badgeVariants({ variant })
			expect(classes, `${variant} precisa de content`).toContain("before:content-['']")
			expect(classes, `${variant} precisa de tamanho`).toContain('before:size-1.5')
			expect(classes, `${variant} precisa ser redondo`).toContain('before:rounded-full')
			expect(classes, `${variant} precisa de cor`).toMatch(/before:bg-\S+/)
		}
	})
})
