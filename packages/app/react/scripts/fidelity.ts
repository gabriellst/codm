#!/usr/bin/env bun
/**
 * fidelity.ts — UI-FIDELITY.md "Pista 2" runner (design/system/pen → app, distance metric).
 *
 * `bun fidelity` (root script) runs this end-to-end:
 *   1. Discover every Storybook story tagged with `parameters.fidelity = { slug, kind?, viewport? }`
 *      by scanning `packages/app/react/src/**\/*.stories.tsx` and dynamically importing each module
 *      (CSF3 story objects are plain data — no DOM needed to read `.parameters`; each import is
 *      wrapped so one broken/unrelated story file can never abort the whole run — see
 *      `discoverFidelityItems`).
 *   2. If NO story is tagged yet, write an empty scoreboard + report and exit 0 — "sem targets
 *      ainda: roda, screenshota o que houver" (UI-FIDELITY.md) also covers "houver nada": the
 *      mechanism must be inert-but-successful before any story opts in, not crash-on-empty.
 *   3. Otherwise: build `app-react`'s Storybook (`nx run app-react:storybook-build`), serve the
 *      static output, and for each tagged story: navigate Playwright to its iframe at the
 *      declared viewport and screenshot `#storybook-root` into `design/fidelity/current/<kind>/
 *      <slug>.png`.
 *   4. If `design/fidelity/targets/<kind>/<slug>.png` exists, pixel-diff it against the fresh
 *      screenshot (`computeScore`) → a delta PNG in `design/fidelity/deltas/<kind>/<slug>.png` +
 *      a 0..1 score; otherwise the item is marked `no-target`.
 *   5. Write `design/fidelity/scoreboard.json` (machine-readable, worst-score-first) and
 *      `design/fidelity/report.html` (the target|atual|delta trio per item, worst first — the
 *      "fácil de olhar" comparison UI-FIDELITY.md's pista 2 asks for).
 *
 * `computeScore` is exported and covered by a colocated unit test (`fidelity.test.ts`) against two
 * tiny synthetic PNGs — it needs neither Storybook nor a browser to be exercised.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import { ITEM_PASS, ITEM_REGION_LANE_ACCEPTED, ITEM_THRESHOLD_OVERRIDES, ITEM_TILE_ALLOWLIST } from './fidelity-allowlists'

const REPO_ROOT = join(import.meta.dir, '..', '..', '..', '..')
const REACT_ROOT = join(REPO_ROOT, 'packages', 'app', 'react')
const REACT_SRC = join(REACT_ROOT, 'src')
// Primitive stories moved to packages/app/ui/src/components/stories/ (limpeza de identidade:
// @/components/ui/* → @codm/app-ui/*) — discovery has to reach this second root too, or every
// fidelity-tagged primitive story silently drops out of the scoreboard.
const UI_SRC = join(REPO_ROOT, 'packages', 'app', 'ui', 'src')
const STORYBOOK_STATIC = join(REACT_ROOT, 'storybook-static')
const FIDELITY_ROOT = join(REPO_ROOT, 'design', 'fidelity')
const TARGETS_DIR = join(FIDELITY_ROOT, 'targets')
const CURRENT_DIR = join(FIDELITY_ROOT, 'current')
const DELTAS_DIR = join(FIDELITY_ROOT, 'deltas')
const SCOREBOARD_PATH = join(FIDELITY_ROOT, 'scoreboard.json')
const REPORT_PATH = join(FIDELITY_ROOT, 'report.html')

export type FidelityKind = 'components' | 'screens'

/** Per-item threshold — UI-FIDELITY.md "Pista 2": components 0.90, screens 0.85 (screens carry
 *  dynamic data so they get more slack). */
const THRESHOLD: Record<FidelityKind, number> = { components: 0.9, screens: 0.85 }

function itemThreshold(item: FidelityItem): { threshold: number; why?: string } {
	const override = ITEM_THRESHOLD_OVERRIDES[item.slug]
	if (override && item.kind === 'components') return override
	return { threshold: THRESHOLD[item.kind] }
}

const DEFAULT_VIEWPORT = { width: 800, height: 600 }

export interface FidelityParam {
	slug: string
	kind?: FidelityKind
	viewport?: { width: number; height: number }
}

export interface FidelityItem {
	slug: string
	kind: FidelityKind
	storyId: string
	storyTitle: string
	storyName: string
	file: string
	viewport: { width: number; height: number }
}

// ─── Story ID (mirrors @storybook/csf's `toId` — export name goes through `storyNameFromExport`'s
// word-splitting, THEN the same lowercase/dash sanitize as the title) ───────────────────────────

function sanitize(part: string): string {
	return part
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
}

/**
 * Splits an export name at camelCase and letter↔digit boundaries — the same word-boundary logic
 * Storybook's real `storyNameFromExport` (`startCase`) applies to an export name before it becomes
 * part of a story id.
 *
 * TRAP (F3, 2026-08-24 — third iteration of this bug): the previous `storyId` sanitized the RAW
 * export name with no word-splitting at all, so `OnboardingBoasVindas` produced
 * `...--onboardingboasvindas` while Storybook's real id (confirmed against `storybook-static/
 * index.json`) is `...--onboarding-boas-vindas`. The mismatch only showed up on MULTI-WORD
 * exports — single-word exports (`Default`, `Loading`) have no boundary to split, so 19/35 stories
 * masked the defect while the other 16/35 (every multi-word export) 404'd: Playwright's
 * `page.goto(iframe.html?id=...)` navigated to a story id that doesn't exist, threw
 * `NoStoryMatchError`, and the screenshot silently came back as an empty root instead of a named
 * failure. `@storybook/csf` is NOT importable here (Storybook 10 embeds it) — this is a from-scratch
 * reimplementation of just the word-splitting `startCase` does, not a dependency.
 */
function splitWordBoundaries(exportName: string): string {
	return exportName
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
		.replace(/([a-zA-Z])(\d)/g, '$1 $2')
		.replace(/(\d)([a-zA-Z])/g, '$1 $2')
}

export function storyId(title: string, exportName: string): string {
	return `${sanitize(title)}--${sanitize(splitWordBoundaries(exportName))}`
}

// ─── Discovery ───────────────────────────────────────────────────────────────────────────────────

