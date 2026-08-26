#!/usr/bin/env bun
/**
 * banner.ts — o banner do README (`docs/assets/codm-banner.png`), gerado do MESMO material que os
 * OG banners: a marca vem de `favicon.svg` via `readLogoMarkSvg` e as fontes de `@fontsource/poppins`
 * via `fontDataUri` (ambos de `generate.ts`) — pixels sempre com fonte, nunca retrabalho manual.
 *
 * QUANDO RODAR: depois de trocar o logotipo, a tagline abaixo, ou a identidade de cor
 * (`packages/app/ui/styles/tokens.css` — os hex daqui espelham `--primary`/`--secondary`/`--accent`).
 *
 * uso: bun scripts/og/banner.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { chromium } from 'playwright'
import { readLogoMarkSvg } from './generate'

const REPO_ROOT = join(import.meta.dir, '..', '..')
const ASTRO_DIR = join(REPO_ROOT, 'packages', 'app', 'astro')
const FAVICON_PATH = join(ASTRO_DIR, 'public', 'favicon.svg')
const OUT_PATH = join(REPO_ROOT, 'docs', 'assets', 'codm-banner.png')

export const BANNER_WIDTH = 1280
export const BANNER_HEIGHT = 400

/** Espelhos de tokens.css (comentados lá com estes mesmos hex). */
const COLORS = {
	primary: '#76C410',
	secondary: '#EAF6D3',
	accent: '#F4F6F1',
	foreground: '#161616',
	muted: '#6a6a6a',
	border: '#e6e6e6',
}

/**
 * Inter + IBM Plex Mono — as fontes REAIS da landing (global.css importa `@fontsource/inter` e
 * `@fontsource/ibm-plex-mono`), não o Poppins do OG antigo (que nem está instalado).
 */
export function bundledFontDataUri(pkg: '@fontsource/inter' | '@fontsource/ibm-plex-mono', file: string): string {
	const pkgJsonPath = Bun.resolveSync(`${pkg}/package.json`, ASTRO_DIR)
	const buf = readFileSync(join(dirname(pkgJsonPath), 'files', file))
	return `data:font/woff2;base64,${buf.toString('base64')}`
}

