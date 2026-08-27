/**
 * DOMSnapshot → native SVG converter (pipeline architecture).
 *
 * Each DOM element passes through rendering stages:
 *   1. Shadow    → <filter><feDropShadow>
 *   2. Background → <rect fill> (solid + gradient layers, respecting background-clip)
 *   3. Border    → <rect stroke> (solid or gradient-as-border via double trick)
 *   4. Text      → <text> with font properties, wrapping, gradient fills
 *   5. SVG icons → <path>/<circle> pass-through with <defs>, currentColor resolution
 *   6. Clip      → <clipPath> for overflow:hidden
 *
 * Usage:
 *   bun e2e/scripts/generate-svg.ts <recording-dir>              # all frames → svg/
 *   bun e2e/scripts/generate-svg.ts <recording-dir> --frame 30   # single frame
 */

import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

// ── Types ────────────────────────────────────────────────

interface Snapshot {
	strings: string[]
	documents: [{ nodes: Nodes; layout: Layout }]
}
interface Nodes {
	nodeType: number[]
	nodeName: number[]
	parentIndex: number[]
	attributes: number[][]
}
interface Layout {
	nodeIndex: number[]
	bounds: number[][]
	styles: number[][]
	text: number[]
}
interface FrameEntry {
	index: number
	cursorX: number
	cursorY: number
}
interface ColorStop {
	color: string
	offset: number
}

/** Map of original URL → data URI for image inlining at generation time. */
type ImageMap = Record<string, string>

interface RenderContext {
	strings: string[]
	nodes: Nodes
	layout: Layout
	props: string[]
	nodeToLayout: Map<number, number>
	childrenMap: Map<number, number[]>
	colorCache: Map<string, string>
	fontMetrics: Map<string, FontMetrics>
	cursorSvg: string
	fontDefs: string
	imageMap: ImageMap
}

interface RenderState {
	filterId: number
	elements: string[]
	overlayElements: string[]
	renderingOverlay: boolean
}

/** Per-corner border radii */
interface CornerRadii {
	tl: number
	tr: number
	bl: number
	br: number
}

/** Per-side border widths */
interface SideWidths {
	top: number
	right: number
	bottom: number
	left: number
}

/** Extracted visual properties for a single element */
interface NodeVisuals {
	x: number
	y: number
	w: number
	h: number
	cs: Record<string, string>
	bgColor: string | null
	bgRgba: { r: number; g: number; b: number; a: number } | null
	hasBg: boolean
	bgImage: string
	bgClip: string
	isTextGradient: boolean
	isGradientBorder: boolean
	skipBg: boolean
	borderWidth: number
	borderColor: string | null
	borderStyle: string
	hasBorder: boolean
	borderRadius: number
	clampedRx: number
	rxAttr: string
	opacity: number
	/** Per-corner radii when corners differ */
	cornerRadii: CornerRadii
	hasVaryingRadii: boolean
	/** Per-side border widths when sides differ */
	sideWidths: SideWidths
	hasVaryingSides: boolean
}

// ── Constants ────────────────────────────────────────────

const SVG_CHILD_TAGS = new Set(['path', 'circle', 'line', 'polyline', 'polygon', 'ellipse'])
const SKIP_TAGS = new Set(['script', 'noscript', 'iframe', 'style', 'link', 'head', 'meta', 'title', 'html'])
const SKIP_BG_TAGS = new Set(['img', 'video', 'canvas', 'picture', 'source'])
const RECURSE_ONLY_TAGS = new Set(['html'])
const OVERLAY_ROLES = new Set(['listbox', 'dialog', 'menu', 'tooltip', 'alertdialog'])

// ── Color utilities ──────────────────────────────────────

function toRgb(val: string, cache: Map<string, string>): string | null {
	if (!val || val === 'none' || val === 'transparent' || val === 'rgba(0, 0, 0, 0)') return null
	if (val.startsWith('rgb')) return val
	return cache.get(val) || null
}

function parseRgba(rgb: string): { r: number; g: number; b: number; a: number } | null {
	const m = rgb?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
	if (!m) return null
	return { r: +m[1], g: +m[2], b: +m[3], a: m[4] ? +m[4] : 1 }
}

/** Font metrics: ascent ratio = fraction of em square above baseline */
interface FontMetrics {
	ascentRatio: number // 0..1, baseline position relative to em square top
}

/**
 * Resolve oklch colors, measure font metrics, AND download missing fonts
 * in a single browser session. All require a real browser.
 */
async function resolveWithBrowser(
	snapshots: Snapshot[],
	props: string[],
	fontNames: string[],
	missingFonts: string[],
): Promise<{ colorCache: Map<string, string>; fontMetrics: Map<string, FontMetrics>; downloadedFonts: Map<string, Map<number, string>> }> {
	const toResolve = new Set<string>()
	for (const snap of snapshots) {
		const { strings } = snap
		for (const styleArr of snap.documents[0].layout.styles) {
			for (let j = 0; j < styleArr.length && j < props.length; j++) {
				const val = strings[styleArr[j]]
				if (!val) continue
				// Standalone oklab/oklch/color() values
				if (!val.startsWith('rgb') && (val.startsWith('okl') || val.startsWith('color('))) toResolve.add(val)
				// Colors embedded inside gradient strings
				if (val.includes('gradient') && (val.includes('oklab') || val.includes('oklch') || val.includes('color('))) {
					for (const m of val.matchAll(/(?:oklab|oklch|color)\([^)]+\)/g)) toResolve.add(m[0])
				}
			}
		}
	}

	const colorCache = new Map<string, string>()
	const fontMetrics = new Map<string, FontMetrics>()
	const downloadedFonts = new Map<string, Map<number, string>>()

	const hasColors = toResolve.size > 0
	const hasFonts = fontNames.length > 0
	if (!hasColors && !hasFonts) return { colorCache, fontMetrics, downloadedFonts }

	if (hasColors) console.log(`Resolving ${toResolve.size} oklch/oklab colors...`)
	const browser = await chromium.launch()
	const page = await browser.newPage()

	// 1. Resolve oklch colors
	if (hasColors) {
		const keys = [...toResolve]
		const resolved = await page.evaluate((colors: string[]) => {
			const canvas = document.createElement('canvas')
			canvas.width = canvas.height = 1
			const ctx = canvas.getContext('2d')!
			return colors.map(val => {
				ctx.clearRect(0, 0, 1, 1)
				ctx.fillStyle = val
				ctx.fillRect(0, 0, 1, 1)
				const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
				return a < 255 ? `rgba(${r},${g},${b},${(a / 255).toFixed(3)})` : `rgb(${r},${g},${b})`
			})
		}, keys)
		for (let i = 0; i < keys.length; i++) colorCache.set(keys[i], resolved[i])
	}

	// 2. Download missing fonts from Google Fonts and measure metrics
	if (hasFonts) {
		for (const fontName of missingFonts) {
			const slug = fontName.replace(/\s+/g, '+')
			const weights = [300, 400, 500, 600, 700, 800]
			console.log(`  Downloading "${fontName}" from Google Fonts...`)
			const fontData = await page.evaluate(
				async ({ slug, weights }: { slug: string; weights: number[] }) => {
					const results: Record<number, string> = {}
					for (const weight of weights) {
						try {
							const cssUrl = `https://fonts.googleapis.com/css2?family=${slug}:wght@${weight}&display=swap`
							const cssResp = await fetch(cssUrl)
							const css = await cssResp.text()
							// Extract woff2 URL from the CSS (latin subset)
							const latinBlock = css.split('/* latin */').pop() || css
							const urlMatch = latinBlock.match(/url\(([^)]+\.woff2)\)/)
							if (!urlMatch) continue
							const fontResp = await fetch(urlMatch[1])
							const buf = await fontResp.arrayBuffer()
							const bytes = new Uint8Array(buf)
							let binary = ''
							for (const byte of bytes) binary += String.fromCharCode(byte)
							results[weight] = btoa(binary)
						} catch {}
					}
					return results
				},
				{ slug, weights },
			)
			const weightMap = new Map<number, string>()
			for (const [w, b64] of Object.entries(fontData)) {
				weightMap.set(Number(w), b64)
			}
			if (weightMap.size > 0) {
				downloadedFonts.set(fontName, weightMap)
				console.log(`    Got ${weightMap.size} weights: ${[...weightMap.keys()].join(', ')}`)
			}
		}

		// Load fonts into page for metrics measurement
		for (const fontName of fontNames) {
			const downloaded = downloadedFonts.get(fontName)
			if (downloaded) {
				const first = [...downloaded.values()][0]
				await page.evaluate(
					({ name, b64 }: { name: string; b64: string }) => {
						const style = document.createElement('style')
						style.textContent = `@font-face { font-family: '${name}'; src: url(data:font/woff2;base64,${b64}); }`
						document.head.appendChild(style)
						// Force font load
						document.fonts.load(`100px "${name}"`)
					},
					{ name: fontName, b64: first },
				)
				await page.waitForTimeout(500)
			}
		}

		const metrics = await page.evaluate((fonts: string[]) => {
			const canvas = document.createElement('canvas')
			canvas.width = 200
			canvas.height = 200
			const ctx = canvas.getContext('2d')!
			const results: Record<string, { ascentRatio: number }> = {}
			for (const font of fonts) {
				ctx.font = `100px "${font}", sans-serif`
				const tm = ctx.measureText('Hg')
				const ascent = tm.fontBoundingBoxAscent ?? tm.actualBoundingBoxAscent ?? 75
				const descent = tm.fontBoundingBoxDescent ?? tm.actualBoundingBoxDescent ?? 25
				const total = ascent + descent
				results[font] = { ascentRatio: total > 0 ? ascent / total : 0.75 }
			}
			return results
		}, fontNames)
		for (const [name, m] of Object.entries(metrics)) {
			fontMetrics.set(name, m)
			console.log(`  Font "${name}": ascent ratio = ${m.ascentRatio.toFixed(3)}`)
		}
	}

	await browser.close()
	return { colorCache, fontMetrics, downloadedFonts }
}