/**
 * Scans every `*.stories.tsx` under `srcDir`, imports it (Bun resolves each file's OWN nearest
 * tsconfig `paths`, so `@/...` aliases resolve regardless of where this script itself lives), and
 * collects every named export whose `parameters.fidelity` is set. A story file that fails to import
 * (module-load side effect touching a browser global outside a DOM, a broken relative import, etc.)
 * is SKIPPED with a warning, never fatal — one unrelated broken story must not sink the whole run.
 */
export async function discoverFidelityItems(srcDir: string): Promise<FidelityItem[]> {
	const items: FidelityItem[] = []
	if (!existsSync(srcDir)) return items

	const glob = new Bun.Glob('**/*.stories.tsx')
	for (const rel of glob.scanSync({ cwd: srcDir })) {
		const file = join(srcDir, rel)
		let module_: Record<string, unknown>
		try {
			module_ = (await import(file)) as Record<string, unknown>
		} catch (err) {
			console.warn(`fidelity: skipping ${rel} — failed to import (${err instanceof Error ? err.message : String(err)})`)
			continue
		}

		const meta = module_.default as { title?: string } | undefined
		if (!meta?.title) continue

		for (const [exportName, story] of Object.entries(module_)) {
			if (exportName === 'default') continue
			const fidelity = (story as { parameters?: { fidelity?: FidelityParam } } | undefined)?.parameters?.fidelity
			if (!fidelity?.slug) continue
			items.push({
				slug: fidelity.slug,
				kind: fidelity.kind ?? 'components',
				storyId: storyId(meta.title, exportName),
				storyTitle: meta.title,
				storyName: exportName,
				file: rel,
				viewport: fidelity.viewport ?? DEFAULT_VIEWPORT,
			})
		}
	}
	return items.sort((a, b) => a.slug.localeCompare(b.slug))
}

// ─── Scoring (pure — no filesystem access beyond the 3 paths it's given, no browser) ───────────────

export interface TileFail {
	/** Tile origin in px (top-left of the tile inside the compared crop). */
	x: number
	y: number
	/** 1 − diffPixels/tileArea for this tile. */
	score: number
	/** Perceptual mean-color distance (redmean) between target and current for this tile. */
	colorDelta: number
	/** Deslocamento vertical (px) que EXPLICA o tile, quando a lane de shift o identificou: o
	 *  conteúdo é o mesmo, só está noutra altura. Ausente quando não é caso de deslocamento. */
	shiftY?: number
	/** Which lane(s) failed the tile. */
	reason: 'diff' | 'color' | 'diff+color'
}

export interface TileReport {
	size: number
	cols: number
	rows: number
	worstScore: number
	worstColorDelta: number
	failing: TileFail[]
}

export interface ScoreResult {
	score: number
	diffPixels: number
	totalPixels: number
	width: number
	height: number
	/** Region-level lane (UI-FIDELITY "calibração por região", 2026-08-21): the GLOBAL score is an
	 *  average, and averages forgive what a human eye flags instantly — a wrong-color badge is
	 *  ~0.1% of a 1440×900 canvas (global 0.999) but 40%+ of its own tile. The worst REGION rules.
	 *  Color is its own lane: a subtly-wrong background tone sits BELOW pixelmatch's per-pixel
	 *  threshold (never counted as diff at all) yet shifts the tile's mean color — redmean distance
	 *  catches what the diff count structurally cannot. */
	tiles: TileReport
}

/** Off-by-one dimension tolerance, in px per axis. MEASURED need (W1a, 2026-08-20): `badge`'s
 *  computed height is exactly the target's 21px, but its `top` lands on a half-pixel boundary
 *  (16.5 — inherent to the spec's own geometry: a 6px dot centered in a 13px line) and Playwright
 *  rounds floor/ceil independently, capturing 22px; `gradienticon`'s SPEC says 22×22 while the
 *  Pencil exporter delivered a 21×21 PNG. Both are rasterization/export rounding, not size errors —
 *  score them over the overlapping area. Anything past 1px per axis stays a hard 0: a real
 *  dimension bug (wrong padding, wrong content) is never within one pixel. */
const DIMENSION_TOLERANCE_PX = 1

/** Crops `png` to `width`×`height` at the given top-left offset. */
function cropAt(png: PNG, offsetX: number, offsetY: number, width: number, height: number): PNG {
	const out = new PNG({ width, height })
	PNG.bitblt(png, out, offsetX, offsetY, width, height, 0, 0)
	return out
}

/**
 * 3×3 box blur (régua v3, mandato de excelência item 2): normaliza o ruído de rasterização
 * sub-pixel entre motores (AA de fonte Pencil vs Chromium, o "ghosting fino de 1-2px em linhas
 * de texto" que dominava o resíduo das telas) ANTES do pixel-diff. Diferenças reais de ≥1px de
 * geometria/tom sobrevivem ao blur — sub-pixel some. Aplicado a CÓPIAS só para a lane de diff;
 * a lane de cor usa médias (já low-frequency) das imagens originais.
 */
export function boxBlur3(png: PNG, width: number, height: number): PNG {
	const out = new PNG({ width, height })
	const src = png.data
	const dst = out.data
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let r = 0
			let g = 0
			let b = 0
			let a = 0
			let n = 0
			for (let dy = -1; dy <= 1; dy++) {
				const yy = y + dy
				if (yy < 0 || yy >= height) continue
				for (let dx = -1; dx <= 1; dx++) {
					const xx = x + dx
					if (xx < 0 || xx >= width) continue
					const i = (yy * width + xx) * 4
					r += src[i] as number
					g += src[i + 1] as number
					b += src[i + 2] as number
					a += src[i + 3] as number
					n++
				}
			}
			const o = (y * width + x) * 4
			dst[o] = r / n
			dst[o + 1] = g / n
			dst[o + 2] = b / n
			dst[o + 3] = a / n
		}
	}
	return out
}

/** Tile geometry for the region lane. 60px ≈ the scale of the smallest semantic unit the founder
 *  flagged (a badge, an icon container, an input's corner) — big enough that font AA noise
 *  averages out, small enough that a wrong badge dominates its tile. */
export const TILE_SIZE = 60

/** Calibrated floors — see fidelity.test.ts's calibration cases and UI-FIDELITY.md. A tile fails
 *  by STRUCTURE (too many diff pixels) or by COLOR (mean tone shifted), whichever fires. */
export const TILE_SCORE_FLOOR = 0.6
export const TILE_COLOR_DELTA_MAX = 12
/** Diff-cluster sub-lane: sub-block edge and the contiguous-diff fraction that fails it. */
export const SUBBLOCK_SIZE = 12
export const SUBBLOCK_DIFF_FLOOR = 0.75

