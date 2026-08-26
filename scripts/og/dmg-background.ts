#!/usr/bin/env bun
/**
 * dmg-background.ts — a imagem de fundo da janela de instalação do DMG
 * (`packages/app/tauri/src-tauri/dmg/background.png`): o "arraste para Aplicativos" que o Finder
 * mostra ao abrir o `.dmg` baixado. Gerada do MESMO material dos OG banners e do banner do README:
 * a marca vem de `favicon.svg` via `readLogoMarkSvg` e a fonte (Inter) via `bundledFontDataUri` —
 * pixels sempre com fonte, nunca retrabalho manual.
 *
 * As COORDENADAS não moram aqui: vêm de `packages/app/tauri/config/dmg.ts` (`DMG`), o mesmo objeto
 * que `generate.ts` renderiza em `bundle.macOS.dmg` do tauri.conf.json. A seta é desenhada ENTRE as
 * duas posições declaradas lá, descontando o ícone de 128 px que o bundler fixa (`DMG_FINDER`) —
 * mover um ícone no config move a seta junto, sem uma segunda cópia dos números.
 *
 * Retina: o Finder pinta a imagem no DPI que ela DECLARA. Um screenshot cru sai a 72 DPI e apareceria
 * com o dobro do tamanho; então a página renderiza em deviceScaleFactor 2 (1320×800 px) e o PNG
 * recebe um chunk `pHYs` dizendo 144 DPI → 660×400 pt, nítido num display retina e correto num 1×.
 *
 * QUANDO RODAR: depois de mudar `DMG` (posições/tamanho da janela), a marca (favicon.svg) ou o
 * desenho abaixo. O PNG é versionado, como os ícones — o build do release não renderiza nada.
 *
 * uso: bun desktop:dmg-background
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { chromium } from 'playwright'
import { DMG, DMG_FINDER } from '../../packages/app/tauri/config/dmg'
import { REPO } from '../../template.config'
import { bundledFontDataUri } from './banner'
import { readLogoMarkSvg } from './generate'

const REPO_ROOT = join(import.meta.dir, '..', '..')
const FAVICON_PATH = join(REPO_ROOT, 'packages', 'app', 'astro', 'public', 'favicon.svg')
/** Derivado do workspace + do path que o tauri.conf declara — nunca um segundo literal. */
export const OUT_PATH = join(REPO_ROOT, REPO.workspaces.appTauri.pkgRoot, 'src-tauri', DMG.background)

/** 2× — o par (escala, DPI) que faz o Finder pintar a imagem em pontos, nítida em retina. */
export const DMG_SCALE = 2
export const DMG_DPI = 72 * DMG_SCALE

/** Espelhos de tokens.css (comentados lá com estes mesmos hex) — os mesmos do banner do README. */
const COLORS = {
	primary: '#76C410',
	secondary: '#EAF6D3',
	accent: '#F4F6F1',
	foreground: '#161616',
	muted: '#6a6a6a',
}

/** Puro — o documento standalone (fonte + marca embutidas, zero rede). Recebe o layout por parâmetro
 *  para o teste provar que a seta segue as posições sem depender do config real. */