// ── Font name resolution ────────────────────────────────

/** Map Next.js hashed font names (e.g. __Nunito_eef148) to actual font family names */
function resolveRealFontName(cssFamily: string): string {
	// Extract base font name from Next.js hash pattern: __FontName_hash
	const m = cssFamily.match(/__(\w+?)_[a-f0-9]+/)
	if (m) return m[1] // e.g. "Nunito" from "__Nunito_eef148"
	return cssFamily.split(',')[0].replace(/['"]/g, '').trim()
}

/** Detect unique font families from snapshot data */
function detectFonts(snapshots: Snapshot[], props: string[]): string[] {
	const ffIdx = props.indexOf('font-family')
	if (ffIdx < 0) return ['Poppins']
	const raw = new Set<string>()
	for (const snap of snapshots) {
		for (const styleArr of snap.documents[0].layout.styles) {
			const v = snap.strings[styleArr[ffIdx]]
			if (v) raw.add(v)
		}
	}
	const resolved = new Set<string>()
	for (const family of raw) resolved.add(resolveRealFontName(family))
	return resolved.size > 0 ? [...resolved] : ['Poppins']
}

// ── Asset loaders ────────────────────────────────────────

function loadFontDefs(
	fontNames: string[],
	downloadedFonts: Map<string, Map<number, string>>,
): { fontDefs: string; missingFonts: string[] } {
	const nodeModulesDir = join(resolve(import.meta.dirname, '..', '..'), 'node_modules', '@fontsource')
	const faces: string[] = []
	const missingFonts: string[] = []

	for (const fontName of fontNames) {
		const fontSlug = fontName.toLowerCase()
		const fontsDir = join(nodeModulesDir, fontSlug, 'files')
		let found = false

		// 1. Try local @fontsource package
		try {
			const load = (weight: number) => {
				const path = join(fontsDir, `${fontSlug}-latin-${weight}-normal.woff`)
				return existsSync(path)
					? readFileSync(path)
					: existsSync(join(fontsDir, `${fontSlug}-latin-400-normal.woff`))
						? readFileSync(join(fontsDir, `${fontSlug}-latin-400-normal.woff`))
						: null
			}
			for (const w of [300, 400, 500, 600, 700, 800]) {
				const data = load(w)
				if (data) {
					faces.push(
						`@font-face { font-family: '${fontName}'; font-weight: ${w}; src: url(data:font/woff;base64,${data.toString('base64')}); }`,
					)
					found = true
				}
			}
		} catch {}

		// 2. Try downloaded fonts from browser session
		if (!found) {
			const downloaded = downloadedFonts.get(fontName)
			if (downloaded && downloaded.size > 0) {
				for (const [weight, b64] of downloaded) {
					faces.push(`@font-face { font-family: '${fontName}'; font-weight: ${weight}; src: url(data:font/woff2;base64,${b64}); }`)
				}
				found = true
			}
		}

		if (!found) missingFonts.push(fontName)
	}

	const fontDefs = faces.length > 0 ? `<defs><style>\n${faces.join('\n')}\n</style></defs>` : ''
	return { fontDefs, missingFonts }
}

function loadCursorSvg(): string {
	const path = join(resolve(import.meta.dirname, '..'), 'assets', 'cursors', 'default.svg')
	return readFileSync(path, 'utf-8')
		.replace(/<\?xml[^?]*\?>\s*/, '')
		.replace(/\sxmlns="[^"]*"/g, '')
}

// ── Snapshot parsing + node helpers ──────────────────────

function parseSnapshot(
	snap: Snapshot,
	props: string[],
	colorCache: Map<string, string>,
	fontMetrics: Map<string, FontMetrics>,
	fontDefs: string,
	cursorSvg: string,
	imageMap: ImageMap = {},
	expectedViewport = 1366,
): RenderContext {
	const { strings } = snap
	const { nodes, layout } = snap.documents[0]

	// Detect DPR from body bounds vs expected viewport and scale bounds to CSS pixels
	let bodyW = expectedViewport
	for (let i = 0; i < nodes.nodeName.length; i++) {
		if (strings[nodes.nodeName[i]]?.toUpperCase() === 'BODY') {
			for (let j = 0; j < layout.nodeIndex.length; j++) {
				if (layout.nodeIndex[j] === i) {
					bodyW = layout.bounds[j][2]
					break
				}
			}
			break
		}
	}
	const dpr = bodyW > expectedViewport * 1.5 ? Math.round(bodyW / expectedViewport) : 1
	if (dpr > 1) {
		console.log(`    DPR ${dpr} detected (${bodyW} → ${bodyW / dpr})`)
		for (let i = 0; i < layout.bounds.length; i++) {
			layout.bounds[i] = layout.bounds[i].map(v => v / dpr)
		}
	}

	const nodeToLayout = new Map<number, number>()
	for (let i = 0; i < layout.nodeIndex.length; i++) nodeToLayout.set(layout.nodeIndex[i], i)
	const childrenMap = new Map<number, number[]>()
	for (let i = 0; i < nodes.parentIndex.length; i++) {
		const p = nodes.parentIndex[i]
		if (p >= 0) {
			if (!childrenMap.has(p)) childrenMap.set(p, [])
			childrenMap.get(p)!.push(i)
		}
	}
	return { strings, nodes, layout, props, nodeToLayout, childrenMap, colorCache, fontMetrics, cursorSvg, fontDefs, imageMap }
}

function getStyle(ctx: RenderContext, nodeIdx: number): Record<string, string> {
	const li = ctx.nodeToLayout.get(nodeIdx)
	if (li === undefined) return {}
	const styleArr = ctx.layout.styles[li]
	const result: Record<string, string> = {}
	for (let j = 0; j < styleArr.length && j < ctx.props.length; j++) result[ctx.props[j]] = ctx.strings[styleArr[j]]
	return result
}

function getAttr(ctx: RenderContext, nodeIdx: number, name: string): string | undefined {
	const attrArr = ctx.nodes.attributes[nodeIdx] || []
	for (let i = 0; i < attrArr.length; i += 2) if (ctx.strings[attrArr[i]] === name) return ctx.strings[attrArr[i + 1]]
}

function hasAttr(ctx: RenderContext, nodeIdx: number, name: string): boolean {
	const attrArr = ctx.nodes.attributes[nodeIdx] || []
	for (let i = 0; i < attrArr.length; i += 2) if (ctx.strings[attrArr[i]] === name) return true
	return false
}

function esc(str: string): string {
	return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function emit(state: RenderState, svg: string) {
	if (state.renderingOverlay) state.overlayElements.push(svg)
	else state.elements.push(svg)
}

// ── Gradient parser (shared) ─────────────────────────────

function extractGradientBodies(bgImage: string): { type: 'linear' | 'radial'; body: string }[] {
	const results: { type: 'linear' | 'radial'; body: string }[] = []
	for (const type of ['linear', 'radial'] as const) {
		const prefix = `${type}-gradient(`
		let searchFrom = 0
		while (true) {
			const idx = bgImage.indexOf(prefix, searchFrom)
			if (idx < 0) break
			let depth = 0
			const start = idx + prefix.length
			for (let i = start; i < bgImage.length; i++) {
				if (bgImage[i] === '(') depth++
				else if (bgImage[i] === ')') {
					if (depth === 0) {
						results.push({ type, body: bgImage.substring(start, i) })
						break
					}
					depth--
				}
			}
			searchFrom = idx + prefix.length
		}
	}
	return results
}

function parseColorStops(body: string, colorCache?: Map<string, string>): ColorStop[] {
	// Resolve oklab/oklch/color() values to rgb before parsing
	let resolved = body
	if (colorCache) {
		resolved = body.replace(/(?:oklab|oklch|color)\([^)]+\)/g, match => colorCache.get(match) || match)
	}
	const raw: { color: string; offset: number | null }[] = []
	for (const m of resolved.matchAll(/(rgba?\([^)]+\))\s*([-\d.]+%|[-\d.]+px)?/g)) {
		let offset: number | null = null
		if (m[2]) offset = parseFloat(m[2].replace('px', '%'))
		raw.push({ color: m[1], offset })
	}
	if (raw.length < 2) return []
	if (raw[0].offset === null) raw[0].offset = 0
	if (raw[raw.length - 1].offset === null) raw[raw.length - 1].offset = 100
	for (let i = 1; i < raw.length - 1; i++) {
		if (raw[i].offset === null) {
			let next = i + 1
			while (next < raw.length && raw[next].offset === null) next++
			const step = (raw[next].offset! - raw[i - 1].offset!) / (next - i + 1)
			for (let j = i; j < next; j++) raw[j].offset = raw[i - 1].offset! + step * (j - i + 1)
		}
	}
	return raw as ColorStop[]
}

function interpolateColor(a: ColorStop, b: ColorStop, at: number): string {
	const t = (at - a.offset) / (b.offset - a.offset)
	const ca = parseRgba(a.color) || { r: 0, g: 0, b: 0, a: 1 }
	const cb = parseRgba(b.color) || { r: 0, g: 0, b: 0, a: 1 }
	const r = Math.round(ca.r + (cb.r - ca.r) * t),
		g = Math.round(ca.g + (cb.g - ca.g) * t)
	const bv = Math.round(ca.b + (cb.b - ca.b) * t),
		alpha = +(ca.a + (cb.a - ca.a) * t).toFixed(3)
	return alpha < 1 ? `rgba(${r},${g},${bv},${alpha})` : `rgb(${r},${g},${bv})`
}

function clampStops(stops: ColorStop[]): ColorStop[] {
	if (stops.length < 2) return stops
	const minOff = stops[0].offset,
		maxOff = stops[stops.length - 1].offset
	if (minOff >= 0 && maxOff <= 100) return stops
	const clamped: ColorStop[] = []
	if (minOff < 0) {
		for (let i = 0; i < stops.length - 1; i++) {
			if (stops[i].offset <= 0 && stops[i + 1].offset > 0) {
				clamped.push({ color: interpolateColor(stops[i], stops[i + 1], 0), offset: 0 })
				break
			}
		}
		if (clamped.length === 0) clamped.push({ color: stops[0].color, offset: 0 })
	}
	for (const s of stops) if (s.offset >= 0 && s.offset <= 100) clamped.push(s)
	if (maxOff > 100) {
		for (let i = stops.length - 1; i > 0; i--) {
			if (stops[i].offset >= 100 && stops[i - 1].offset < 100) {
				clamped.push({ color: interpolateColor(stops[i - 1], stops[i], 100), offset: 100 })
				break
			}
		}
		if (clamped[clamped.length - 1]?.offset !== 100) clamped.push({ color: stops[stops.length - 1].color, offset: 100 })
	}
	return clamped.length >= 2 ? clamped : stops
}

function stopsToSvg(stops: ColorStop[]): string {
	return stops
		.map(s => {
			const rgba = parseRgba(s.color)
			const op = rgba && rgba.a < 1 ? ` stop-opacity="${rgba.a}"` : ''
			const c = rgba ? `rgb(${rgba.r},${rgba.g},${rgba.b})` : s.color
			return `<stop offset="${Math.max(0, Math.min(100, s.offset))}%" stop-color="${c}"${op} />`
		})
		.join('')
}

function parseCssGradient(bgImage: string, state: RenderState, colorCache?: Map<string, string>): string | null {
	if (!bgImage || bgImage === 'none') return null
	const gradients = extractGradientBodies(bgImage)
	if (gradients.length === 0) return null
	const defs: string[] = [],
		urls: string[] = []
	for (const grad of gradients) {
		const stops = clampStops(parseColorStops(grad.body, colorCache))
		if (stops.length < 2) continue
		const id = `grad-${state.filterId++}`
		if (grad.type === 'linear') {
			let angle = 180
			const am = grad.body.match(/^([-\d.]+)deg/)
			const dm = grad.body.match(/^to\s+(top|bottom|left|right)(?:\s+(top|bottom|left|right))?/)
			if (am) {
				angle = parseFloat(am[1])
			} else if (dm) {
				const dirs = [dm[1], dm[2]].filter(Boolean)
				if (dirs.length === 1) {
					angle = ({ top: 0, right: 90, bottom: 180, left: 270 } as Record<string, number>)[dirs[0]] ?? 180
				} else {
					const dy = dirs.reduce((a, d) => a + ({ top: -1, bottom: 1 }[d] || 0), 0)
					const dx = dirs.reduce((a, d) => a + ({ left: -1, right: 1 }[d] || 0), 0)
					angle = (Math.atan2(dx, -dy) * 180) / Math.PI
				}
			}
			const rad = (angle * Math.PI) / 180
			defs.push(
				`<linearGradient id="${id}" x1="${(50 - Math.sin(rad) * 50).toFixed(1)}%" y1="${(50 + Math.cos(rad) * 50).toFixed(1)}%" x2="${(50 + Math.sin(rad) * 50).toFixed(1)}%" y2="${(50 - Math.cos(rad) * 50).toFixed(1)}%">${stopsToSvg(stops)}</linearGradient>`,
			)
		} else {
			let cx = '50%',
				cy = '50%'
			const pm = grad.body.match(/circle\s+at\s+([-\d.]+%?)\s+([-\d.]+%?)/)
			if (pm) {
				cx = pm[1]
				cy = pm[2]
			}
			defs.push(`<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="70%" fx="${cx}" fy="${cy}">${stopsToSvg(stops)}</radialGradient>`)
		}
		urls.push(`url(#${id})`)
	}
	if (urls.length === 0) return null
	return `<defs>${defs.join('')}</defs>|${urls.join('|')}`
}

// ── Property extractors ──────────────────────────────────

function getBorderRadius(cs: Record<string, string>): number {
	const s = parseFloat(cs['border-radius'])
	if (s > 0) return s
	return Math.max(
		parseFloat(cs['border-top-left-radius']) || 0,
		parseFloat(cs['border-top-right-radius']) || 0,
		parseFloat(cs['border-bottom-left-radius']) || 0,
		parseFloat(cs['border-bottom-right-radius']) || 0,
	)
}
function getBorderWidth(cs: Record<string, string>): number {
	const s = parseFloat(cs['border-width'])
	if (s > 0) return s
	return parseFloat(cs['border-top-width']) || parseFloat(cs['border-left-width']) || 0
}
function getBorderColor(cs: Record<string, string>, cache: Map<string, string>): string | null {
	return toRgb(cs['border-color'], cache) || toRgb(cs['border-top-color'], cache) || toRgb(cs['border-left-color'], cache)
}
function getBorderStyle(cs: Record<string, string>): string {
	return cs['border-style'] || cs['border-top-style'] || 'none'
}

/** Extract all visual properties for a node into a typed struct */
function extractVisuals(ctx: RenderContext, nodeIdx: number, li: number, tagLower: string): NodeVisuals {
	const [x, y, w, h] = ctx.layout.bounds[li]
	const cs = getStyle(ctx, nodeIdx)
	const borderWidth = getBorderWidth(cs)
	const borderColor = getBorderColor(cs, ctx.colorCache)
	const borderStyle = getBorderStyle(cs)
	const borderRadius = getBorderRadius(cs)
	const clampedRx = borderRadius > 0 ? Math.min(borderRadius, h / 2, w / 2) : 0
	const bgColor = toRgb(cs['background-color'], ctx.colorCache)
	const bgRgba = bgColor ? parseRgba(bgColor) : null
	const bgClip = cs['background-clip'] || ''

	// Per-corner radii
	const cornerRadii: CornerRadii = {
		tl: parseFloat(cs['border-top-left-radius']) || 0,
		tr: parseFloat(cs['border-top-right-radius']) || 0,
		bl: parseFloat(cs['border-bottom-left-radius']) || 0,
		br: parseFloat(cs['border-bottom-right-radius']) || 0,
	}
	const hasVaryingRadii = cornerRadii.tl !== cornerRadii.tr || cornerRadii.tl !== cornerRadii.bl || cornerRadii.tl !== cornerRadii.br

	// Per-side border widths
	const sideWidths: SideWidths = {
		top: parseFloat(cs['border-top-width']) || 0,
		right: parseFloat(cs['border-right-width']) || 0,
		bottom: parseFloat(cs['border-bottom-width']) || 0,
		left: parseFloat(cs['border-left-width']) || 0,
	}
	const hasVaryingSides = sideWidths.top !== sideWidths.right || sideWidths.top !== sideWidths.bottom || sideWidths.top !== sideWidths.left

	return {
		x,
		y,
		w,
		h,
		cs,
		bgColor,
		bgRgba,
		hasBg: !!(bgRgba && bgRgba.a > 0),
		bgImage: cs['background-image'] || 'none',
		bgClip,
		isTextGradient: bgClip === 'text',
		isGradientBorder: bgClip.includes('padding-box') && borderStyle === 'double' && borderWidth > 0,
		skipBg: SKIP_BG_TAGS.has(tagLower),
		borderWidth,
		borderColor,
		borderStyle,
		hasBorder: borderWidth > 0 && !!borderColor && borderStyle !== 'none',
		borderRadius,
		clampedRx,
		rxAttr: clampedRx > 0 ? ` rx="${clampedRx}"` : '',
		opacity: parseFloat(cs.opacity) ?? 1,
		cornerRadii,
		hasVaryingRadii,
		sideWidths,
		hasVaryingSides,
	}
}

// ── 1. Shadow pipeline ───────────────────────────────────

/** Split a box-shadow string at top-level commas (not inside parentheses) */
function splitShadowParts(raw: string): string[] {
	const parts: string[] = []
	let depth = 0,
		start = 0
	for (let i = 0; i < raw.length; i++) {
		if (raw[i] === '(') depth++
		else if (raw[i] === ')') depth--
		else if (raw[i] === ',' && depth === 0) {
			parts.push(raw.substring(start, i).trim())
			start = i + 1
		}
	}
	parts.push(raw.substring(start).trim())
	return parts.filter(Boolean)
}

function renderShadow(ctx: RenderContext, state: RenderState, boxShadow: string): string {
	if (!boxShadow || boxShadow === 'none') return ''
	const filterIds: string[] = []
	for (const part of splitShadowParts(boxShadow)) {
		if (part.includes('inset')) continue
		// Match: color dx dy blur [spread]
		const m = part.match(/(rgba?\([^)]+\))\s+([-\d.]+)px\s+([-\d.]+)px\s+([-\d.]+)px(?:\s+([-\d.]+)px)?/)
		if (!m) continue
		const shadowColor = toRgb(m[1], ctx.colorCache)
		if (!shadowColor) continue
		const rgba = parseRgba(shadowColor)
		if (!rgba || rgba.a <= 0) continue
		const dx = +m[2],
			dy = +m[3],
			blur = +m[4],
			spreadVal = +(m[5] || 0)
		if (blur <= 0 && spreadVal <= 0) continue
		const fid = `shadow-${state.filterId++}`
		const extent = Math.max(blur * 2 + Math.abs(spreadVal) * 2, 30)
		if (spreadVal > 0 && blur <= 0) {
			// Spread-only shadow = solid outline glow (no blur)
			emit(
				state,
				`<defs><filter id="${fid}" x="-${extent}%" y="-${extent}%" width="${100 + extent * 2}%" height="${100 + extent * 2}%"><feDropShadow dx="${dx}" dy="${dy}" stdDeviation="${spreadVal / 2}" flood-color="${shadowColor}" /></filter></defs>`,
			)
		} else {
			emit(
				state,
				`<defs><filter id="${fid}" x="-${extent}%" y="-${extent}%" width="${100 + extent * 2}%" height="${100 + extent * 2}%"><feDropShadow dx="${dx}" dy="${dy}" stdDeviation="${(blur + spreadVal) / 2}" flood-color="${shadowColor}" /></filter></defs>`,
			)
		}
		filterIds.push(fid)
	}
	if (filterIds.length === 0) return ''
	if (filterIds.length === 1) return ` filter="url(#${filterIds[0]})"`
	// Fallback: just use the first (most prominent) shadow
	return ` filter="url(#${filterIds[0]})"`
}