/** Perceptual distance between two RGB means (redmean approximation — cheap, good enough to
 *  separate "same hue, AA noise" from "different tone"). */
export function redmeanDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
	const rMean = (r1 + r2) / 2
	const dr = r1 - r2
	const dg = g1 - g2
	const db = b1 - b2
	return Math.sqrt((2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db)
}

/**
 * Region lane: walks the pixelmatch diff output (pure red [255,0,0] = counted diff pixel; yellow
 * AA and grayscale bg are not) alongside both source crops, and reports every tile that fails by
 * structure (score < TILE_SCORE_FLOOR) or by color (mean redmean > TILE_COLOR_DELTA_MAX).
 * Alpha-composites both sources over white before averaging so transparent regions compare by
 * what the viewer actually sees.
 */
/**
 * ANOTAÇÃO de deslocamento (2026-08-22): para um tile que JÁ falhou, procura um deslocamento
 * vertical que explique a divergência. Não cria tile novo e não muda o gate — enriquece o que já é
 * débito com a causa provável (altura de um ancestral), que é a diferença entre "algo errado aqui"
 * e uma pista acionável.
 *
 * A versão anterior era uma LANE própria e foi cortada no mesmo dia: acendia 105 tiles de 3-8px em
 * 18 telas, e 4px numa tela de 1040 é 0,4% — imperceptível. Fica o registro porque a tentação de
 * medir tudo que é mensurável é real, e o critério é outro: a régua existe para o que o olho vê.
 * Busca dirigida de geometria continua sendo `bun probe`, sob demanda.
 */
const SHIFT_MIN_PX = 3
const SHIFT_MAX_PX = 20
/** A divergência precisa cair para menos disto ao deslocar para o tile contar como "só deslocado". */
const SHIFT_EXPLAINS_RATIO = 0.34
/** Abaixo desta divergência na base não há nada que um deslocamento explique (ruído de AA). */
const SHIFT_MIN_BASE_FRACTION = 0.03