export function buildBannerHtml(input: { logoMarkSvg: string; fonts: Record<300 | 400 | 600 | 800, string>; mono: string }): string {
	const { logoMarkSvg, fonts } = input
	return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @font-face { font-family: 'Inter'; font-weight: 300; src: url(${fonts[300]}) format('woff2'); }
  @font-face { font-family: 'Inter'; font-weight: 400; src: url(${fonts[400]}) format('woff2'); }
  @font-face { font-family: 'Inter'; font-weight: 600; src: url(${fonts[600]}) format('woff2'); }
  @font-face { font-family: 'Inter'; font-weight: 800; src: url(${fonts[800]}) format('woff2'); }
  @font-face { font-family: 'Plex Mono'; font-weight: 600; src: url(${input.mono}) format('woff2'); }
  * { margin: 0; box-sizing: border-box; }
  body { width: ${BANNER_WIDTH}px; height: ${BANNER_HEIGHT}px; font-family: 'Inter', sans-serif;
         background: #ffffff; color: ${COLORS.foreground}; overflow: hidden; position: relative; }
  .blob { position: absolute; border-radius: 999px; }
  .blob.a { left: 340px; top: -170px; width: 760px; height: 380px; background: ${COLORS.secondary}; filter: blur(64px); }
  .blob.b { left: 310px; top: 120px; width: 420px; height: 260px; background: ${COLORS.accent}; filter: blur(48px); }
  .wrap { position: relative; height: 100%; display: flex; align-items: center; justify-content: space-between;
          padding: 0 84px 0 76px; }
  .lockup { display: flex; flex-direction: column; gap: 18px; max-width: 640px; }
  .brand { display: flex; align-items: center; gap: 20px; }
  .brand svg { width: 108px; height: 81px; }
  .brand .name { font-weight: 800; font-size: 64px; letter-spacing: -2.5px; }
  .tagline { font-weight: 400; font-size: 21px; line-height: 1.5; color: ${COLORS.muted}; }
  .tagline b { font-weight: 600; color: ${COLORS.foreground}; }
  .chips { display: flex; gap: 10px; }
  .chip { border: 1px solid ${COLORS.border}; background: #ffffff; border-radius: 10px 10px 10px 4px;
          padding: 7px 14px; font-weight: 600; font-size: 14.5px; color: ${COLORS.muted}; }
  .chip.hot { background: ${COLORS.secondary}; border-color: ${COLORS.secondary}; color: #3c5a10; }
  .mock { position: relative; width: 330px; display: flex; flex-direction: column; gap: 10px; }
  .card { background: #ffffff; border: 1px solid ${COLORS.border}; border-radius: 14px 14px 14px 6px;
          box-shadow: 0 12px 32px rgba(22,22,22,.10); padding: 12px 14px; }
  .card .who { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
  .card .dot { width: 22px; height: 22px; border-radius: 999px; background: ${COLORS.secondary};
               font-size: 9px; font-weight: 800; color: #3c5a10; display: flex; align-items: center; justify-content: center; }
  .card .n { font-size: 11.5px; font-weight: 600; color: ${COLORS.muted}; }
  .in { background: ${COLORS.accent}; border-radius: 4px 12px 12px 12px; padding: 8px 12px; font-size: 13.5px; }
  .out { background: ${COLORS.primary}; color: #ffffff; border-radius: 12px 4px 12px 12px; padding: 9px 13px;
         font-size: 13.5px; margin-left: 52px; box-shadow: 0 12px 32px rgba(118,196,16,.28); }
  .think { display: flex; align-items: center; gap: 8px; font-size: 12px; color: ${COLORS.muted};
           font-family: 'Plex Mono', monospace; font-weight: 600; padding-left: 4px; }
  .think .g { color: ${COLORS.primary}; font-size: 15px; }
  .rot { transform: rotate(-1.6deg); }
  .rot2 { transform: rotate(1.2deg); }
</style></head><body>
  <div class="blob a"></div><div class="blob b"></div>
  <div class="wrap">
    <div class="lockup">
      <div class="brand">${logoMarkSvg}<span class="name">CODM</span></div>
      <div class="tagline">Coding agents in your <b>WhatsApp</b> — running <b>100% on your computer</b>.<br/>DM your codebase like it's any chat.</div>
      <div class="chips">
        <span class="chip hot">WhatsApp today</span>
        <span class="chip">more channels soon</span>
        <span class="chip">open source</span>
      </div>
    </div>
    <div class="mock">
      <div class="card rot">
        <div class="who"><span class="dot">RM</span><span class="n">Rafael Moreira</span></div>
        <div class="in">@aurora did yesterday's deploy ship the new rate limit?</div>
      </div>
      <div class="think rot2"><span class="g">✻</span> Executing… · bun test src/thread</div>
      <div class="out rot2">Shipped and verified — 42 tests green, limit is live. 🤖</div>
    </div>
  </div>
</body></html>`
}

if (import.meta.main) {
	const html = buildBannerHtml({
		logoMarkSvg: readLogoMarkSvg(FAVICON_PATH),
		fonts: {
			300: bundledFontDataUri('@fontsource/inter', 'inter-latin-300-normal.woff2'),
			400: bundledFontDataUri('@fontsource/inter', 'inter-latin-400-normal.woff2'),
			600: bundledFontDataUri('@fontsource/inter', 'inter-latin-600-normal.woff2'),
			800: bundledFontDataUri('@fontsource/inter', 'inter-latin-800-normal.woff2'),
		},
		mono: bundledFontDataUri('@fontsource/ibm-plex-mono', 'ibm-plex-mono-latin-600-normal.woff2'),
	})
	mkdirSync(join(REPO_ROOT, 'docs', 'assets'), { recursive: true })
	const browser = await chromium.launch()
	try {
		const page = await browser.newPage({
			viewport: { width: BANNER_WIDTH, height: BANNER_HEIGHT },
			deviceScaleFactor: 2,
		})
		await page.setContent(html, { waitUntil: 'networkidle' })
		writeFileSync(OUT_PATH, await page.screenshot({ type: 'png' }))
		console.log(`banner: ${OUT_PATH} (${BANNER_WIDTH}x${BANNER_HEIGHT}@2x)`)
	} finally {
		await browser.close()
	}
}