function renderShadowFallback(state: RenderState, v: NodeVisuals, shadowFilter: string, hadGradient: boolean): void {
	if (!shadowFilter || v.hasBg || hadGradient || v.hasBorder) return
	emit(state, `<rect x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}"${v.rxAttr} fill="rgba(255,255,255,0.01)"${shadowFilter} />`)
}

/** Parse CSS filter property into SVG filter attribute */
function renderCssFilter(ctx: RenderContext, state: RenderState, cssFilter: string): string {
	if (!cssFilter || cssFilter === 'none') return ''
	const primitives: string[] = []

	// brightness(N) → feComponentTransfer (skip no-op brightness(1))
	const bm = cssFilter.match(/brightness\(([\d.]+)\)/)
	if (bm) {
		const slope = parseFloat(bm[1])
		if (Math.abs(slope - 1) > 0.01) {
			primitives.push(
				`<feComponentTransfer><feFuncR type="linear" slope="${slope}"/><feFuncG type="linear" slope="${slope}"/><feFuncB type="linear" slope="${slope}"/></feComponentTransfer>`,
			)
		}
	}

	// drop-shadow(color dx dy blur) → feDropShadow
	const dsm = cssFilter.match(/drop-shadow\((rgba?\([^)]+\))\s+([-\d.]+)px\s+([-\d.]+)px\s+([-\d.]+)px\)/)
	if (dsm) {
		const color = toRgb(dsm[1], ctx.colorCache) || dsm[1]
		const blur = parseFloat(dsm[4])
		if (blur > 0) {
			primitives.push(`<feDropShadow dx="${dsm[2]}" dy="${dsm[3]}" stdDeviation="${blur / 2}" flood-color="${color}" />`)
		}
	}

	// blur(Npx) → feGaussianBlur (skip no-op blur(0))
	const blm = cssFilter.match(/blur\(([\d.]+)px\)/)
	if (blm) {
		const blur = parseFloat(blm[1])
		if (blur > 0) {
			primitives.push(`<feGaussianBlur stdDeviation="${blur / 2}" />`)
		}
	}

	if (primitives.length === 0) return ''
	const fid = `cssf-${state.filterId++}`
	emit(state, `<defs><filter id="${fid}" x="-50%" y="-50%" width="200%" height="200%">${primitives.join('')}</filter></defs>`)
	return ` filter="url(#${fid})"`
}

