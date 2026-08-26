/**
 * CDP DOMSnapshot capture logic — shared between recorder.ts (Playwright) and
 * the Chrome extension (chrome.debugger).
 *
 * Uses a generic CDPTransport interface so the same code works with any CDP client.
 */

/** Minimal CDP transport — both Playwright CDPSession and chrome.debugger implement this pattern. */
export interface CDPTransport {
	send(method: string, params?: Record<string, unknown>): Promise<unknown>
}

/** Curated CSS properties known to work with DOMSnapshot.captureSnapshot across Chrome versions. */
export const FALLBACK_COMPUTED_STYLES = [
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

/**
 * Validate which CSS properties DOMSnapshot actually accepts.
 * Tries all props at once; falls back to curated list on failure.
 */
export async function getValidComputedStyles(cdp: CDPTransport, allProps: string[]): Promise<string[]> {
	try {
		await cdp.send('DOMSnapshot.captureSnapshot', { computedStyles: allProps, includeDOMRects: false })
		return allProps
	} catch {
		return FALLBACK_COMPUTED_STYLES
	}
}

/** Standard options for DOMSnapshot.captureSnapshot. */
export interface CaptureOptions {
	computedStyles: string[]
	includeBlendedBackgroundColors?: boolean
	includeDOMRects?: boolean
	includeTextColorOpacities?: boolean
}

/** Capture a DOMSnapshot with validated computed styles. */
export async function captureSnapshot(cdp: CDPTransport, computedStyles: string[]): Promise<unknown> {
	return cdp.send('DOMSnapshot.captureSnapshot', {
		computedStyles,
		includeBlendedBackgroundColors: true,
		includeDOMRects: true,
		includeTextColorOpacities: true,
	})
}
