/**
 * Browser-side asset capture — extracts <canvas> pixel data as data URIs.
 *
 * Images are NOT inlined during snapshotting (their original URLs are preserved
 * in the DOMSnapshot). Image resolution happens at generation time instead,
 * which keeps the snapshot phase fast.
 *
 * This function runs INSIDE the browser (via page.evaluate or content script).
 * It must be self-contained with zero imports.
 *
 * Used by:
 *   - e2e/extension/content.js (Chrome extension)
 *   - e2e/utils/recorder.ts (Playwright recorder)
 *   - e2e/tests/demo/*.spec.ts (demo capture tests)
 */

export interface CapturedAssets {
	/** Canvas data URIs keyed by data-snapshot-id */
	canvasDataUris: Record<string, { dataUri: string; width: number; height: number }>
}

/**
 * Self-contained function to run inside page.evaluate() or a content script.
 * Captures <canvas> pixel data and tags each with data-snapshot-id.
 * Does NOT touch <img> elements — their original src URLs stay intact
 * for the DOMSnapshot to capture as-is.
 *
 * Returns canvas data URIs for sidecar storage alongside the DOMSnapshot.
 */
export const CAPTURE_CANVAS_FN = async (): Promise<CapturedAssets> => {
	const canvasDataUris: Record<string, { dataUri: string; width: number; height: number }> = {}

	document.querySelectorAll('canvas').forEach((canvas, i) => {
		try {
			const el = canvas as HTMLCanvasElement
			const id = `__snap_canvas_${i}`
			el.setAttribute('data-snapshot-id', id)
			canvasDataUris[id] = {
				dataUri: el.toDataURL('image/png'),
				width: el.width,
				height: el.height,
			}
		} catch {}
	})

	return { canvasDataUris }
}

/**
 * Stringified version for page.evaluate() — avoids import issues in Playwright.
 * Usage: const assets = await page.evaluate(CAPTURE_CANVAS_SCRIPT)
 */
export const CAPTURE_CANVAS_SCRIPT = `(${CAPTURE_CANVAS_FN.toString()})()`

// ── Backwards compat aliases ────────────────────────────

/** @deprecated Use CapturedAssets */
export type InlinedAssets = CapturedAssets
/** @deprecated Use CAPTURE_CANVAS_FN */
export const INLINE_ASSETS_FN = CAPTURE_CANVAS_FN
/** @deprecated Use CAPTURE_CANVAS_SCRIPT */
export const INLINE_ASSETS_SCRIPT = CAPTURE_CANVAS_SCRIPT