// ── 1b. Mask-image pipeline ─────────────────────────────

/** Render CSS mask-image with inline SVG data URI as a filled path */
function renderMaskImage(_ctx: RenderContext, state: RenderState, v: NodeVisuals): boolean {
	const maskImage = v.cs['mask-image'] || v.cs['-webkit-mask-image']
	if (!maskImage?.includes('url(')) return false

	// Extract data URI — can't use [^"'] since SVG inside may contain quotes
	const urlMatch = maskImage.match(/url\(["']?(data:[^)]+)["']?\)/)
	if (!urlMatch) return false
	const dataUri = urlMatch[1].replace(/["']$/, '') // strip trailing quote if present

	// Decode the SVG from the data URI
	let svgContent: string
	if (dataUri.includes('base64,')) {
		svgContent = Buffer.from(dataUri.split('base64,')[1], 'base64').toString('utf-8')
	} else {
		// URL-encoded SVG
		const svgPart = dataUri.replace(/^data:image\/svg\+xml,/, '')
		svgContent = decodeURIComponent(svgPart)
	}

	// Extract viewBox from SVG
	const vbMatch = svgContent.match(/viewBox=['"]([^'"]+)['"]/)
	if (!vbMatch) return false
	const [, , vbW, vbH] = vbMatch[1].split(/[\s,]+/).map(Number)

	// Extract path d attribute(s)
	const paths: string[] = []
	for (const pm of svgContent.matchAll(/\bd=['"]([^'"]+)['"]/g)) {
		paths.push(pm[1])
	}
	if (paths.length === 0) return false

	// The fill color comes from the element's background-color (rgba carries alpha already)
	const fillColor = v.bgColor || 'rgb(255,255,255)'
	const opAttr = ''

	// Scale and translate to fit bounds
	const scaleX = v.w / vbW
	const scaleY = v.h / vbH
	const scale = Math.min(scaleX, scaleY)
	const offsetX = v.x + (v.w - vbW * scale) / 2
	const offsetY = v.y + (v.h - vbH * scale) / 2

	emit(state, `<g transform="translate(${offsetX}, ${offsetY}) scale(${scale.toFixed(4)})">`)
	for (const d of paths) {
		emit(state, `  <path d="${d}" fill="${fillColor}"${opAttr} />`)
	}
	emit(state, `</g>`)
	return true
}

// ── 2. Background pipeline ───────────────────────────────

function renderBackground(ctx: RenderContext, state: RenderState, v: NodeVisuals, shadowFilter: string): boolean {
	if (v.skipBg || v.isTextGradient) return false
	const { x, y, w, h, rxAttr } = v

	// Helper: emit a filled shape respecting per-corner radii
	const emitFilledRect = (fx: number, fy: number, fw: number, fh: number, fill: string, extra = '') => {
		if (v.hasVaryingRadii && (v.cornerRadii.tl > 0 || v.cornerRadii.tr > 0 || v.cornerRadii.bl > 0 || v.cornerRadii.br > 0)) {
			const pathD = roundedRectPath(fx, fy, fw, fh, v.cornerRadii)
			emit(state, `<path d="${pathD}" fill="${fill}"${extra} />`)
		} else {
			emit(state, `<rect x="${fx}" y="${fy}" width="${fw}" height="${fh}"${rxAttr} fill="${fill}"${extra} />`)
		}
	}

	// Solid color layer
	if (v.hasBg) {
		const fillOp = v.bgRgba!.a < 1 ? ` fill-opacity="${v.bgRgba!.a}"` : ''
		const fillColor = `rgb(${v.bgRgba!.r},${v.bgRgba!.g},${v.bgRgba!.b})`
		if (v.isGradientBorder) {
			const bw = v.borderWidth
			emitFilledRect(x + bw, y + bw, Math.max(0, w - bw * 2), Math.max(0, h - bw * 2), fillColor, `${fillOp}${shadowFilter}`)
		} else {
			emitFilledRect(x, y, w, h, fillColor, `${fillOp}${shadowFilter}`)
		}
	}

	// Gradient layers
	const gradResult = parseCssGradient(v.bgImage, state, ctx.colorCache)
	if (!gradResult) return false

	const parts = gradResult.split('|')
	const gradDefs = parts[0],
		gradUrls = parts.slice(1)
	emit(state, gradDefs)

	if (v.isGradientBorder && gradUrls.length >= 2) {
		// Single rect with gradient fill + gradient stroke (not two separate rects)
		const bw = v.borderWidth
		const gi = bw / 2
		const ix = x + gi,
			iy = y + gi,
			iw = Math.max(0, w - bw),
			ih = Math.max(0, h - bw)
		if (v.hasVaryingRadii && (v.cornerRadii.tl > 0 || v.cornerRadii.tr > 0 || v.cornerRadii.bl > 0 || v.cornerRadii.br > 0)) {
			const pathD = roundedRectPath(ix, iy, iw, ih, v.cornerRadii)
			emit(state, `<path d="${pathD}" fill="${gradUrls[0]}" stroke="${gradUrls[gradUrls.length - 1]}" stroke-width="${bw}" />`)
		} else {
			emit(
				state,
				`<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}"${rxAttr} fill="${gradUrls[0]}" stroke="${gradUrls[gradUrls.length - 1]}" stroke-width="${bw}" />`,
			)
		}
	} else if (v.isGradientBorder) {
		const bw = v.borderWidth
		const gi = bw / 2
		const ix = x + gi,
			iy = y + gi,
			iw = Math.max(0, w - bw),
			ih = Math.max(0, h - bw)
		for (const url of gradUrls) {
			if (v.hasVaryingRadii && (v.cornerRadii.tl > 0 || v.cornerRadii.tr > 0 || v.cornerRadii.bl > 0 || v.cornerRadii.br > 0)) {
				const pathD = roundedRectPath(ix, iy, iw, ih, v.cornerRadii)
				emit(state, `<path d="${pathD}" fill="none" stroke="${url}" stroke-width="${bw}" />`)
			} else {
				emit(state, `<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}"${rxAttr} fill="none" stroke="${url}" stroke-width="${bw}" />`)
			}
		}
	} else {
		for (const url of gradUrls) emitFilledRect(x, y, w, h, url, !v.hasBg ? shadowFilter : '')
	}
	return true
}

// ── 3. Border pipeline ───────────────────────────────────

/** Build SVG path data for a rounded rect with per-corner radii */
function roundedRectPath(x: number, y: number, w: number, h: number, r: CornerRadii): string {
	const tl = Math.min(r.tl, w / 2, h / 2)
	const tr = Math.min(r.tr, w / 2, h / 2)
	const br = Math.min(r.br, w / 2, h / 2)
	const bl = Math.min(r.bl, w / 2, h / 2)
	return `M${x + tl},${y} L${x + w - tr},${y} Q${x + w},${y} ${x + w},${y + tr} L${x + w},${y + h - br} Q${x + w},${y + h} ${x + w - br},${y + h} L${x + bl},${y + h} Q${x},${y + h} ${x},${y + h - bl} L${x},${y + tl} Q${x},${y} ${x + tl},${y} Z`
}

/** Get stroke-dasharray for border style */
function getDashArray(style: string, width: number): string {
	if (style === 'dashed') return ` stroke-dasharray="${Math.max(width * 3, 6)} ${Math.max(width * 2, 4)}"`
	if (style === 'dotted') return ` stroke-dasharray="${width} ${width * 2}"`
	return ''
}

function renderBorder(ctx: RenderContext, state: RenderState, v: NodeVisuals): void {
	// Skip when gradient border already handles the border via background-clip trick
	if (v.isGradientBorder) return
	if (!v.hasBorder && !v.hasVaryingSides) return

	const strokeOp = ''
	const dashArr = getDashArray(v.borderStyle, v.borderWidth)

	// CSS mask-image on bordered elements → SVG mask with gradient opacity
	const maskImage = v.cs['mask-image']
	let maskAttr = ''
	if (maskImage && maskImage !== 'none' && maskImage.includes('gradient')) {
		// CSS mask-image uses luminance: black=transparent, white=opaque
		// SVG mask also uses luminance the same way — but the CSS gradient uses
		// rgb(0,0,0) for opaque areas. We need to invert: map the alpha channel
		// of the mask gradient to white luminance values.
		// Strategy: create a white rect with the gradient's alpha as opacity.
		const gradBodies = extractGradientBodies(maskImage)
		if (gradBodies.length > 0) {
			const stops = parseColorStops(gradBodies[0].body, ctx.colorCache)
			if (stops.length >= 2) {
				const maskId = `mask-${state.filterId++}`
				const gradId = `mask-grad-${state.filterId++}`
				const bw = v.borderWidth
				// CSS mask-image uses alpha channel: alpha=1 → visible, alpha=0 → hidden
				// SVG mask uses luminance: white → visible, black → hidden
				// Convert: use white with the CSS color's alpha as stop-opacity
				const svgStops = stops
					.map(s => {
						const rgba = parseRgba(s.color)
						// For opaque colors (rgb), alpha is 1 → fully visible
						// For transparent colors (rgba with a<1), use that alpha
						const alpha = rgba?.a ?? 1
						return `<stop offset="${s.offset}%" stop-color="white" stop-opacity="${alpha.toFixed(3)}" />`
					})
					.join('')

				// Determine gradient direction
				let angle = 180
				const am = gradBodies[0].body.match(/^([-\d.]+)deg/)
				const dm = gradBodies[0].body.match(/^to\s+(top|bottom|left|right)/)
				if (am) angle = parseFloat(am[1])
				else if (dm) angle = ({ top: 0, right: 90, bottom: 180, left: 270 } as Record<string, number>)[dm[1]] ?? 180
				const rad = (angle * Math.PI) / 180

				emit(
					state,
					`<defs><linearGradient id="${gradId}" x1="${(50 - Math.sin(rad) * 50).toFixed(1)}%" y1="${(50 + Math.cos(rad) * 50).toFixed(1)}%" x2="${(50 + Math.sin(rad) * 50).toFixed(1)}%" y2="${(50 - Math.cos(rad) * 50).toFixed(1)}%">${svgStops}</linearGradient></defs>`,
				)
				emit(
					state,
					`<defs><mask id="${maskId}"><rect x="${v.x - bw}" y="${v.y - bw}" width="${v.w + bw * 2}" height="${v.h + bw * 2}" fill="url(#${gradId})" /></mask></defs>`,
				)
				maskAttr = ` mask="url(#${maskId})"`
			}
		}
	}
	if (maskAttr) emit(state, `<g${maskAttr}>`)

	// Per-side borders (different widths per side)
	// CSS borders are inside the box — inset lines so stroke is fully internal
	if (v.hasVaryingSides) {
		const { x, y, w, h } = v
		const sw = v.sideWidths
		const sides = [
			{ w: sw.top, x1: x, y1: y + sw.top / 2, x2: x + w, y2: y + sw.top / 2, colorProp: 'border-top-color', styleProp: 'border-top-style' },
			{
				w: sw.right,
				x1: x + w - sw.right / 2,
				y1: y,
				x2: x + w - sw.right / 2,
				y2: y + h,
				colorProp: 'border-right-color',
				styleProp: 'border-right-style',
			},
			{
				w: sw.bottom,
				x1: x,
				y1: y + h - sw.bottom / 2,
				x2: x + w,
				y2: y + h - sw.bottom / 2,
				colorProp: 'border-bottom-color',
				styleProp: 'border-bottom-style',
			},
			{
				w: sw.left,
				x1: x + sw.left / 2,
				y1: y,
				x2: x + sw.left / 2,
				y2: y + h,
				colorProp: 'border-left-color',
				styleProp: 'border-left-style',
			},
		]
		for (const side of sides) {
			if (side.w <= 0) continue
			const color = toRgb(v.cs[side.colorProp], ctx.colorCache) || v.borderColor
			if (!color) continue
			const sideStyle = v.cs[side.styleProp] || v.borderStyle
			if (sideStyle === 'none') continue
			const sDash = getDashArray(sideStyle, side.w)
			// rgba color already carries alpha — don't add separate stroke-opacity
			emit(
				state,
				`<line x1="${side.x1}" y1="${side.y1}" x2="${side.x2}" y2="${side.y2}" stroke="${color}" stroke-width="${side.w}"${sDash} />`,
			)
		}
		if (maskAttr) emit(state, '</g>')
		return
	}

	if (!v.hasBorder) {
		if (maskAttr) emit(state, '</g>')
		return
	}
	const bw = v.borderWidth

	// CSS borders are inside the element — position stroke so it's fully internal
	const inset = bw / 2
	if (v.hasVaryingRadii && (v.cornerRadii.tl > 0 || v.cornerRadii.tr > 0 || v.cornerRadii.bl > 0 || v.cornerRadii.br > 0)) {
		const pathD = roundedRectPath(v.x + inset, v.y + inset, Math.max(0, v.w - bw), Math.max(0, v.h - bw), v.cornerRadii)
		emit(state, `<path d="${pathD}" fill="none" stroke="${v.borderColor}" stroke-width="${bw}"${strokeOp}${dashArr} />`)
	} else {
		emit(
			state,
			`<rect x="${v.x + inset}" y="${v.y + inset}" width="${Math.max(0, v.w - bw)}" height="${Math.max(0, v.h - bw)}"${v.rxAttr} fill="none" stroke="${v.borderColor}" stroke-width="${bw}"${strokeOp}${dashArr} />`,
		)
	}
	if (maskAttr) emit(state, '</g>')
}

// ── 4. Text pipeline ─────────────────────────────────────

/** Resolve text fill color, handling background-clip:text gradient fills */
function resolveTextFill(ctx: RenderContext, state: RenderState, ps: Record<string, string>): string {
	let color = toRgb(ps.color, ctx.colorCache) || 'rgb(0,0,0)'
	if (ps['background-clip'] === 'text' && ps['background-image'] && ps['background-image'] !== 'none') {
		const gradResult = parseCssGradient(ps['background-image'], state, ctx.colorCache)
		if (gradResult) {
			const parts = gradResult.split('|')
			emit(state, parts[0])
			return parts[1]
		}
		const gradBodies = extractGradientBodies(ps['background-image'])
		if (gradBodies.length > 0) {
			const stops = parseColorStops(gradBodies[0].body)
			if (stops.length > 0) color = stops[0].color
		}
	}
	return color
}

function renderTextNode(ctx: RenderContext, state: RenderState, nodeIdx: number, li: number): void {
	if (ctx.layout.text[li] < 0) return
	const rawText = ctx.strings[ctx.layout.text[li]]
	if (!rawText) return
	// Preserve leading/trailing spaces — they're real inline whitespace (word gaps between spans)
	// Only skip completely empty strings
	const text = rawText.replace(/\n/g, ' ')
	if (!text || text.length === 0) return
	const [x, y, w, h] = ctx.layout.bounds[li]
	if (w < 1 || h < 1) return

	const parentIdx = ctx.nodes.parentIndex[nodeIdx]
	const ps = parentIdx >= 0 ? getStyle(ctx, parentIdx) : {}
	const fontSize = parseFloat(ps['font-size']) || 14
	const fontWeight = ps['font-weight'] || '400'
	const rawFontFamily = ps['font-family']?.split(',')[0]?.replace(/['"]/g, '').trim() || 'Poppins'
	const fontFamily = resolveRealFontName(rawFontFamily)
	const color = resolveTextFill(ctx, state, ps)
	// Don't read opacity from parent styles — the parent element already applies it
	// via <g opacity>. DOMSnapshot reports the parent's opacity on text node layouts,
	// so applying it here would double-compound it.
	const lineHeight = parseFloat(ps['line-height']) || fontSize * 1.4
	const letterSpacing = parseFloat(ps['letter-spacing']) || 0

	// Text alignment: use text-anchor for centered/right-aligned text
	// Only apply when this text node is the sole child of its parent (no inline siblings)
	const textAlign = ps['text-align'] || 'start'
	const parentLi = parentIdx >= 0 ? ctx.nodeToLayout.get(parentIdx) : undefined
	const [parentX, , parentW] = parentLi !== undefined ? ctx.layout.bounds[parentLi] : [x, y, w]
	const parentKids = parentIdx >= 0 ? ctx.childrenMap.get(parentIdx) || [] : []
	const isSoleChild = parentKids.length === 1

	let textX: number
	let anchorAttr = ''
	if (textAlign === 'center' && parentW > w * 1.2 && isSoleChild) {
		// Sole text child in a wide centered parent — use text-anchor middle
		textX = parentX + parentW / 2
		anchorAttr = ' text-anchor="middle"'
	} else if ((textAlign === 'right' || textAlign === 'end') && isSoleChild) {
		textX = parentX + parentW
		anchorAttr = ' text-anchor="end"'
	} else {
		textX = x // DOMSnapshot bounds are absolute — browser already applied text-align
	}

	// Font metrics: get ascent ratio from measured font data or fallback
	const metrics = ctx.fontMetrics.get(fontFamily)
	const ascentRatio = metrics?.ascentRatio ?? 0.75

	const avgCharWidth = fontSize * 0.52
	const lineCount = Math.max(1, Math.round(h / lineHeight))
	const needsWrap = lineCount >= 2 && text.length * avgCharWidth > w * 1.1

	// Baseline formula: the text box [y, h] includes line-height padding.
	// The em square is centered vertically within h, baseline sits at ascent within em.
	// baseline = y + (h - fontSize) / 2 + fontSize * ascentRatio
	const textY = !needsWrap ? y + (h - fontSize) / 2 + fontSize * ascentRatio : y + fontSize * ascentRatio

	const lsAttr = letterSpacing !== 0 ? ` letter-spacing="${letterSpacing}"` : ''
	// Preserve leading/trailing spaces in SVG (SVG collapses whitespace by default)
	const spaceAttr = text !== text.trim() ? ' xml:space="preserve"' : ''
	const fontAttrs = `font-family="${fontFamily}, sans-serif" font-size="${fontSize}" font-weight="${fontWeight}" fill="${color}"${lsAttr}${spaceAttr}${anchorAttr}`

	if (!needsWrap) {
		emit(state, `<text x="${textX}" y="${textY}" ${fontAttrs}>${esc(text)}</text>`)
		return
	}

	const charsPerLine = Math.max(1, Math.floor(w / avgCharWidth))
	const lines: string[] = []
	let currentLine = ''
	for (const word of text.split(' ')) {
		const test = currentLine ? `${currentLine} ${word}` : word
		if (test.length > charsPerLine && currentLine) {
			lines.push(currentLine)
			currentLine = word
		} else {
			currentLine = test
		}
	}
	if (currentLine) lines.push(currentLine)
	emit(
		state,
		`<text y="${textY}" ${fontAttrs}>${lines.map((l, i) => `<tspan x="${textX}" dy="${i === 0 ? 0 : lineHeight}">${esc(l)}</tspan>`).join('')}</text>`,
	)
}

function renderFormText(ctx: RenderContext, state: RenderState, nodeIdx: number, li: number, v: NodeVisuals, tagLower: string): void {
	if (tagLower === 'input' || tagLower === 'textarea') {
		const value = getAttr(ctx, nodeIdx, 'value'),
			placeholder = getAttr(ctx, nodeIdx, 'placeholder')
		const displayText = value || placeholder || ''
		if (!displayText) return
		const isPlaceholder = !value
		const color = isPlaceholder ? 'rgb(160,160,170)' : toRgb(v.cs.color, ctx.colorCache) || 'rgb(0,0,0)'
		const fontSize = parseFloat(v.cs['font-size']) || 14
		const fontFamily = resolveRealFontName(v.cs['font-family']?.split(',')[0]?.replace(/['"]/g, '').trim() || 'Poppins')
		emit(
			state,
			`<text x="${v.x + 10}" y="${v.y + v.h / 2 + fontSize * 0.35}" font-family="${fontFamily}, sans-serif" font-size="${fontSize}" fill="${color}"${isPlaceholder ? ' opacity="0.6"' : ''}>${esc(displayText)}</text>`,
		)
	} else if (tagLower === 'select' && ctx.layout.text[li] >= 0) {
		const text = ctx.strings[ctx.layout.text[li]]
		const fontSize = parseFloat(v.cs['font-size']) || 14
		const color = toRgb(v.cs.color, ctx.colorCache) || 'rgb(0,0,0)'
		emit(
			state,
			`<text x="${v.x + 10}" y="${v.y + v.h / 2 + fontSize * 0.35}" font-family="Poppins, sans-serif" font-size="${fontSize}" fill="${color}">${esc(text)}</text>`,
		)
	}
}

// ── 5. SVG icon pipeline ─────────────────────────────────

const SVG_TAG_CASE: Record<string, string> = {
	lineargradient: 'linearGradient',
	radialgradient: 'radialGradient',
	clippath: 'clipPath',
	fedropshadow: 'feDropShadow',
	feflood: 'feFlood',
	fegaussianblur: 'feGaussianBlur',
	feimage: 'feImage',
	femerge: 'feMerge',
	femergenode: 'feMergeNode',
	feoffset: 'feOffset',
	feblend: 'feBlend',
	fecolormatrix: 'feColorMatrix',
	fecomposite: 'feComposite',
	fecomponenttransfer: 'feComponentTransfer',
	feconvolvematrix: 'feConvolveMatrix',
	fediffuselighting: 'feDiffuseLighting',
	fedisplacementmap: 'feDisplacementMap',
	femorphology: 'feMorphology',
	fespecularlighting: 'feSpecularLighting',
	fetile: 'feTile',
	feturbulence: 'feTurbulence',
	gradientunits: 'gradientUnits',
	gradienttransform: 'gradientTransform',
	spreadmethod: 'spreadMethod',
	patternunits: 'patternUnits',
	patterntransform: 'patternTransform',
}
function fixSvgCase(tag: string): string {
	return SVG_TAG_CASE[tag] || tag
}
function fixColorAttr(name: string, val: string, parentColor?: string): string {
	if ((name === 'stop-color' || name === 'flood-color') && /^[0-9a-f]{3,8}$/i.test(val)) return `#${val}`
	if (val === 'currentColor' && parentColor) return parentColor
	return val
}

function renderDefsTree(ctx: RenderContext, nodeIdx: number, parentColor?: string): string {
	const rawTag = ctx.strings[ctx.nodes.nodeName[nodeIdx]]?.toLowerCase()
	if (!rawTag) return ''
	const tag = fixSvgCase(rawTag)
	const attrArr = ctx.nodes.attributes[nodeIdx] || []
	let attrs = ''
	for (let i = 0; i < attrArr.length; i += 2) {
		const n = ctx.strings[attrArr[i]],
			v = ctx.strings[attrArr[i + 1]]
		if (n && v !== undefined) attrs += ` ${fixSvgCase(n)}="${fixColorAttr(n, v, parentColor)}"`
	}
	const kids = ctx.childrenMap.get(nodeIdx) || []
	if (kids.length === 0) return `<${tag}${attrs} />`
	let inner = ''
	for (const kid of kids) inner += renderDefsTree(ctx, kid, parentColor)
	return `<${tag}${attrs}>${inner}</${tag}>`
}

/** Check if a color value is valid (not a broken template literal, JS expression, etc.) */
function isValidColor(val: string): boolean {
	if (!val) return false
	if (val.includes('${') || val.includes('props') || val.includes('=>')) return false
	if (val === 'none' || val === 'currentColor' || val === 'transparent' || val === 'inherit') return true
	if (val.startsWith('rgb') || val.startsWith('#') || val.startsWith('url(')) return true
	// Named colors
	if (/^[a-z]+$/i.test(val)) return true
	return false
}

function getSvgAttrs(ctx: RenderContext, nodeIdx: number, parentColor?: string, currentColorValue?: string): string {
	const passthrough = [
		'fill',
		'stroke',
		'stroke-width',
		'stroke-opacity',
		'stroke-linecap',
		'stroke-linejoin',
		'opacity',
		'fill-rule',
		'clip-rule',
		'fill-opacity',
		'transform',
	]
	let attrs = ''
	for (const name of passthrough) {
		let val = getAttr(ctx, nodeIdx, name)
		if (val === undefined) continue
		if (val === 'currentColor') val = currentColorValue || parentColor || 'currentColor'
		// Detect broken values (e.g. styled-components template literals)
		if ((name === 'fill' || name === 'stroke') && !isValidColor(val)) val = parentColor || 'none'
		attrs += ` ${name}="${val}"`
	}
	// If no fill attribute, inherit from parent SVG's fill/color (not default to none)
	if (!attrs.includes(' fill=')) attrs += ` fill="${parentColor || 'none'}"`
	return attrs
}

function renderSvgChildren(
	ctx: RenderContext,
	state: RenderState,
	parentIdx: number,
	parentColor?: string,
	currentColorValue?: string,
): void {
	for (const childIdx of ctx.childrenMap.get(parentIdx) || []) {
		const tag = ctx.strings[ctx.nodes.nodeName[childIdx]]?.toLowerCase()
		const a = (idx: number) => getSvgAttrs(ctx, idx, parentColor, currentColorValue)
		switch (tag) {
			case 'path': {
				const d = getAttr(ctx, childIdx, 'd')
				if (d) emit(state, `  <path d="${d}"${a(childIdx)} />`)
				break
			}
			case 'circle':
				emit(
					state,
					`  <circle cx="${getAttr(ctx, childIdx, 'cx') || 0}" cy="${getAttr(ctx, childIdx, 'cy') || 0}" r="${getAttr(ctx, childIdx, 'r') || 0}"${a(childIdx)} />`,
				)
				break
			case 'line':
				emit(
					state,
					`  <line x1="${getAttr(ctx, childIdx, 'x1') || 0}" y1="${getAttr(ctx, childIdx, 'y1') || 0}" x2="${getAttr(ctx, childIdx, 'x2') || 0}" y2="${getAttr(ctx, childIdx, 'y2') || 0}"${a(childIdx)} />`,
				)
				break
			case 'polyline': {
				const pts = getAttr(ctx, childIdx, 'points')
				if (pts) emit(state, `  <polyline points="${pts}"${a(childIdx)} />`)
				break
			}
			case 'rect':
				emit(
					state,
					`  <rect x="${getAttr(ctx, childIdx, 'x') || 0}" y="${getAttr(ctx, childIdx, 'y') || 0}" width="${getAttr(ctx, childIdx, 'width') || 0}" height="${getAttr(ctx, childIdx, 'height') || 0}"${a(childIdx)} />`,
				)
				break
			case 'defs':
				emit(state, renderDefsTree(ctx, childIdx, parentColor))
				break
			case 'g':
				emit(state, `<g${a(childIdx)}>`)
				renderSvgChildren(ctx, state, childIdx, parentColor, currentColorValue)
				emit(state, '</g>')
				break
			default:
				renderSvgChildren(ctx, state, childIdx, parentColor, currentColorValue)
		}
	}
}

function renderSvgElement(ctx: RenderContext, state: RenderState, nodeIdx: number): void {
	const li = ctx.nodeToLayout.get(nodeIdx)
	if (li === undefined) return
	const [sx, sy, sw, sh] = ctx.layout.bounds[li]
	const cs = getStyle(ctx, nodeIdx)
	const viewBox = getAttr(ctx, nodeIdx, 'viewBox')
	const vbParts = viewBox ? viewBox.split(/[\s,]+/).map(Number) : null
	const vbW = vbParts ? vbParts[2] : sw
	const vbH = vbParts ? vbParts[3] : sh
	// Use uniform scale based on min to preserve aspect ratio, then center
	const scaleX = sw / vbW
	const scaleY = sh / vbH
	const scale = Math.min(scaleX, scaleY)
	const offsetX = (sw - vbW * scale) / 2
	const offsetY = (sh - vbH * scale) / 2
	const scaleAttr = scale !== 1 ? ` scale(${scale.toFixed(4)})` : ''
	const resolvedColor = toRgb(cs.color, ctx.colorCache) || undefined

	// Resolve the SVG element's own fill attribute
	const rawSvgFill = getAttr(ctx, nodeIdx, 'fill')
	// fill="none" means explicitly no fill — stroke-only icon. Don't inherit.
	const svgExplicitNoFill = rawSvgFill === 'none'
	let svgFill = rawSvgFill
	if (svgFill === 'currentColor') svgFill = resolvedColor || undefined
	else if (svgFill === 'none' || !svgFill) svgFill = undefined
	// The color children should inherit: SVG fill > CSS color, but respect explicit fill="none"
	const inheritColor = svgExplicitNoFill ? undefined : svgFill || resolvedColor

	// Check if shape children have custom fills — if so, skip group stroke (would override path fills)
	// Only check actual shape elements (path, circle, etc.), not defs
	const kids = ctx.childrenMap.get(nodeIdx) || []
	const hasCustomFills = kids.some(k => {
		const t = ctx.strings[ctx.nodes.nodeName[k]]?.toLowerCase()
		if (!t || t === 'defs' || t === 'g') return false
		const f = getAttr(ctx, k, 'fill')
		return f && f !== 'none'
	})
	// If SVG element itself has a real fill (not "none") and children don't override, skip stroke
	const svgHasFill = svgFill && !svgExplicitNoFill && !hasCustomFills

	let strokeAttrs = ''
	if (!hasCustomFills && !svgHasFill) {
		const strokeColor = toRgb(cs.stroke, ctx.colorCache) || resolvedColor
		const strokeWidth = getAttr(ctx, nodeIdx, 'stroke-width') || '2'
		if (strokeColor) strokeAttrs = ` stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`
	}

	emit(state, `<g transform="translate(${sx + offsetX}, ${sy + offsetY})${scaleAttr}"${strokeAttrs}>`)
	renderSvgChildren(ctx, state, nodeIdx, inheritColor, resolvedColor)
	emit(state, '</g>')
}

// ── 6. Clip pipeline ─────────────────────────────────────

function openClipGroup(
	ctx: RenderContext,
	state: RenderState,
	cs: Record<string, string>,
	x: number,
	y: number,
	w: number,
	h: number,
	rxAttr: string,
	hasKids: boolean,
	kids: number[],
): boolean {
	const overflowX = cs['overflow-x'] || cs.overflow || 'visible'
	const overflowY = cs['overflow-y'] || cs.overflow || 'visible'
	const scrollableX = overflowX === 'scroll' || overflowX === 'auto'
	const scrollableY = overflowY === 'scroll' || overflowY === 'auto'
	const shouldClip =
		hasKids &&
		(overflowX === 'hidden' || overflowX === 'clip' || overflowY === 'hidden' || overflowY === 'clip' || scrollableX || scrollableY)
	if (!shouldClip) return false

	const clipId = `clip-${state.filterId++}`
	emit(state, `<defs><clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${w}" height="${h}"${rxAttr} /></clipPath></defs>`)
	emit(state, `<g clip-path="url(#${clipId})">`)

	// Scrollbar indicator: check if children overflow the container
	if (scrollableY) {
		let maxChildBottom = y
		for (const kidIdx of kids) {
			const kidLi = ctx.nodeToLayout.get(kidIdx)
			if (kidLi === undefined) continue
			const [, ky, , kh] = ctx.layout.bounds[kidLi]
			maxChildBottom = Math.max(maxChildBottom, ky + kh)
		}
		const contentH = maxChildBottom - y
		if (contentH > h * 1.05) {
			const trackX = x + w - 5
			const thumbH = Math.max(20, (h / contentH) * h)
			emit(state, `<rect x="${trackX}" y="${y}" width="4" height="${h}"${rxAttr ? ' rx="2"' : ''} fill="rgba(128,128,128,0.15)" />`)
			emit(state, `<rect x="${trackX}" y="${y}" width="4" height="${thumbH}" rx="2" fill="rgba(128,128,128,0.4)" />`)
		}
	}

	return true
}

// ── Stacking order ──────────────────────────────────────

/** Sort children by CSS stacking context: static elements first, then positioned/z-indexed on top */
function sortByStackingOrder(ctx: RenderContext, kids: number[]): number[] {
	if (kids.length <= 1) return kids
	return [...kids].sort((a, b) => {
		const aLi = ctx.nodeToLayout.get(a)
		const bLi = ctx.nodeToLayout.get(b)
		if (aLi === undefined || bLi === undefined) return 0
		const aCs = getStyle(ctx, a)
		const bCs = getStyle(ctx, b)
		const aPos = aCs.position || 'static'
		const bPos = bCs.position || 'static'
		const aPositioned = aPos === 'absolute' || aPos === 'fixed' || aPos === 'sticky'
		const bPositioned = bPos === 'absolute' || bPos === 'fixed' || bPos === 'sticky'
		// Static elements render before positioned elements
		if (aPositioned !== bPositioned) return aPositioned ? 1 : -1
		// Within same positioning group, sort by z-index
		const aZ = parseInt(aCs['z-index'], 10) || 0
		const bZ = parseInt(bCs['z-index'], 10) || 0
		if (aZ !== bZ) return aZ - bZ
		// Preserve DOM order as tiebreaker
		return 0
	})
}

// ── Node orchestrator ────────────────────────────────────

function renderNode(ctx: RenderContext, state: RenderState, nodeIdx: number, depth: number): void {
	if (depth > 40) return
	const nodeType = ctx.nodes.nodeType[nodeIdx]
	const li = ctx.nodeToLayout.get(nodeIdx)

	// Text node → text pipeline
	if (nodeType === 3) {
		if (li !== undefined) renderTextNode(ctx, state, nodeIdx, li)
		return
	}
	if (nodeType !== 1) return

	const tag = ctx.strings[ctx.nodes.nodeName[nodeIdx]]
	const tagLower = tag?.toLowerCase()
	if (!tag || SKIP_TAGS.has(tagLower)) {
		if (RECURSE_ONLY_TAGS.has(tagLower)) for (const kid of ctx.childrenMap.get(nodeIdx) || []) renderNode(ctx, state, kid, depth + 1)
		return
	}

	// No layout → still recurse (portal containers)
	if (li === undefined) {
		for (const kid of ctx.childrenMap.get(nodeIdx) || []) renderNode(ctx, state, kid, depth + 1)
		return
	}

	// SVG icon → icon pipeline
	if (tagLower === 'svg') {
		renderSvgElement(ctx, state, nodeIdx)
		return
	}
	if (SVG_CHILD_TAGS.has(tagLower)) return

	// Extract all visual properties
	const v = extractVisuals(ctx, nodeIdx, li, tagLower)
	if (v.w < 0.5) return
	const kids = ctx.childrenMap.get(nodeIdx) || []
	if (v.h < 0.5 && kids.length === 0) return
	if (v.cs.display === 'none' || v.cs.visibility === 'hidden') return

	// Overlay detection
	const role = getAttr(ctx, nodeIdx, 'role'),
		dataState = getAttr(ctx, nodeIdx, 'data-state')
	const isOverlay = (role && OVERLAY_ROLES.has(role)) || dataState === 'open' || hasAttr(ctx, nodeIdx, 'data-open')
	const wasOverlay = state.renderingOverlay
	if (isOverlay && !wasOverlay) state.renderingOverlay = true

	// Pipeline stages
	const needsOpacity = v.opacity < 1
	const cssFilterAttr = renderCssFilter(ctx, state, v.cs.filter) // 0. CSS filter
	const hasGroup = needsOpacity || !!cssFilterAttr
	if (hasGroup) emit(state, `<g${needsOpacity ? ` opacity="${v.opacity}"` : ''}${cssFilterAttr}>`)

	// Mask-image icons (e.g. chevron arrows via CSS mask) — skip normal bg pipeline
	const hasMask = renderMaskImage(ctx, state, v)

	const shadowFilter = renderShadow(ctx, state, v.cs['box-shadow']) // 1. Shadow
	const hadGradient = hasMask ? false : renderBackground(ctx, state, v, shadowFilter) // 2. Background
	renderBorder(ctx, state, v) // 3. Border
	renderShadowFallback(state, v, shadowFilter, hadGradient) // 4. Shadow fallback
	renderFormText(ctx, state, nodeIdx, li, v, tagLower) // 5. Form text

	// 5b. IMG elements — render images inline (data URIs or resolved URLs)
	if (tagLower === 'img') {
		let src = getAttr(ctx, nodeIdx, 'src')
		if (src && !src.startsWith('data:')) src = ctx.imageMap[src] ?? src
		if (src?.startsWith('data:')) {
			emit(
				state,
				`<image x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}"${v.rxAttr ? ` clip-path="inset(0 round ${v.clampedRx}px)"` : ''} href="${src}" />`,
			)
		}
	}

	// 6. Children (with optional clip), sorted by CSS stacking order
	const isClipped = openClipGroup(ctx, state, v.cs, v.x, v.y, v.w, v.h, v.rxAttr, kids.length > 0, kids)
	const sortedKids = sortByStackingOrder(ctx, kids)
	for (const kid of sortedKids) renderNode(ctx, state, kid, depth + 1)
	if (isClipped) emit(state, '</g>')

	if (hasGroup) emit(state, '</g>')
	if (isOverlay && !wasOverlay) state.renderingOverlay = false
}

// ── SVG assembly ─────────────────────────────────────────

function snapshotToSvg(snap: Snapshot, ctx: RenderContext, cursor?: { x: number; y: number }): string {
	const state: RenderState = { filterId: 0, elements: [], overlayElements: [], renderingOverlay: false }
	const { nodes } = snap.documents[0]
	let bodyIdx = -1
	for (let i = 0; i < nodes.nodeName.length; i++)
		if (ctx.strings[nodes.nodeName[i]]?.toUpperCase() === 'BODY') {
			bodyIdx = i
			break
		}
	if (bodyIdx < 0) return ''
	const bodyLi = ctx.nodeToLayout.get(bodyIdx)
	const viewW = bodyLi !== undefined ? ctx.layout.bounds[bodyLi][2] : 1366
	const viewH = bodyLi !== undefined ? ctx.layout.bounds[bodyLi][3] : 768
	// Check if the snapshot already has a demo cursor overlay (injected by createDemoCursor)
	const hasDemoCursor = ctx.strings.some(s => s === 'demo-cursor')

	state.elements.push(`<rect width="${viewW}" height="${viewH}" fill="white" />`)
	renderNode(ctx, state, bodyIdx, 0)
	// Only add the generator cursor if the DOM doesn't already contain one
	if (cursor && !hasDemoCursor)
		state.elements.push(
			`<g transform="translate(${cursor.x - 4}, ${cursor.y - 2})" opacity="0.95"><g transform="scale(1.2)">${ctx.cursorSvg}</g></g>`,
		)
	return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${Math.round(viewW)}" height="${Math.round(viewH)}" viewBox="0 0 ${Math.round(viewW)} ${Math.round(viewH)}">\n${ctx.fontDefs}\n${state.elements.join('\n')}\n${state.overlayElements.length > 0 ? `<!-- Overlays -->\n${state.overlayElements.join('\n')}` : ''}\n</svg>`
}

// ── CLI ──────────────────────────────────────────────────

const args = process.argv.slice(2)
const recordingDir = args.find(a => !a.startsWith('--'))
const frameArg = args.includes('--frame') ? Number(args[args.indexOf('--frame') + 1]) : null
const fpsArg = args.includes('--fps') ? Number(args[args.indexOf('--fps') + 1]) : null

if (!recordingDir || !existsSync(join(recordingDir, 'snapshots', 'meta.json'))) {
	console.error('Usage: bun e2e/scripts/generate-svg.ts <recording-dir> [--frame N] [--fps N]')
	process.exit(1)
}

const snapshotsDir = join(recordingDir, 'snapshots')
const cursorDir = join(recordingDir, 'cursor')
const outputDir = join(recordingDir, 'svg')

const meta = JSON.parse(readFileSync(join(snapshotsDir, 'meta.json'), 'utf-8'))
const props: string[] = meta.computedStyles || []
const frameMap: FrameEntry[] = JSON.parse(readFileSync(join(cursorDir, 'framemap.json'), 'utf-8'))

let framesToProcess: FrameEntry[]
if (frameArg !== null) {
	framesToProcess = frameMap.filter(f => f.index === frameArg)
} else if (fpsArg && fpsArg > 0) {
	// Downsample: pick every Nth frame to match target fps
	const sourceFps = meta.domFps || 30
	const step = Math.max(1, Math.round(sourceFps / fpsArg))
	framesToProcess = frameMap.filter((_, i) => i % step === 0)
	console.log(
		`Downsampling ${frameMap.length} frames at ${sourceFps}fps → ${framesToProcess.length} frames at ~${fpsArg}fps (every ${step}th)`,
	)
} else {
	framesToProcess = frameMap
}
if (framesToProcess.length === 0) {
	console.error(`Frame ${frameArg} not found`)
	process.exit(1)
}

const snapshotsToResolve = framesToProcess
	.map(f => {
		const p = join(snapshotsDir, `snapshot-${String(f.index).padStart(4, '0')}.json`)
		return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf-8')) as Snapshot) : null
	})
	.filter((s): s is Snapshot => s !== null)

const detectedFonts = detectFonts(snapshotsToResolve, props)
console.log(`Detected fonts: ${detectedFonts.join(', ')}`)

// First pass: check which fonts are available locally
const { missingFonts } = loadFontDefs(detectedFonts, new Map())
if (missingFonts.length > 0) console.log(`Missing locally: ${missingFonts.join(', ')} — will download from Google Fonts`)

// Browser session: resolve colors + download missing fonts + measure metrics
const { colorCache, fontMetrics, downloadedFonts } = await resolveWithBrowser(snapshotsToResolve, props, detectedFonts, missingFonts)

// Second pass: build font defs with downloaded fonts included
const { fontDefs } = loadFontDefs(detectedFonts, downloadedFonts)
const cursorSvg = loadCursorSvg()

// ── Resolve image URLs → data URIs (shared cache across all frames) ──

async function fetchAsDataUri(url: string): Promise<string | null> {
	try {
		const res = await fetch(url)
		if (!res.ok) return null
		const buf = Buffer.from(await res.arrayBuffer())
		const contentType = res.headers.get('content-type') || 'image/png'
		return `data:${contentType};base64,${buf.toString('base64')}`
	} catch {
		return null
	}
}

function collectImageUrls(snapshots: Snapshot[]): string[] {
	const urls = new Set<string>()
	for (const snap of snapshots) {
		const { strings } = snap
		const { nodes } = snap.documents[0]
		for (let i = 0; i < nodes.nodeName.length; i++) {
			if (strings[nodes.nodeName[i]]?.toLowerCase() !== 'img') continue
			const attrArr = nodes.attributes[i] || []
			for (let j = 0; j < attrArr.length; j += 2) {
				if (strings[attrArr[j]] === 'src') {
					const val = strings[attrArr[j + 1]]
					if (val && !val.startsWith('data:')) urls.add(val)
				}
			}
		}
	}
	return [...urls]
}

const allImageUrls = collectImageUrls(snapshotsToResolve)
const imageMap: ImageMap = {}
if (allImageUrls.length > 0) {
	console.log(`Resolving ${allImageUrls.length} image URL(s)...`)
	const results = await Promise.all(allImageUrls.map(async url => ({ url, dataUri: await fetchAsDataUri(url) })))
	for (const { url, dataUri } of results) {
		if (dataUri) imageMap[url] = dataUri
	}
	const resolved = Object.keys(imageMap).length
	if (resolved < allImageUrls.length) console.log(`  ${allImageUrls.length - resolved} image(s) could not be fetched`)
}

// ── Generate SVGs ───────────────────────────────────────

mkdirSync(outputDir, { recursive: true })
console.log(`Converting ${framesToProcess.length} snapshot(s) → SVG...`)

for (let i = 0; i < framesToProcess.length; i++) {
	const frame = framesToProcess[i]
	const snapPath = join(snapshotsDir, `snapshot-${String(frame.index).padStart(4, '0')}.json`)
	if (!existsSync(snapPath)) continue
	const snap = JSON.parse(readFileSync(snapPath, 'utf-8')) as Snapshot
	const ctx = parseSnapshot(snap, props, colorCache, fontMetrics, fontDefs, cursorSvg, imageMap)
	const svg = snapshotToSvg(snap, ctx, { x: frame.cursorX, y: frame.cursorY })
	writeFileSync(join(outputDir, `frame-${String(frame.index).padStart(4, '0')}.svg`), svg)
	if ((i + 1) % 50 === 0 || i === framesToProcess.length - 1) console.log(`  ${i + 1}/${framesToProcess.length}`)
}
console.log(`Done! ${framesToProcess.length} SVGs → ${outputDir}/`)
