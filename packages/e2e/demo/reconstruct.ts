/**
 * DOMSnapshot → HTML reconstruction (pure logic, zero I/O).
 *
 * Shared between:
 *   - e2e/scripts/generate-html.ts (CLI, Node/Bun)
 *   - e2e/extension/ (Chrome extension, browser)
 *
 * Port of the original generate-html.ts with all I/O removed.
 */

// ── Types ────────────────────────────────────────────────

export interface Snapshot {
	strings: string[]
	documents: [
		{
			nodes: { nodeType: number[]; nodeName: number[]; parentIndex: number[]; attributes: number[][] }
			layout: { nodeIndex: number[]; bounds: number[][]; styles: number[][]; text: number[] }
		},
	]
}

export interface FrameEntry {
	index: number
	cursorX: number
	cursorY: number
}

/** Map of original URL → data URI, used to inline images at generation time. */
export type ImageMap = Record<string, string>

interface RenderContext {
	strings: string[]
	nodes: Snapshot['documents'][0]['nodes']
	layout: Snapshot['documents'][0]['layout']
	computedStyles: string[]
	nodeToLayout: Map<number, number>
	childrenMap: Map<number, number[]>
	dpr: number
	imageMap: ImageMap
}

// ── Constants ────────────────────────────────────────────

const SKIP_TAGS = new Set(['script', 'noscript', 'iframe', '::before', '::after'])
const SKIP_BAKE = new Set(['html', 'head', 'meta', 'title', 'style', 'link'])
const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'col', 'embed', 'source', 'track', 'wbr'])

const SKIP_PROPS = new Set([
	'content',
	'counter-increment',
	'counter-reset',
	'counter-set',
	'animation',
	'animation-name',
	'animation-play-state',
	'animation-duration',
	'animation-delay',
	'animation-iteration-count',
	'animation-direction',
	'animation-fill-mode',
	'animation-timing-function',
	'transition',
	'transition-property',
	'transition-duration',
	'transition-delay',
	'transition-timing-function',
])

const SKIP_VALUES = new Set([
	'none',
	'normal',
	'auto',
	'transparent',
	'rgba(0, 0, 0, 0)',
	'0px',
	'0s',
	'start',
	'baseline',
	'stretch',
	'visible',
	'static',
	'repeat',
	'scroll',
	'border-box',
	'padding-box',
	'content-box',
	'separate',
	'flat',
	'running',
	'ease',
	'medium',
	'currentcolor',
])

// ── Helpers ──────────────────────────────────────────────

