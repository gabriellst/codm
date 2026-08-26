#!/usr/bin/env bun
/**
 * Gera os OG banners (1200×630) da landing a partir de UM template HTML versionado. A marca
 * (favicon.svg, fonte de verdade) e a copy (home.<locale>.json, mesma que a landing renderiza)
 * nunca são redigitadas aqui — só compostas. Existe para que uma troca de marca ou de headline
 * NUNCA MAIS vire retrabalho manual em pixels ("pixels sem fonte") — só uma corrida deste script.
 *
 * QUANDO RODAR:
 *   - depois de trocar o logotipo (packages/app/astro/public/favicon.svg);
 *   - depois de editar hero.badge / hero.titleBold / hero.titleLight / hero.subtitle em
 *     packages/app/astro/src/pages/[locale]/_content/home.{pt,en}.json.
 *
 * uso: bun og:generate            (as duas locales)
 *      bun og:generate --locale pt
 *
 * Ferramenta: Playwright (já é devDependency via packages/e2e — screenshot de HTML é o caminho
 * mais previsível: mesmo motor Chromium que a landing usa em produção, sem reimplementar layout
 * e tipografia numa lib de raster separada como satori/resvg). Fontes (Poppins woff2 de
 * @fontsource/poppins, já self-hosted no app) e a marca (favicon.svg) são embutidas no HTML como
 * data URI / SVG inline — o documento gerado não depende de rede nem de um dev server de pé, o
 * que também é o que torna a renderização determinística execução após execução (idempotente).
 *
 * Puro no núcleo (loadCopy / readLogoMarkSvg / buildOgHtml) — o teste cobre o núcleo sem abrir
 * um browser; só a casca (CLI) fala com Playwright e o disco.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { chromium } from 'playwright'
import { LOCALES, type Locale } from '../../packages/app/astro/src/i18n'
import { REPO } from '../../template.config'

const REPO_ROOT = resolve(import.meta.dir, '../..')
const ASTRO_DIR = join(REPO_ROOT, 'packages/app/astro')
const CONTENT_DIR = join(ASTRO_DIR, 'src/pages/[locale]/_content')
const FAVICON_PATH = join(ASTRO_DIR, 'public/favicon.svg')
const OUT_DIR = join(ASTRO_DIR, 'public/og')

export const OG_WIDTH = 1200
export const OG_HEIGHT = 630

export interface OgCopy {
	badge: string
	titleBold: string
	titleLight: string
	subtitle: string
}

export interface OgFonts {
	/** cada valor é uma data: URI de um woff2 (Poppins) — ver fontDataUri() */
	weight300: string
	weight400: string
	weight600: string
	weight800: string
}

/**
 * Extrai só os 4 campos do hero que o banner usa, direto do JSON que a landing já renderiza —
 * nunca redigitados. Falha alto (nunca produz um banner com string vazia) se um campo sumir do
 * schema de conteúdo.
 */
export function loadCopy(locale: Locale, contentDir: string): OgCopy {
	const path = join(contentDir, `home.${locale}.json`)
	const raw: unknown = JSON.parse(readFileSync(path, 'utf8'))
	const hero = (raw as { hero?: Partial<Record<keyof OgCopy, unknown>> }).hero
	const { badge, titleBold, titleLight, subtitle } = hero ?? {}
	if (
		typeof badge !== 'string' ||
		!badge ||
		typeof titleBold !== 'string' ||
		!titleBold ||
		typeof titleLight !== 'string' ||
		!titleLight ||
		typeof subtitle !== 'string' ||
		!subtitle
	) {
		throw new Error(
			`${path}: hero.{badge,titleBold,titleLight,subtitle} incompleto — o gerador de OG lê exatamente esses 4 campos da copy real da landing`,
		)
	}
	return { badge, titleBold, titleLight, subtitle }
}

/** Lê a marca vetorial (bolha + "dm" traçado, sem dependência de fonte) da fonte de verdade já versionada no app. */
export function readLogoMarkSvg(faviconPath: string): string {
	const svg = readFileSync(faviconPath, 'utf8').trim()
	if (!svg.startsWith('<svg')) {
		throw new Error(`${faviconPath}: esperava um <svg> válido — a marca do banner de OG vem direto deste arquivo`)
	}
	return svg
}