export function computeTiles(target: PNG, current: PNG, diff: PNG, width: number, height: number): TileReport {
	const cols = Math.ceil(width / TILE_SIZE)
	const rows = Math.ceil(height / TILE_SIZE)
	const failing: TileFail[] = []
	let worstScore = 1
	let worstColorDelta = 0

	for (let ty = 0; ty < rows; ty++) {
		for (let tx = 0; tx < cols; tx++) {
			const x0 = tx * TILE_SIZE
			const y0 = ty * TILE_SIZE
			const x1 = Math.min(x0 + TILE_SIZE, width)
			const y1 = Math.min(y0 + TILE_SIZE, height)
			// Pixels where the TARGET is (near-)transparent are OUTSIDE the design (Pencil exports
			// the artboard's rounded corners with alpha 0, while a page screenshot is always
			// opaque) — comparing them manufactures white-vs-dark ΔE ~600 (measured, ext-02
			// corners). They are masked out of BOTH lanes; a tile that is mostly mask has no
			// design content to judge and is skipped.
			let area = 0
			let diffCount = 0
			let tr = 0
			let tg = 0
			let tb = 0
			let cr = 0
			let cg = 0
			let cb = 0
			for (let y = y0; y < y1; y++) {
				for (let x = x0; x < x1; x++) {
					const i = (y * width + x) * 4
					const ta = (target.data[i + 3] as number) / 255
					if (ta < 0.06) continue
					area++
					if (diff.data[i] === 255 && diff.data[i + 1] === 0 && diff.data[i + 2] === 0) diffCount++
					tr += (target.data[i] as number) * ta + 255 * (1 - ta)
					tg += (target.data[i + 1] as number) * ta + 255 * (1 - ta)
					tb += (target.data[i + 2] as number) * ta + 255 * (1 - ta)
					const ca = (current.data[i + 3] as number) / 255
					cr += (current.data[i] as number) * ca + 255 * (1 - ca)
					cg += (current.data[i + 1] as number) * ca + 255 * (1 - ca)
					cb += (current.data[i + 2] as number) * ca + 255 * (1 - ca)
				}
			}
			const tileArea = (x1 - x0) * (y1 - y0)
			if (area < tileArea * 0.25) continue
			const score = 1 - diffCount / area
			// FLATNESS gate for the color lane (calibração W3a, 2026-08-21): the color lane exists
			// for FLAT-ish regions (backgrounds, badge fills, surfaces) — in a text-heavy tile the
			// mean color is a function of glyph coverage, which legitimately differs between
			// rasterizers (Chromium vs Pencil render the same font at different weights/AA), so a
			// mean-shift there is noise the diff lane already bounds at 40%. Flatness = luma std of
			// the TARGET tile; text/edge tiles have high std and skip the color check.
			let lumaSum = 0
			let lumaSqSum = 0
			for (let y = y0; y < y1; y++) {
				for (let x = x0; x < x1; x++) {
					const i = (y * width + x) * 4
					const ta = (target.data[i + 3] as number) / 255
					if (ta < 0.06) continue
					const luma =
						0.299 * ((target.data[i] as number) * ta + 255 * (1 - ta)) +
						0.587 * ((target.data[i + 1] as number) * ta + 255 * (1 - ta)) +
						0.114 * ((target.data[i + 2] as number) * ta + 255 * (1 - ta))
					lumaSum += luma
					lumaSqSum += luma * luma
				}
			}
			const lumaMean = lumaSum / area
			const lumaStd = Math.sqrt(Math.max(0, lumaSqSum / area - lumaMean * lumaMean))
			const isFlat = lumaStd < 24
			const colorDelta = redmeanDistance(tr / area, tg / area, tb / area, cr / area, cg / area, cb / area)
			if (score < worstScore) worstScore = score
			if (colorDelta > worstColorDelta) worstColorDelta = colorDelta
			// DIFF-CLUSTER sub-lane (calibração final W3a): a fração de diff do tile inteiro (40%)
			// tolera AA de texto porque AA é DISPERSO pelas bordas dos glifos; uma badge/ícone de
			// matiz errada é um BLOCO CONTÍGUO de diff — num sub-bloco de 12px ela satura. Fração
			// ≥ SUBBLOCK_DIFF_FLOOR em qualquer sub-bloco = falha estrutural, mesmo com o tile na
			// média verde e a lane de cor bloqueada pela não-planura (tile misto badge+fundo).
			let maxSubBlockFraction = 0
			for (let sy = y0; sy < y1; sy += SUBBLOCK_SIZE) {
				for (let sx = x0; sx < x1; sx += SUBBLOCK_SIZE) {
					const ex = Math.min(sx + SUBBLOCK_SIZE, x1)
					const ey = Math.min(sy + SUBBLOCK_SIZE, y1)
					let subDiff = 0
					let subArea = 0
					for (let y = sy; y < ey; y++) {
						for (let x = sx; x < ex; x++) {
							const i = (y * width + x) * 4
							if ((target.data[i + 3] as number) < 15) continue
							subArea++
							if (diff.data[i] === 255 && diff.data[i + 1] === 0 && diff.data[i + 2] === 0) subDiff++
						}
					}
					if (subArea >= SUBBLOCK_SIZE * SUBBLOCK_SIZE * 0.5) {
						const fraction = subDiff / subArea
						if (fraction > maxSubBlockFraction) maxSubBlockFraction = fraction
					}
				}
			}
			let badScore = score < TILE_SCORE_FLOOR || maxSubBlockFraction >= SUBBLOCK_DIFF_FLOOR
			// SHIFT-TOLERANCE local (v3 real, pós-refutação do blur): um deslocamento de 1px de
			// baseline de texto é imperceptível a olho mas pinta a linha inteira de diff. Para um
			// tile que falhou por estrutura, re-compara com o CURRENT deslocado ±1px (comparador
			// próprio, redmean>35 ≈ threshold do pixelmatch); se ALGUM offset explica o tile
			// (fração e sub-blocos abaixo dos floors), a falha era deslocamento sub-perceptual —
			// tile passa. Drift real (>1px) e cor errada não têm offset que os explique.
			if (badScore) {
				// Offset POR SUB-BLOCO (±2px): a divergência de renderização de fonte é drift
				// PROGRESSIVO por palavra (nenhum offset único de tile explica — medido: shift
				// único removeu ~0 tiles). Cada sub-bloco de 12px pode encontrar seu próprio
				// alinhamento dentro de ±2px — o modelo mecânico de "cada palavra está onde
				// deveria, a menos de um deslocamento imperceptível". Tamanho/peso/cor errados e
				// drift real (>2px) continuam sem offset que os explique.
				let sArea = 0
				let sDiff = 0
				let sMaxSub = 0
				for (let sy = y0; sy < y1; sy += SUBBLOCK_SIZE) {
					for (let sx = x0; sx < x1; sx += SUBBLOCK_SIZE) {
						const ex = Math.min(sx + SUBBLOCK_SIZE, x1)
						const ey = Math.min(sy + SUBBLOCK_SIZE, y1)
						let bestFraction = 1
						let bestArea = 0
						let bestDiff = 0
						for (let dy = -2; dy <= 2; dy++) {
							for (let dx = -2; dx <= 2; dx++) {
								let bArea = 0
								let bDiff = 0
								for (let y = sy; y < ey; y++) {
									const cy = y + dy
									if (cy < 0 || cy >= height) continue
									for (let x = sx; x < ex; x++) {
										const cx = x + dx
										if (cx < 0 || cx >= width) continue
										const ti = (y * width + x) * 4
										const ta = (target.data[ti + 3] as number) / 255
										if (ta < 0.06) continue
										const ci = (cy * width + cx) * 4
										const ca = (current.data[ci + 3] as number) / 255
										const dist = redmeanDistance(
											(target.data[ti] as number) * ta + 255 * (1 - ta),
											(target.data[ti + 1] as number) * ta + 255 * (1 - ta),
											(target.data[ti + 2] as number) * ta + 255 * (1 - ta),
											(current.data[ci] as number) * ca + 255 * (1 - ca),
											(current.data[ci + 1] as number) * ca + 255 * (1 - ca),
											(current.data[ci + 2] as number) * ca + 255 * (1 - ca),
										)
										bArea++
										if (dist > 35) bDiff++
									}
								}
								if (bArea > 0) {
									const f = bDiff / bArea
									// bestArea===0: primeiro offset válido SEMPRE entra — um bloco 100%
									// diferente tem f=1.0, que nunca é < 1.0 inicial e sumiria da
									// agregação (bug medido: o badge do teste de calibração escapava).
									if (bestArea === 0 || f < bestFraction) {
										bestFraction = f
										bestArea = bArea
										bestDiff = bDiff
									}
								}
							}
						}
						sArea += bestArea
						sDiff += bestDiff
						if (bestArea >= SUBBLOCK_SIZE * SUBBLOCK_SIZE * 0.5 && bestFraction > sMaxSub) sMaxSub = bestFraction
					}
				}
				if (sArea > 0 && 1 - sDiff / sArea >= TILE_SCORE_FLOOR && sMaxSub < SUBBLOCK_DIFF_FLOOR) {
					badScore = false
				}
			}
			const badColor = isFlat && colorDelta > TILE_COLOR_DELTA_MAX

			// Lane de DESLOCAMENTO — ver o docblock das constantes acima.
			let shiftY = 0
			// Tile com MÁSCARA (alpha do alvo) fica fora: o canto arredondado do artboard casa
			// espuriamente com ele mesmo deslocado (shift fantasma de 10px no tile (0,0) de metade
			// das telas da extensão — medido, 2026-08-22).
			const masked = area < tileArea
			// Só ANOTA tiles que JÁ falham. A primeira versão criava tiles próprios e acendeu 105
			// "débitos" de 3-8px em 18 telas — e o founder cortou na hora, com razão: 4px em 1040 é
			// 0,4%, imperceptível, e uma lista que ninguém vai pagar é burocracia com cara de rigor.
			// O valor do deslocamento é DIAGNÓSTICO: quando um tile já está vermelho, saber que o
			// conteúdo bate 8px acima aponta a causa (altura de um ancestral) em vez de mandar
			// alguém procurar. Custo zero de ruído, e a busca dirigida continua sendo `bun probe`.
			if ((badScore || badColor) && !isFlat && !masked) {
				const fractionAt = (dy: number): number => {
					let a = 0
					let d = 0
					for (let y = y0; y < y1; y++) {
						const cy = y + dy
						if (cy < 0 || cy >= height) continue
						for (let x = x0; x < x1; x++) {
							const ti = (y * width + x) * 4
							const ta = (target.data[ti + 3] as number) / 255
							if (ta < 0.06) continue
							const ci = (cy * width + x) * 4
							const ca = (current.data[ci + 3] as number) / 255
							a++
							const dist = redmeanDistance(
								(target.data[ti] as number) * ta + 255 * (1 - ta),
								(target.data[ti + 1] as number) * ta + 255 * (1 - ta),
								(target.data[ti + 2] as number) * ta + 255 * (1 - ta),
								(current.data[ci] as number) * ca + 255 * (1 - ca),
								(current.data[ci + 1] as number) * ca + 255 * (1 - ca),
								(current.data[ci + 2] as number) * ca + 255 * (1 - ca),
							)
							if (dist > 35) d++
						}
					}
					return a > 0 ? d / a : 0
				}
				const base = fractionAt(0)
				if (base >= SHIFT_MIN_BASE_FRACTION) {
					let bestFraction = base
					let bestDy = 0
					for (let dy = SHIFT_MIN_PX; dy <= SHIFT_MAX_PX; dy++) {
						for (const signed of [dy, -dy]) {
							const f = fractionAt(signed)
							if (f < bestFraction) {
								bestFraction = f
								bestDy = signed
							}
						}
					}
					if (bestDy !== 0 && bestFraction <= base * SHIFT_EXPLAINS_RATIO) shiftY = bestDy
				}
			}

			if (badScore || badColor) {
				failing.push({
					x: x0,
					y: y0,
					score: Number(score.toFixed(4)),
					colorDelta: Number(colorDelta.toFixed(2)),
					...(shiftY !== 0 ? { shiftY } : {}),
					reason: badScore && badColor ? 'diff+color' : badScore ? 'diff' : 'color',
				})
			}
		}
	}
	return {
		size: TILE_SIZE,
		cols,
		rows,
		worstScore: Number(worstScore.toFixed(4)),
		worstColorDelta: Number(worstColorDelta.toFixed(2)),
		failing,
	}
}