export function buildDmgBackgroundHtml(input: {
	logoMarkSvg: string
	fonts: Record<400 | 600, string>
	layout: typeof DMG
	finder: typeof DMG_FINDER
}): string {
	const { logoMarkSvg, fonts, layout, finder } = input
	const { width, height } = layout.windowSize
	const half = finder.iconSize / 2
	// A seta começa depois do ícone do app e termina antes do alias de Applications, com folga para
	// não encostar em nenhum dos dois. Mesmo baseline dos ícones.
	const gap = 34
	const arrow = {
		x1: layout.appPosition.x + half + gap,
		x2: layout.applicationFolderPosition.x - half - gap,
		y: layout.appPosition.y,
	}
	const arrowLength = arrow.x2 - arrow.x1
	const headSize = 22
	// Alvo tracejado em volta de onde o Finder põe o alias de Applications: a affordance de "solte aqui".
	const target = finder.iconSize + 28
	return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @font-face { font-family: 'Inter'; font-weight: 400; src: url(${fonts[400]}) format('woff2'); }
  @font-face { font-family: 'Inter'; font-weight: 600; src: url(${fonts[600]}) format('woff2'); }
  * { margin: 0; box-sizing: border-box; animation: none !important; transition: none !important; }
  html, body { width: ${width}px; height: ${height}px; overflow: hidden; }
  body { position: relative; font-family: 'Inter', sans-serif; background: #ffffff; color: ${COLORS.foreground};
         -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
  .blob { position: absolute; border-radius: 999px; }
  .blob.a { left: ${width - 300}px; top: -230px; width: 640px; height: 440px; background: ${COLORS.secondary}; filter: blur(70px); }
  .blob.b { left: -220px; top: ${height - 150}px; width: 520px; height: 320px; background: ${COLORS.accent}; filter: blur(60px); }
  .lockup { position: absolute; left: 24px; top: 20px; display: flex; align-items: center; gap: 8px; }
  .lockup svg { width: 26px; height: 26px; display: block; }
  .lockup .name { font-weight: 600; font-size: 14px; letter-spacing: -0.3px; color: ${COLORS.muted}; }
  .copy { position: absolute; left: 0; right: 0; top: 58px; text-align: center; }
  .copy h1 { font-weight: 600; font-size: 22px; letter-spacing: -0.5px; line-height: 1.2; }
  .copy p { margin-top: 6px; font-weight: 400; font-size: 13px; color: ${COLORS.muted}; }
  .target { position: absolute; width: ${target}px; height: ${target}px; border-radius: 36px;
            border: 2px dashed rgba(118, 196, 16, 0.55); background: rgba(118, 196, 16, 0.06);
            left: ${layout.applicationFolderPosition.x - target / 2}px; top: ${layout.applicationFolderPosition.y - target / 2}px; }
  .arrow { position: absolute; left: ${arrow.x1}px; top: ${arrow.y - headSize}px; }
</style></head><body>
  <div class="blob a"></div><div class="blob b"></div>
  <div class="lockup">${logoMarkSvg}<span class="name">${REPO.brandDisplay}</span></div>
  <div class="copy">
    <h1>Arraste para instalar</h1>
    <p>Depois é só abrir — tudo roda no seu computador.</p>
  </div>
  <div class="target"></div>
  <svg class="arrow" width="${arrowLength}" height="${headSize * 2}" viewBox="0 0 ${arrowLength} ${headSize * 2}" fill="none"
       stroke="${COLORS.primary}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 3 ${headSize} H ${arrowLength - 6}" />
    <path d="M ${arrowLength - headSize - 2} ${4} L ${arrowLength - 4} ${headSize} L ${arrowLength - headSize - 2} ${headSize * 2 - 4}" />
  </svg>
</body></html>`
}

// ── PNG pHYs (DPI) ────────────────────────────────────────────────────────────
// O Playwright entrega um PNG sem chunk pHYs (=72 DPI implícitos). Reescrever o chunk em TS puro
// mantém o gerador sem dependência nativa (sharp/sips) e determinístico: mesma entrada, mesmos bytes.

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const METERS_PER_INCH = 0.0254

const CRC_TABLE = (() => {
	const table = new Uint32Array(256)
	for (let n = 0; n < 256; n++) {
		let c = n
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
		table[n] = c >>> 0
	}
	return table
})()

function crc32(buf: Buffer): number {
	let crc = 0xffffffff
	for (const byte of buf) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8)
	return (crc ^ 0xffffffff) >>> 0
}

interface PngChunk {
	type: string
	data: Buffer
}

function readChunks(png: Buffer): PngChunk[] {
	if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG (bad signature)')
	const chunks: PngChunk[] = []
	let offset = 8
	while (offset < png.length) {
		const length = png.readUInt32BE(offset)
		const type = png.toString('latin1', offset + 4, offset + 8)
		const data = png.subarray(offset + 8, offset + 8 + length)
		chunks.push({ type, data })
		offset += 12 + length
	}
	return chunks
}

function writeChunks(chunks: readonly PngChunk[]): Buffer {
	const parts: Buffer[] = [PNG_SIGNATURE]
	for (const { type, data } of chunks) {
		const length = Buffer.alloc(4)
		length.writeUInt32BE(data.length)
		const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), data])
		const crc = Buffer.alloc(4)
		crc.writeUInt32BE(crc32(typeAndData))
		parts.push(length, typeAndData, crc)
	}
	return Buffer.concat(parts)
}

/** Puro — o PNG com um único chunk pHYs declarando `dpi` (logo após o IHDR, como manda a spec).
 *  Idempotente: um pHYs anterior é substituído, nunca duplicado. */
export function withPngDpi(png: Buffer, dpi: number): Buffer {
	const chunks = readChunks(png).filter(c => c.type !== 'pHYs')
	const ppm = Math.round(dpi / METERS_PER_INCH)
	const data = Buffer.alloc(9)
	data.writeUInt32BE(ppm, 0)
	data.writeUInt32BE(ppm, 4)
	data.writeUInt8(1, 8) // unit: meter
	const ihdrIndex = chunks.findIndex(c => c.type === 'IHDR')
	if (ihdrIndex === -1) throw new Error('PNG without IHDR')
	chunks.splice(ihdrIndex + 1, 0, { type: 'pHYs', data })
	return writeChunks(chunks)
}

/** Puro — dimensões em px + DPI declarado (null quando não há pHYs, i.e. 72 implícitos). */
export function readPngMeta(png: Buffer): { width: number; height: number; dpi: number | null } {
	const chunks = readChunks(png)
	const ihdr = chunks.find(c => c.type === 'IHDR')
	if (ihdr === undefined) throw new Error('PNG without IHDR')
	const phys = chunks.find(c => c.type === 'pHYs')
	const dpi = phys !== undefined && phys.data.readUInt8(8) === 1 ? Math.round(phys.data.readUInt32BE(0) * METERS_PER_INCH) : null
	return { width: ihdr.data.readUInt32BE(0), height: ihdr.data.readUInt32BE(4), dpi }
}

if (import.meta.main) {
	const html = buildDmgBackgroundHtml({
		logoMarkSvg: readLogoMarkSvg(FAVICON_PATH),
		fonts: {
			400: bundledFontDataUri('@fontsource/inter', 'inter-latin-400-normal.woff2'),
			600: bundledFontDataUri('@fontsource/inter', 'inter-latin-600-normal.woff2'),
		},
		layout: DMG,
		finder: DMG_FINDER,
	})
	mkdirSync(dirname(OUT_PATH), { recursive: true })
	const browser = await chromium.launch()
	try {
		const page = await browser.newPage({ viewport: DMG.windowSize, deviceScaleFactor: DMG_SCALE })
		await page.setContent(html, { waitUntil: 'networkidle' })
		writeFileSync(OUT_PATH, withPngDpi(await page.screenshot({ type: 'png' }), DMG_DPI))
	} finally {
		await browser.close()
	}
	const meta = readPngMeta(readFileSync(OUT_PATH))
	console.log(`✓ ${OUT_PATH} (${meta.width}×${meta.height} px @ ${meta.dpi} DPI)`)
}