function esc(str: string): string {
	return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function detectDpr(snapshot: Snapshot, expectedWidth = 1366): number {
	const { nodes, layout } = snapshot.documents[0]
	for (let i = 0; i < nodes.nodeName.length; i++) {
		if (snapshot.strings[nodes.nodeName[i]]?.toUpperCase() === 'BODY') {
			for (let j = 0; j < layout.nodeIndex.length; j++) {
				if (layout.nodeIndex[j] === i) {
					const bodyW = layout.bounds[j][2]
					return bodyW > expectedWidth * 1.5 ? Math.round(bodyW / expectedWidth) : 1
				}
			}
		}
	}
	return 1
}

function shouldBakeValue(prop: string, val: string): boolean {
	if (!val) return false
	if (SKIP_PROPS.has(prop)) return false
	if (SKIP_VALUES.has(val.toLowerCase())) return false
	if (val === '0') return false
	return true
}

// ── Parsing ─────────────────────────────────────────────

function parseSnapshot(snapshot: Snapshot, computedStyles: string[], imageMap: ImageMap = {}): RenderContext {
	const { strings } = snapshot
	const { nodes, layout } = snapshot.documents[0]

	const dpr = detectDpr(snapshot)
	if (dpr > 1) {
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

	return { strings, nodes, layout, computedStyles, nodeToLayout, childrenMap, dpr, imageMap }
}

// ── Rendering ───────────────────────────────────────────

function getStyle(ctx: RenderContext, nodeIdx: number): string {
	const li = ctx.nodeToLayout.get(nodeIdx)
	if (li === undefined) return ''
	const styleArr = ctx.layout.styles[li]
	let result = ''
	for (let j = 0; j < styleArr.length && j < ctx.computedStyles.length; j++) {
		const prop = ctx.computedStyles[j]
		const val = ctx.strings[styleArr[j]]
		if (shouldBakeValue(prop, val)) {
			result += `${prop}:${val};`
		}
	}
	return result
}

function renderTextNode(ctx: RenderContext, _nodeIdx: number, li: number): string {
	if (ctx.layout.text[li] < 0) return ''
	const text = ctx.strings[ctx.layout.text[li]]
	return text ? esc(text) : ''
}

function renderElement(ctx: RenderContext, nodeIdx: number, depth: number): string {
	if (depth > 50) return ''

	const tag = ctx.strings[ctx.nodes.nodeName[nodeIdx]]?.toLowerCase()
	if (!tag || SKIP_TAGS.has(tag)) return ''

	const attrArr = ctx.nodes.attributes[nodeIdx] || []
	let attrs = ''
	let origStyle = ''
	for (let i = 0; i < attrArr.length; i += 2) {
		const name = ctx.strings[attrArr[i]]
		let val = ctx.strings[attrArr[i + 1]] || ''
		if (name === 'style') {
			origStyle = val
			continue
		}
		// Resolve image src through imageMap (URL → data URI)
		if (name === 'src' && tag === 'img' && val && !val.startsWith('data:')) {
			val = ctx.imageMap[val] ?? val
		}
		attrs += ` ${name}="${esc(val)}"`
	}

	const computedStyle = SKIP_BAKE.has(tag) ? '' : getStyle(ctx, nodeIdx)
	const fullStyle = origStyle + (computedStyle ? `;${computedStyle}` : '')
	if (fullStyle) attrs += ` style="${esc(fullStyle)}"`

	if (VOID_TAGS.has(tag)) return `<${tag}${attrs}>`

	const childHtml = (ctx.childrenMap.get(nodeIdx) || []).map(c => renderNode(ctx, c, depth + 1)).join('')
	return `<${tag}${attrs}>${childHtml}</${tag}>`
}

function renderNode(ctx: RenderContext, nodeIdx: number, depth: number): string {
	const nodeType = ctx.nodes.nodeType[nodeIdx]
	const li = ctx.nodeToLayout.get(nodeIdx)

	if (nodeType === 3) return li !== undefined ? renderTextNode(ctx, nodeIdx, li) : ''
	if (nodeType === 10) return '<!DOCTYPE html>'
	if (nodeType === 1) return renderElement(ctx, nodeIdx, depth)

	return ''
}

// ── Public API ──────────────────────────────────────────

/**
 * Collect all external image URLs from a DOMSnapshot (non-data: src attributes on <img>).
 * Use this to know which URLs need fetching before calling reconstructHtml/reconstructSvg.
 */
export function collectImageUrls(snapshot: Snapshot): string[] {
	const { strings } = snapshot
	const { nodes } = snapshot.documents[0]
	const urls = new Set<string>()

	for (let i = 0; i < nodes.nodeName.length; i++) {
		const tag = strings[nodes.nodeName[i]]?.toLowerCase()
		if (tag !== 'img') continue
		const attrArr = nodes.attributes[i] || []
		for (let j = 0; j < attrArr.length; j += 2) {
			if (strings[attrArr[j]] === 'src') {
				const val = strings[attrArr[j + 1]]
				if (val && !val.startsWith('data:')) urls.add(val)
			}
		}
	}

	return [...urls]
}

/** Reconstruct full HTML from a DOMSnapshot + captured CSS. */
export function reconstructHtml(snapshot: Snapshot, computedStyles: string[], css: string, imageMap: ImageMap = {}): string {
	const ctx = parseSnapshot(snapshot, computedStyles, imageMap)
	const roots = ctx.childrenMap.get(0) || []
	const html = roots.map(c => renderNode(ctx, c, 0)).join('')

	// Inject charset + captured CSS
	const charset = '<meta charset="utf-8">'
	if (html.includes('</head>')) {
		return html.replace('</head>', `${charset}<style>${css}</style></head>`)
	}
	return `<!DOCTYPE html><html><head>${charset}<style>${css}</style></head><body>${html}</body></html>`
}

/** Extract viewport dimensions from snapshot body bounds. */
function getViewport(snapshot: Snapshot): { w: number; h: number } {
	const { nodes, layout } = snapshot.documents[0]
	for (let i = 0; i < nodes.nodeName.length; i++) {
		if (snapshot.strings[nodes.nodeName[i]]?.toUpperCase() === 'BODY') {
			for (let j = 0; j < layout.nodeIndex.length; j++) {
				if (layout.nodeIndex[j] === i) {
					const dpr = detectDpr(snapshot)
					return {
						w: Math.round(layout.bounds[j][2] / dpr),
						h: Math.round(layout.bounds[j][3] / dpr),
					}
				}
			}
		}
	}
	return { w: 1366, h: 768 }
}

/** Wrap reconstructed HTML in an SVG foreignObject for export. */
export function reconstructSvg(snapshot: Snapshot, computedStyles: string[], css: string, imageMap: ImageMap = {}): string {
	const ctx = parseSnapshot(snapshot, computedStyles, imageMap)
	const { w, h } = getViewport(snapshot)

	// Build body content only (no <!DOCTYPE>, <html>, <head> — invalid inside SVG)
	const roots = ctx.childrenMap.get(0) || []
	let body = ''
	for (const c of roots) {
		const tag = ctx.strings[ctx.nodes.nodeName[c]]?.toLowerCase()
		if (tag === 'html') {
			// Descend into <html> → find <body> children
			const htmlChildren = ctx.childrenMap.get(c) || []
			for (const hc of htmlChildren) {
				const hTag = ctx.strings[ctx.nodes.nodeName[hc]]?.toLowerCase()
				if (hTag === 'body') {
					const bodyChildren = ctx.childrenMap.get(hc) || []
					body = bodyChildren.map(bc => renderNode(ctx, bc, 0)).join('')
					break
				}
			}
			break
		}
	}

	// Escape raw & in CSS for valid XML (SVG is strict XML)
	const xmlCss = css.replace(/&(?!amp;|lt;|gt;|quot;|apos;)/g, '&amp;')
	// Also escape & in inline styles within body
	const xmlBody = body.replace(/&(?!amp;|lt;|gt;|quot;|apos;)/g, '&amp;')

	return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <foreignObject width="100%" height="100%">
    <html xmlns="http://www.w3.org/1999/xhtml">
      <head><style><![CDATA[${xmlCss}]]></style></head>
      <body>${xmlBody}</body>
    </html>
  </foreignObject>
</svg>`
}