/**
 * Pixel-diffs `targetPath` against `currentPath` (pixelmatch), optionally writing the diff PNG to
 * `deltaPath`. A dimension mismatch is NOT a crash — within `DIMENSION_TOLERANCE_PX` per axis it
 * is scored over the overlapping crop (rounding noise, see above); past it, it IS a fidelity
 * failure (score 0, the whole canvas counted as diff) rather than a tooling error pixelmatch
 * would throw on.
 *
 * Within tolerance, the overlap crop is BEST-ALIGNED, not fixed top-left. MEASURED (W1a,
 * 2026-08-20, `gradienticon`): the spec's 22×22 render vs the Pencil exporter's 21×21 target are
 * the SAME artwork scaled from the same origin at two adjacent pixel sizes — every stroke lands
 * ~1px further from the origin in the larger render, so a fixed top-left crop compares
 * systematically misaligned content (score 0.75) even though the shapes are correct. Trying
 * every offset the tolerance allows and keeping the lowest-diff alignment (score 0.94) is still
 * bounded by `DIMENSION_TOLERANCE_PX` — it cannot mask a real size bug (those fail the `dw/dh`
 * check above before this is ever reached) — it just stops the crop ANCHOR from being an
 * unexamined assumption that happened to be wrong.
 */
export function computeScore(targetPath: string, currentPath: string, deltaPath?: string, pixelThreshold = 0.1): ScoreResult {
	const target: PNG = PNG.sync.read(readFileSync(targetPath))
	const current: PNG = PNG.sync.read(readFileSync(currentPath))

	const dw = Math.abs(target.width - current.width)
	const dh = Math.abs(target.height - current.height)
	if (dw > DIMENSION_TOLERANCE_PX || dh > DIMENSION_TOLERANCE_PX) {
		const width = Math.max(target.width, current.width)
		const height = Math.max(target.height, current.height)
		if (deltaPath) writeFileSync(deltaPath, PNG.sync.write(new PNG({ width, height })))
		return {
			score: 0,
			diffPixels: width * height,
			totalPixels: width * height,
			width,
			height,
			tiles: { size: TILE_SIZE, cols: 0, rows: 0, worstScore: 0, worstColorDelta: 0, failing: [] },
		}
	}

	const width = Math.min(target.width, current.width)
	const height = Math.min(target.height, current.height)
	const targetExcessW = target.width - width
	const targetExcessH = target.height - height
	const currentExcessW = current.width - width
	const currentExcessH = current.height - height

	let best: { diffPixels: number; diff: PNG; targetCrop: PNG; currentCrop: PNG } | null = null
	for (let tox = 0; tox <= targetExcessW; tox++) {
		for (let toy = 0; toy <= targetExcessH; toy++) {
			const targetCrop = cropAt(target, tox, toy, width, height)
			// NOTA v3 (resultado NEGATIVO medido, 2026-08-21): blur 3×3 pré-diff foi tentado e
			// REVERTIDO — deslocamento de 1px + blur vira uma BANDA de deltas moderados que o
			// threshold ainda conta (diff pixels SOBEM), e fringes de alpha borradas quebraram 7
			// componentes tight-crop. A tolerância a deslocamento vive na lane de TILE
			// (computeTiles, shift ±1px local), não no borrão global.
			for (let cox = 0; cox <= currentExcessW; cox++) {
				for (let coy = 0; coy <= currentExcessH; coy++) {
					const currentCrop = cropAt(current, cox, coy, width, height)
					const diff = new PNG({ width, height })
					const diffPixels = pixelmatch(targetCrop.data, currentCrop.data, diff.data, width, height, { threshold: pixelThreshold })
					if (!best || diffPixels < best.diffPixels) best = { diffPixels, diff, targetCrop, currentCrop }
				}
			}
		}
	}
	// best is never null: the offset loops always run at least once (0..excess includes 0).
	const { diffPixels, diff, targetCrop, currentCrop } = best as { diffPixels: number; diff: PNG; targetCrop: PNG; currentCrop: PNG }
	const tiles = computeTiles(targetCrop, currentCrop, diff, width, height)
	if (deltaPath) {
		// Outline every failing tile in blue on the delta so the report POINTS at the region a
		// human should look at (the whole point of the region lane).
		for (const tile of tiles.failing) {
			const x1 = Math.min(tile.x + TILE_SIZE, width) - 1
			const y1 = Math.min(tile.y + TILE_SIZE, height) - 1
			for (let x = tile.x; x <= x1; x++) {
				for (const y of [tile.y, y1]) {
					const i = (y * width + x) * 4
					diff.data[i] = 0
					diff.data[i + 1] = 128
					diff.data[i + 2] = 255
					diff.data[i + 3] = 255
				}
			}
			for (let y = tile.y; y <= y1; y++) {
				for (const x of [tile.x, x1]) {
					const i = (y * width + x) * 4
					diff.data[i] = 0
					diff.data[i + 1] = 128
					diff.data[i + 2] = 255
					diff.data[i + 3] = 255
				}
			}
		}
		writeFileSync(deltaPath, PNG.sync.write(diff))
	}
	const totalPixels = width * height
	return { score: totalPixels === 0 ? 1 : 1 - diffPixels / totalPixels, diffPixels, totalPixels, width, height, tiles }
}

