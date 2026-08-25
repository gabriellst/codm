import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { buildOgHtml, loadCopy, readLogoMarkSvg } from './generate'

const FONTS = {
	weight300: 'data:font/woff2;base64,AAA',
	weight400: 'data:font/woff2;base64,BBB',
	weight600: 'data:font/woff2;base64,CCC',
	weight800: 'data:font/woff2;base64,DDD',
}
const COPY = {
	badge: 'Open source · free',
	titleBold: 'Text your codebase.',
	titleLight: 'It texts you back.',
	subtitle: 'Issues land on your chat.',
}
const MARK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080"><path id="bolha" fill="#8ad12e" d="M0 0Z"/></svg>'

describe('og generate — buildOgHtml (núcleo puro)', () => {
	it('embute a marca, as 4 fontes e os 4 campos de copy, sem depender de rede', () => {
		const html = buildOgHtml({ copy: COPY, logoMarkSvg: MARK, fonts: FONTS })
		expect(html).toContain('<!doctype html>')
		expect(html).toContain(MARK)
		expect(html).toContain(FONTS.weight300)
		expect(html).toContain(FONTS.weight400)
		expect(html).toContain(FONTS.weight600)
		expect(html).toContain(FONTS.weight800)
		expect(html).toContain(COPY.badge)
		expect(html).toContain(COPY.titleBold)
		expect(html).toContain(COPY.titleLight)
		expect(html).toContain(COPY.subtitle)
		expect(html).not.toContain('Caveat')
		expect(html).not.toContain('fonts.google')
	})

	it('escapa HTML na copy — nunca injeta markup cru vindo do JSON de conteúdo', () => {
		const html = buildOgHtml({
			copy: { ...COPY, titleBold: 'A & B <script>x</script>' },
			logoMarkSvg: MARK,
			fonts: FONTS,
		})
		expect(html).not.toContain('<script>x</script>')
		expect(html).toContain('A &amp; B &lt;script&gt;x&lt;/script&gt;')
	})

	it('é determinístico — mesma entrada produz o mesmo HTML byte a byte (pré-condição da idempotência)', () => {
		const a = buildOgHtml({ copy: COPY, logoMarkSvg: MARK, fonts: FONTS })
		const b = buildOgHtml({ copy: COPY, logoMarkSvg: MARK, fonts: FONTS })
		expect(a).toBe(b)
	})
})

describe('og generate — readLogoMarkSvg', () => {
	let dir: string
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'og-logo-'))
	})
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true })
	})

	it('lê o SVG e recusa qualquer coisa que não comece com <svg>', () => {
		const svgPath = join(dir, 'favicon.svg')
		writeFileSync(svgPath, MARK)
		expect(readLogoMarkSvg(svgPath)).toBe(MARK)

		const badPath = join(dir, 'not-svg.svg')
		writeFileSync(badPath, '<xml>not an svg</xml>')
		expect(() => readLogoMarkSvg(badPath)).toThrow('esperava um <svg> válido')
	})
})

describe('og generate — loadCopy', () => {
	let dir: string
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'og-copy-'))
	})
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true })
	})

	it('lê exatamente os 4 campos do hero, do MESMO JSON que a landing renderiza', () => {
		writeFileSync(join(dir, 'home.en.json'), JSON.stringify({ hero: COPY, nav: { links: {} } }))
		expect(loadCopy('en', dir)).toEqual(COPY)
	})

	it('falha alto (nunca produz banner com string vazia) quando um campo do hero está ausente', () => {
		writeFileSync(join(dir, 'home.pt.json'), JSON.stringify({ hero: { badge: 'x' } }))
		expect(() => loadCopy('pt', dir)).toThrow('hero.{badge,titleBold,titleLight,subtitle} incompleto')
	})
})
