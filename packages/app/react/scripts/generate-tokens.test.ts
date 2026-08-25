// generate-tokens.test.ts — o compilador é puro e testável sem design/ existir (F0).
// O golden byte-a-byte contra o carrier COMMITADO (como no bk-products) entra na F2, quando
// design/system/pen/tokens.json for extraído e packages/app/ui/styles/tokens.generated.css nascer.
import { describe, expect, it } from 'bun:test'
import { generateTokensCss, type TokensJson } from './generate-tokens'

const FIXTURE: TokensJson = {
	variables: {
		bg: { type: 'color', value: '#101010' },
		primary: { type: 'color', value: '#65a30d' },
		'radius-md': { type: 'number', value: 8 },
		'font-sans': { type: 'string', value: 'Inter' },
	},
}

describe('generateTokensCss', () => {
	it('emite todo token de cor como --color-* dentro de @theme inline', () => {
		const css = generateTokensCss(FIXTURE)
		expect(css).toContain('@theme inline')
		expect(css).toContain('--color-bg')
		expect(css).toContain('--color-primary')
		expect(css).toContain('#65a30d')
	})

	it('emite tokens não-cor (number/string) com o valor resolvido', () => {
		const css = generateTokensCss(FIXTURE)
		expect(css).toContain('radius-md')
		expect(css).toContain('Inter')
	})

	it('é determinístico e idempotente (mesma entrada → byte-igual)', () => {
		expect(generateTokensCss(FIXTURE)).toBe(generateTokensCss(FIXTURE))
	})
})