function escapeHtml(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

/** Puro — monta o documento HTML standalone (fontes + marca já embutidas, zero dependência de rede). */
export function buildOgHtml(input: { copy: OgCopy; logoMarkSvg: string; fonts: OgFonts }): string {
	const { copy, logoMarkSvg, fonts } = input
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  @font-face { font-family: 'Poppins'; font-style: normal; font-weight: 300; src: url(${fonts.weight300}) format('woff2'); font-display: block; }
  @font-face { font-family: 'Poppins'; font-style: normal; font-weight: 400; src: url(${fonts.weight400}) format('woff2'); font-display: block; }
  @font-face { font-family: 'Poppins'; font-style: normal; font-weight: 600; src: url(${fonts.weight600}) format('woff2'); font-display: block; }
  @font-face { font-family: 'Poppins'; font-style: normal; font-weight: 800; src: url(${fonts.weight800}) format('woff2'); font-display: block; }
  * { margin: 0; padding: 0; box-sizing: border-box; animation: none !important; transition: none !important; }
  html, body { width: ${OG_WIDTH}px; height: ${OG_HEIGHT}px; overflow: hidden; }
  body {
    font-family: 'Poppins', system-ui, sans-serif;
    background: #ffffff;
    color: #161616;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  .canvas { position: relative; width: ${OG_WIDTH}px; height: ${OG_HEIGHT}px; }
  .card {
    position: absolute; top: 80px; right: 70px; width: 320px; height: 470px;
    background: #EAF6D3; border-radius: 48px 48px 48px 16px;
    display: flex; align-items: center; justify-content: center;
  }
  .card .mark svg { width: 200px; height: 200px; display: block; }
  .content {
    position: absolute; top: 0; left: 0; bottom: 0; width: 740px;
    padding: 80px 32px 80px 80px; display: flex; flex-direction: column;
  }
  .lockup { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
  .lockup .mark svg { width: 40px; height: 40px; display: block; }
  .lockup .word { font-weight: 800; font-size: 22px; letter-spacing: -0.4px; }
  .body { flex: 1; display: flex; flex-direction: column; justify-content: center; min-height: 0; }
  .badge {
    display: inline-flex; align-self: flex-start; align-items: center; gap: 8px;
    background: #f1f1f1; color: #6a6a6a; font-weight: 600; font-size: 16px;
    padding: 9px 18px; border-radius: 999px; margin-bottom: 24px;
  }
  .badge .dot { width: 7px; height: 7px; border-radius: 999px; background: #161616; flex-shrink: 0; }
  h1 { font-size: 56px; line-height: 1.05; letter-spacing: -1.5px; }
  h1 .bold { display: block; font-weight: 800; }
  h1 .light { display: block; font-weight: 300; }
  .subtitle { margin-top: 22px; font-size: 23px; line-height: 1.55; font-weight: 400; color: #6a6a6a; }
</style>
</head>
<body>
  <div class="canvas">
    <div class="card"><span class="mark">${logoMarkSvg}</span></div>
    <div class="content">
      <div class="lockup"><span class="mark">${logoMarkSvg}</span><span class="word">${REPO.brandDisplay}</span></div>
      <div class="body">
        <span class="badge"><span class="dot"></span>${escapeHtml(copy.badge)}</span>
        <h1><span class="bold">${escapeHtml(copy.titleBold)}</span><span class="light">${escapeHtml(copy.titleLight)}</span></h1>
        <p class="subtitle">${escapeHtml(copy.subtitle)}</p>
      </div>
    </div>
  </div>
</body>
</html>`
}

/** Lê o woff2 do @fontsource/poppins já declarado como dependência do app-astro e embute como data URI. */
export function fontDataUri(astroDir: string, weight: 300 | 400 | 600 | 800): string {
	const pkgJsonPath = Bun.resolveSync('@fontsource/poppins/package.json', astroDir)
	const filePath = join(dirname(pkgJsonPath), 'files', `poppins-latin-${weight}-normal.woff2`)
	const buf = readFileSync(filePath)
	return `data:font/woff2;base64,${buf.toString('base64')}`
}

function arg(name: string): string | undefined {
	const i = process.argv.indexOf(`--${name}`)
	return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
	const requested = arg('locale')
	if (requested && !(LOCALES as readonly string[]).includes(requested)) {
		console.error(`--locale inválido: '${requested}' (esperado ${LOCALES.join('|')})`)
		process.exit(2)
	}
	const targets: readonly Locale[] = requested ? [requested as Locale] : LOCALES

	const logoMarkSvg = readLogoMarkSvg(FAVICON_PATH)
	const fonts: OgFonts = {
		weight300: fontDataUri(ASTRO_DIR, 300),
		weight400: fontDataUri(ASTRO_DIR, 400),
		weight600: fontDataUri(ASTRO_DIR, 600),
		weight800: fontDataUri(ASTRO_DIR, 800),
	}
	mkdirSync(OUT_DIR, { recursive: true })

	const browser = await chromium.launch()
	try {
		for (const locale of targets) {
			const copy = loadCopy(locale, CONTENT_DIR)
			const html = buildOgHtml({ copy, logoMarkSvg, fonts })
			const outPath = join(OUT_DIR, `og-${locale}.png`)

			const context = await browser.newContext({
				viewport: { width: OG_WIDTH, height: OG_HEIGHT },
				deviceScaleFactor: 1,
				colorScheme: 'light',
			})
			const page = await context.newPage()
			await page.setContent(html, { waitUntil: 'networkidle' })
			// String form (not a closure): the callback runs in the PAGE's global scope, not this
			// file's — `document` isn't a real identifier here, and this tsconfig has no DOM lib
			// (Node/Bun tooling scope), so a closure referencing it would only type-check by widening
			// the whole project's `lib`. The string form sidesteps that without touching global config.
			await page.evaluate('document.fonts.ready')
			const png = await page.screenshot({ type: 'png' })
			await context.close()

			writeFileSync(outPath, png)
			console.log(`✓ ${outPath} (${png.byteLength} bytes)`)
		}
	} finally {
		await browser.close()
	}
}

if (import.meta.main) {
	main().catch(err => {
		console.error(err)
		process.exit(1)
	})
}
