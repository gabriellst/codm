// lib/cdp-snapshot.ts
var FALLBACK_COMPUTED_STYLES = [
	'background-color',
	'background-image',
	'background-clip',
	'border-color',
	'border-top-color',
	'border-right-color',
	'border-bottom-color',
	'border-left-color',
	'border-width',
	'border-top-width',
	'border-right-width',
	'border-bottom-width',
	'border-left-width',
	'border-style',
	'border-top-style',
	'border-right-style',
	'border-bottom-style',
	'border-left-style',
	'border-radius',
	'border-top-left-radius',
	'border-top-right-radius',
	'border-bottom-left-radius',
	'border-bottom-right-radius',
	'box-shadow',
	'text-shadow',
	'color',
	'opacity',
	'filter',
	'font-size',
	'font-weight',
	'font-family',
	'line-height',
	'letter-spacing',
	'text-align',
	'display',
	'visibility',
	'position',
	'z-index',
	'overflow',
	'overflow-x',
	'overflow-y',
	'transform',
	'stroke',
	'mask-image',
]
async function getValidComputedStyles(cdp, allProps) {
	try {
		await cdp.send('DOMSnapshot.captureSnapshot', { computedStyles: allProps, includeDOMRects: false })
		return allProps
	} catch {
		return FALLBACK_COMPUTED_STYLES
	}
}
async function captureSnapshot(cdp, computedStyles) {
	return cdp.send('DOMSnapshot.captureSnapshot', {
		computedStyles,
		includeBlendedBackgroundColors: true,
		includeDOMRects: true,
		includeTextColorOpacities: true,
	})
}
export { getValidComputedStyles, captureSnapshot, FALLBACK_COMPUTED_STYLES }
