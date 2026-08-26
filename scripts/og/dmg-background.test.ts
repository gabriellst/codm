// A imagem de fundo do DMG é "pixel com fonte": o teste prova que o HTML segue as coordenadas do
// config do shell (a seta fica ENTRE os dois ícones), que o chunk pHYs sai correto e idempotente, e
// que o PNG versionado bate com o `DMG.windowSize` declarado — em 2× e 144 DPI, senão o Finder
// pinta o fundo com o dobro do tamanho (72 DPI implícitos) ou borrado (1×).
import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { DMG, DMG_FINDER } from '../../packages/app/tauri/config/dmg'
import { DMG_DPI, DMG_SCALE, OUT_PATH, buildDmgBackgroundHtml, readPngMeta, withPngDpi } from './dmg-background'

const MARK = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>'
const FONTS = { 400: 'data:font/woff2;base64,QUJD', 600: 'data:font/woff2;base64,REVG' } as const
/** 1×1 PNG válido (sem pHYs) — o menor fixture que exercita o parser de chunks. */
const ONE_PX_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

describe('dmg background (scripts/og/dmg-background.ts)', () => {
	it('desenha a seta ENTRE as posições declaradas no config do shell, descontando o ícone do Finder', () => {
		const html = buildDmgBackgroundHtml({ logoMarkSvg: MARK, fonts: FONTS, layout: DMG, finder: DMG_FINDER })
		const half = DMG_FINDER.iconSize / 2
		const arrowLeft = Number(/\.arrow \{ position: absolute; left: (\d+)px/.exec(html)?.[1])
		const arrowWidth = Number(/<svg class="arrow" width="(\d+)"/.exec(html)?.[1])
		expect(arrowLeft).toBeGreaterThan(DMG.appPosition.x + half)
		expect(arrowLeft + arrowWidth).toBeLessThan(DMG.applicationFolderPosition.x - half)
		expect(html).toContain(MARK)
		expect(html).toContain(FONTS[600])
		expect(html).toContain(`width: ${DMG.windowSize.width}px; height: ${DMG.windowSize.height}px`)
	})

	it('é determinístico — mesma entrada, mesmo HTML byte a byte', () => {
		const input = { logoMarkSvg: MARK, fonts: FONTS, layout: DMG, finder: DMG_FINDER }
		expect(buildDmgBackgroundHtml(input)).toBe(buildDmgBackgroundHtml(input))
	})

	it('withPngDpi grava um pHYs legível de volta, logo após o IHDR, e é idempotente', () => {
		expect(readPngMeta(ONE_PX_PNG)).toEqual({ width: 1, height: 1, dpi: null })
		const once = withPngDpi(ONE_PX_PNG, 144)
		expect(readPngMeta(once)).toEqual({ width: 1, height: 1, dpi: 144 })
		expect(once.toString('latin1').indexOf('pHYs')).toBe(8 + 4 + 4 + 13 + 4 + 4)
		expect(withPngDpi(once, 144).equals(once)).toBe(true)
		expect(once.toString('latin1').split('pHYs').length - 1).toBe(1)
	})

	it('o PNG versionado é o config em 2× e 144 DPI — senão o Finder pinta com o dobro do tamanho', () => {
		const meta = readPngMeta(readFileSync(OUT_PATH))
		expect(meta).toEqual({
			width: DMG.windowSize.width * DMG_SCALE,
			height: DMG.windowSize.height * DMG_SCALE,
			dpi: DMG_DPI,
		})
	})
})