// ─── Scoreboard + report ─────────────────────────────────────────────────────────────────────────

export interface ScoreboardEntry {
	slug: string
	kind: FidelityKind
	storyId: string
	status: 'scored' | 'no-target' | 'error'
	score: number | null
	threshold: number
	/** Present ONLY when an ITEM_THRESHOLD_OVERRIDES entry lowered this item's threshold. */
	thresholdWhy?: string
	/** Region lane (screens gate on it; components record it). */
	failingTiles?: number
	worstTileScore?: number
	worstTileColorDelta?: number
	tileFails?: TileFail[]
	/** Tiles excluded from the gate by ITEM_TILE_ALLOWLIST — recorded with their why, never hidden. */
	allowedTiles?: (TileFail & { why: string })[]
	/** Present ONLY when ITEM_REGION_LANE_ACCEPTED waived this item's whole region lane (founder
	 *  acceptance) — tiles above are still measured and listed. */
	regionLaneAcceptedWhy?: string
	/** DOM audit (screens): raw interactive elements outside the catalog ([data-slot]-less). */
	rawInteractive?: string[]
	/** Present ONLY when ITEM_PASS[slug] froze this item (founder, "PASS até segunda ordem") — the
	 *  gate treats it as passing regardless of score/tiles/audit, but score/tiles/rawInteractive
	 *  above are still measured and reported normally. Nothing disappears from the radar. */
	frozen?: boolean
	frozenWhy?: string
	passing: boolean | null
	targetPng: string | null
	currentPng: string | null
	deltaPng: string | null
	error?: string
}

/**
 * Congelamento do founder ("PASS até segunda ordem", F3 2026-08-24): decide SÓ o campo `passing`
 * (+ `frozen`/`frozenWhy`) do scoreboard entry — nunca toca score, tiles ou rawInteractive, que o
 * chamador já mediu e continua reportando do mesmo jeito. Extraída pura (sem tocar Playwright/fs/
 * ITEM_PASS diretamente) para ser testável isolada de `main()`: o chamador faz o lookup em
 * `ITEM_PASS[item.slug]` e passa o resultado aqui junto do gate normal já calculado.
 */
export function resolveItemPass(
	frozen: { why: string } | undefined,
	computedPassing: boolean,
): { passing: boolean; frozen?: true; frozenWhy?: string } {
	if (frozen) return { passing: true, frozen: true, frozenWhy: frozen.why }
	return { passing: computedPassing }
}

function fidelityRelative(p: string): string {
	return relative(FIDELITY_ROOT, p).split('\\').join('/')
}

function writeScoreboard(entries: ScoreboardEntry[]): void {
	mkdirSync(FIDELITY_ROOT, { recursive: true })
	writeFileSync(SCOREBOARD_PATH, `${JSON.stringify({ generatedAt: new Date().toISOString(), entries }, null, 2)}\n`)
}

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function writeReport(entries: ScoreboardEntry[]): void {
	const rows =
		entries.length === 0
			? '<tr><td colspan="7">No fidelity-tagged stories yet — tag a story with <code>parameters.fidelity = { slug, kind }</code> to start measuring.</td></tr>'
			: entries
					.map(e => {
						const img = (src: string | null) => (src ? `<img src="${escapeHtml(src)}" width="160" loading="lazy">` : '—')
						const scoreLabel = e.score === null ? '—' : e.score.toFixed(4)
						const statusLabel = e.passing === true ? 'PASS' : e.passing === false ? 'FAIL' : e.status
						const frozenBadge = e.frozen
							? `<span title="${escapeHtml(e.frozenWhy ?? '')}" style="background:#2a5;color:#111;padding:2px 6px;border-radius:3px;font-weight:bold;">PASS — congelada (founder)</span>`
							: ''
						const lanes = [
							frozenBadge,
							`global ${scoreLabel} / ${e.threshold}`,
							e.failingTiles !== undefined ? `tiles ✗${e.failingTiles} (pior ${e.worstTileScore} · ΔE ${e.worstTileColorDelta})` : '',
							e.regionLaneAcceptedWhy ? `região ACEITA — ${escapeHtml(e.regionLaneAcceptedWhy)}` : '',
							e.rawInteractive?.length ? `crus: ${escapeHtml(e.rawInteractive.slice(0, 4).join(' · '))}` : '',
							e.frozen ? `congelada: ${escapeHtml(e.frozenWhy ?? '')}` : '',
						]
							.filter(Boolean)
							.join('<br>')
						return `<tr><td>${escapeHtml(e.slug)}</td><td>${e.kind}</td><td>${statusLabel}</td><td>${lanes}</td><td>${img(e.targetPng)}</td><td>${img(e.currentPng)}</td><td>${img(e.deltaPng)}</td></tr>`
					})
					.join('\n')

	const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>UI Fidelity Scoreboard</title>
<style>
  body { font-family: system-ui, sans-serif; background: #111; color: #eee; padding: 24px; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #333; padding: 8px; text-align: left; vertical-align: top; }
  img { max-width: 160px; display: block; background: #222; }
</style>
</head>
<body>
<h1>UI Fidelity Scoreboard</h1>
<p>Generated ${new Date().toISOString()} — worst score first. See docs/UI-FIDELITY.md "Pista 2".</p>
<table>
<thead><tr><th>Slug</th><th>Kind</th><th>Status</th><th>Score / Threshold</th><th>Target</th><th>Atual</th><th>Delta</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</body>
</html>
`
	mkdirSync(FIDELITY_ROOT, { recursive: true })
	writeFileSync(REPORT_PATH, html)
}

// ─── Static file server for the storybook-static build (no extra dep — Bun.serve + Bun.file) ──────

function makeStaticFetch(root: string) {
	return async (req: Request): Promise<Response> => {
		const url = new URL(req.url)
		let pathname = decodeURIComponent(url.pathname)
		if (pathname === '/' || pathname === '') pathname = '/index.html'
		const file = Bun.file(join(root, pathname))
		if (await file.exists()) return new Response(file)
		return new Response('Not found', { status: 404 })
	}
}

// ─── Main ────────────────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const items = [...(await discoverFidelityItems(REACT_SRC)), ...(await discoverFidelityItems(UI_SRC))].sort((a, b) =>
		a.slug.localeCompare(b.slug),
	)
	console.log(`fidelity: discovered ${items.length} fidelity-tagged stor${items.length === 1 ? 'y' : 'ies'}`)

	if (items.length === 0) {
		writeScoreboard([])
		writeReport([])
		console.log(
			`fidelity: no fidelity-tagged stories yet — wrote an empty ${fidelityRelative(SCOREBOARD_PATH)} / ${fidelityRelative(REPORT_PATH)}. ` +
				'Tag a story with `parameters.fidelity = { slug, kind }` to start measuring.',
		)
		return
	}

	console.log('fidelity: building storybook (nx run app-react:storybook-build)...')
	const build = Bun.spawnSync({
		cmd: ['bun', 'x', 'nx', 'run', 'app-react:storybook-build'],
		cwd: REPO_ROOT,
		stdout: 'inherit',
		stderr: 'inherit',
	})
	if (build.exitCode !== 0) throw new Error(`fidelity: storybook build failed (exit ${build.exitCode})`)
	if (!existsSync(STORYBOOK_STATIC))
		throw new Error(`fidelity: expected ${STORYBOOK_STATIC} after build — did the storybook-build target's output path change?`)

	// Validate every computed storyId against the REAL build (contrato antes de implementação — F3,
	// 2026-08-24). `storyId()` is a from-scratch reimplementation of Storybook's `toId`, not the
	// genuine article — a divergence between the two (see `splitWordBoundaries`'s docblock) makes
	// Playwright navigate to an id that 404s inside the iframe, which threw `NoStoryMatchError` and
	// surfaced as a silent empty-root screenshot instead of a named failure. Read the build's OWN
	// index once, and route any mismatch to a named `error` entry — never let it reach Playwright.
	const storybookIndexPath = join(STORYBOOK_STATIC, 'index.json')
	let storybookEntryIds: Set<string> | null = null
	if (existsSync(storybookIndexPath)) {
		const index = JSON.parse(readFileSync(storybookIndexPath, 'utf-8')) as { entries?: Record<string, unknown> }
		storybookEntryIds = new Set(Object.keys(index.entries ?? {}))
	} else {
		console.warn(`fidelity: ${storybookIndexPath} not found — skipping storyId validation against the build`)
	}

	const server = Bun.serve({ port: 0, fetch: makeStaticFetch(STORYBOOK_STATIC) })
	const baseUrl = `http://localhost:${server.port}`
	console.log(`fidelity: serving storybook-static at ${baseUrl}`)

	const { chromium } = await import('playwright')
	const browser = await chromium.launch()
	const entries: ScoreboardEntry[] = []

	try {
		for (const item of items) {
			try {
				if (storybookEntryIds && !storybookEntryIds.has(item.storyId)) {
					// Near-miss: every id the build actually has under the SAME title — the fastest way
					// to see whether this is a word-splitting bug (near-miss differs only by dashes) or a
					// genuinely wrong title/export.
					const titlePrefix = `${item.storyId.split('--')[0]}--`
					const nearMiss = [...storybookEntryIds].filter(id => id.startsWith(titlePrefix))
					entries.push({
						slug: item.slug,
						kind: item.kind,
						storyId: item.storyId,
						status: 'error',
						score: null,
						threshold: THRESHOLD[item.kind],
						passing: null,
						targetPng: null,
						currentPng: null,
						deltaPng: null,
						error: `storyId "${item.storyId}" not found in storybook-static/index.json — near-miss (same title prefix "${titlePrefix}"): ${nearMiss.length > 0 ? nearMiss.join(', ') : '(none)'}`,
					})
					continue
				}
				const page = await browser.newPage({ viewport: item.viewport })
				// `networkidle` is an optimization, not a precondition: some fidelity stories (e.g.
				// `screen-3-inicio-carregando`'s `loadingQuery` mock) intentionally keep a request
				// pending forever to render a loading state, so `networkidle` never resolves and the
				// `goto` call times out even though the page has already loaded and painted — `load`
				// fires long before `networkidle` gives up. On timeout, don't re-navigate: settle with
				// the same fixed wait `probe-geometry.ts` uses and move on.
				try {
					await page.goto(`${baseUrl}/iframe.html?id=${item.storyId}&viewMode=story`, { waitUntil: 'networkidle' })
				} catch {
					await page.waitForTimeout(1200)
				}
				const currentDir = join(CURRENT_DIR, item.kind)
				mkdirSync(currentDir, { recursive: true })
				const currentPng = join(currentDir, `${item.slug}.png`)
				// Screenshot the COMPONENT, not the container: `#storybook-root` is a full-width block
				// div, so shooting it turns a 115×45 button into an 800×45 strip — a guaranteed
				// dimension mismatch (score 0) against the tight-cropped Pencil target. When the story
				// renders exactly one element child (the component-story canon), shoot that child's
				// bounding box; multi-child/empty stories fall back outward (root, then viewport).
				// `kind: 'screens'` stories keep the root shot — screen targets are full-frame 1440×900.
				// `omitBackground: true` on the components path: every Pencil-exported component target
				// has a transparent canvas (corner alpha 0), and preview.tsx forces the iframe body
				// transparent for these stories — without this flag Playwright still fills the capture
				// with an opaque white backdrop, diffing against the target's real transparency.
				const root = page.locator('#storybook-root')
				const child = root.locator('> *')
				// animations: 'disabled' on all three call sites — wave A's first batch run hit
				// 17/35 `screenshot: Timeout 30000ms` on skeleton-pulse/spinner/wizard-transition
				// stories: Playwright's screenshot waits for visual stability, which an infinite
				// CSS animation never reaches. Finite transitions jump to their end state; infinite
				// ones are canceled — the capture becomes deterministic either way.
				if (item.kind === 'components' && (await child.count()) === 1) {
					try {
						await child.first().screenshot({ path: currentPng, omitBackground: true, animations: 'disabled' })
					} catch {
						// Element-screenshot waits for visibility AND stability; `animations: 'disabled'` only
						// freezes CSS animations, so a component driven by continuous JS re-render (SSE retry
						// loop, polling timer) can still hit the 30s stability timeout. Fall back to a CLIP
						// capture (grabs the current frame without waiting for stability) — this loses the
						// transparent-canvas trim `omitBackground` gave us, hence the warn.
						console.warn(
							`fidelity: element screenshot timed out for "${item.slug}" — falling back to clip capture (no omitBackground)`,
						)
						const box = await child.first().boundingBox()
						if (box) {
							await page.screenshot({ path: currentPng, clip: box, animations: 'disabled' })
						} else {
							await page.screenshot({ path: currentPng, animations: 'disabled' })
						}
					}
				} else if ((await root.count()) > 0) {
					// CLIP capture, not `root.screenshot()`: an element screenshot waits for the element to
					// be visible AND stable (no layout/paint change across consecutive frames). Several
					// screens re-render continuously from JS (SSE reconnect retries in the fidelity harness,
					// polling timers) and never settle, so `root.screenshot()` hit Playwright's 30s
					// stability timeout even with `animations: 'disabled'` (that flag only covers CSS
					// animations, not JS-driven re-renders). `page.screenshot({ clip })` grabs the current
					// frame without waiting for stability — deterministic enough because the visible content
					// is static; only background wiring (retry timers) keeps re-rendering off-screen.
					const box = await root.boundingBox()
					if (box) {
						await page.screenshot({ path: currentPng, clip: box, animations: 'disabled' })
					} else {
						await page.screenshot({ path: currentPng, animations: 'disabled' })
					}
				} else {
					await page.screenshot({ path: currentPng, animations: 'disabled' })
				}
				// DOM audit (screens): every interactive surface must come from the replicated catalog
				// — a raw <input>/<button>/<select>/<textarea> with no [data-slot] on itself or any
				// ancestor is a hand-rolled control the pixel lanes can even score GREEN (the founder
				// flagged ext-08 exactly this way). Structural, so it cannot be diluted.
				let rawInteractive: string[] = []
				if (item.kind === 'screens') {
					rawInteractive = await page.evaluate(() => {
						const out: string[] = []
						for (const el of document.querySelectorAll(
							'#storybook-root input, #storybook-root textarea, #storybook-root select, #storybook-root button',
						)) {
							if (!el.closest('[data-slot]')) {
								const label = (el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? el.textContent ?? '').trim().slice(0, 40)
								out.push(`${el.tagName.toLowerCase()}${label ? `: ${label}` : ''}`)
							}
						}
						return out
					})
				}
				await page.close()

				const targetPng = join(TARGETS_DIR, item.kind, `${item.slug}.png`)
				if (!existsSync(targetPng)) {
					entries.push({
						slug: item.slug,
						kind: item.kind,
						storyId: item.storyId,
						status: 'no-target',
						score: null,
						threshold: THRESHOLD[item.kind],
						passing: null,
						targetPng: null,
						currentPng: fidelityRelative(currentPng),
						deltaPng: null,
					})
					continue
				}

				const deltaDir = join(DELTAS_DIR, item.kind)
				mkdirSync(deltaDir, { recursive: true })
				const deltaPng = join(deltaDir, `${item.slug}.png`)
				// Components use a TIGHTER per-pixel color threshold than screens: subtle-but-spec'd
				// effects (a $white-a21 hairline ring on a dark surface, a faint radial fill) sit close
				// to the background in YIQ distance — at pixelmatch's default 0.1 a MISSING ring still
				// scored ~0.99 (measured W1a: every ring was invisible and no component score noticed).
				// Screens keep 0.1: full-frame shots carry AA/scroll noise a tight threshold would inflate.
				const { score, tiles } = computeScore(targetPng, currentPng, deltaPng, item.kind === 'components' ? 0.05 : 0.1)
				const { threshold, why } = itemThreshold(item)
				// Screens pass by THREE lanes (calibração 2026-08-21, exemplos do founder como ground
				// truth): média global ≥ threshold E nenhum tile falhando (estrutura OU cor) E nenhum
				// controle interativo cru. Components seguem só na média (já medem a 0.05 sobre
				// tight-crop — o item inteiro É a região).
				const allow = ITEM_TILE_ALLOWLIST[item.slug] ?? []
				const allowedTiles = tiles.failing.filter(t => allow.some(a => a.x === t.x && a.y === t.y))
				const gatedTiles = tiles.failing.filter(t => !allow.some(a => a.x === t.x && a.y === t.y))
				const regionAccepted = ITEM_REGION_LANE_ACCEPTED[item.slug]
				const regionPass = item.kind === 'screens' ? regionAccepted !== undefined || gatedTiles.length === 0 : true
				const auditPass = rawInteractive.length === 0
				const { passing, frozen, frozenWhy } = resolveItemPass(ITEM_PASS[item.slug], score >= threshold && regionPass && auditPass)
				entries.push({
					slug: item.slug,
					kind: item.kind,
					storyId: item.storyId,
					status: 'scored',
					score,
					threshold,
					...(why ? { thresholdWhy: why } : {}),
					failingTiles: gatedTiles.length,
					worstTileScore: tiles.worstScore,
					worstTileColorDelta: tiles.worstColorDelta,
					...(gatedTiles.length > 0 ? { tileFails: gatedTiles.slice(0, 20) } : {}),
					...(allowedTiles.length > 0
						? { allowedTiles: allowedTiles.map(t => ({ ...t, why: allow.find(a => a.x === t.x && a.y === t.y)?.why ?? '' })) }
						: {}),
					...(rawInteractive.length > 0 ? { rawInteractive } : {}),
					...(regionAccepted ? { regionLaneAcceptedWhy: regionAccepted.why } : {}),
					...(frozen ? { frozen, frozenWhy } : {}),
					passing,
					targetPng: fidelityRelative(targetPng),
					currentPng: fidelityRelative(currentPng),
					deltaPng: fidelityRelative(deltaPng),
				})
			} catch (err) {
				entries.push({
					slug: item.slug,
					kind: item.kind,
					storyId: item.storyId,
					status: 'error',
					score: null,
					threshold: THRESHOLD[item.kind],
					passing: null,
					targetPng: null,
					currentPng: null,
					deltaPng: null,
					error: err instanceof Error ? err.message : String(err),
				})
			}
		}
	} finally {
		await browser.close()
		server.stop()
	}

	entries.sort((a, b) => (a.score ?? -1) - (b.score ?? -1))
	writeScoreboard(entries)
	writeReport(entries)
	console.log(`fidelity: wrote ${fidelityRelative(SCOREBOARD_PATH)} and ${fidelityRelative(REPORT_PATH)} (${entries.length} item(s))`)
}

if (import.meta.main) {
	main().catch(err => {
		console.error(err)
		process.exit(1)
	})
}
