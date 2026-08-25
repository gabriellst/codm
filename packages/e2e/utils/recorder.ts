import type { Page, CDPSession } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { getValidComputedStyles, type CDPTransport } from '../lib/cdp-snapshot'
import { CAPTURE_CANVAS_SCRIPT } from '../lib/inline-assets'

/**
 * Wrap a Playwright CDPSession as a CDPTransport.
 *
 * The cast is at a REAL widening boundary, and stays narrow on purpose. `CDPTransport` (lib/cdp-snapshot)
 * is deliberately Playwright-free so the same snapshot code runs under `chrome.debugger` in the
 * extension — and the two clients type the method differently: Playwright narrows to the literal union
 * `keyof CommandParameters`, `chrome.debugger` takes a plain `string`. An adapter between a wider and a
 * narrower model cannot be expressed without asserting at the seam.
 *
 * What it is NOT allowed to be is `as any`. It was, until 2026-08-17, on BOTH arguments — and `params`
 * never needed one at all, so half of it was pure noise hiding behind the other half. Asserting to the
 * parameter's actual type keeps the params relationship checked and fails loudly if Playwright's
 * signature changes; `any` would silently swallow exactly that.
 */
function wrapCdpSession(cdp: CDPSession): CDPTransport {
	return { send: (method, params) => cdp.send(method as Parameters<CDPSession['send']>[0], params) }
}

async function getValidComputedStyleNames(page: Page): Promise<string[]> {
	const allProps: string[] = await page.evaluate(() => {
		const cs = getComputedStyle(document.documentElement)
		return Array.from({ length: cs.length }, (_, i) => cs[i])
	})

	const cdp = await page.context().newCDPSession(page)
	await cdp.send('DOMSnapshot.enable')
	const valid = await getValidComputedStyles(wrapCdpSession(cdp), allProps)
	await cdp.detach()
	return valid
}

/**
 * Demo frame recorder using CDP DOMSnapshot.
 *
 * Produces two outputs automatically:
 *   snapshots/  — DOMSnapshot JSON (structured DOM + computed styles)
 *   cursor/     — framemap.json + cursor.json (cursor positions)
 *
 * On-demand generation (via scripts):
 *   html/       — bun e2e/scripts/generate-html.ts <recording-dir>
 *   svg/        — bun e2e/scripts/generate-svg.ts <recording-dir>
 */
export async function createDemoRecorder(page: Page, options: { fps?: number; domFps?: number } = {}) {
	const fps = options.fps ?? 60
	const domFps = options.domFps ?? 30

	const domSnapshots: { index: number; snapshot: any; cursorX: number; cursorY: number }[] = []
	const cursorTimeline: { t: number; x: number; y: number }[] = []

	let snapshotIndex = 0
	let snapshotCdp: CDPSession | null = null
	let domTimer: ReturnType<typeof setInterval> | null = null
	let cursorTimer: ReturnType<typeof setInterval> | null = null
	let recording = false
	let inflight = 0
	let cachedCss: string | null = null
	let computedStyles: string[] = []
	let startTime = 0

	let cursorX = 683
	let cursorY = 384
	page.on('console', msg => {
		const text = msg.text()
		if (text.startsWith('[cursor-pos]')) {
			const parts = text.split(' ')
			cursorX = Number.parseFloat(parts[1])
			cursorY = Number.parseFloat(parts[2])
		}
	})

	async function captureCss() {
		cachedCss = await page.evaluate(() => {
			let css = ''
			for (const sheet of document.styleSheets) {
				try {
					for (const r of sheet.cssRules) css += `${r.cssText}\n`
				} catch {}
			}
			return css
		})
	}

	async function captureSnapshot() {
		if (!snapshotCdp || inflight > 2) return
		inflight++
		try {
			const cx = cursorX,
				cy = cursorY
			const snapshot = await snapshotCdp.send('DOMSnapshot.captureSnapshot', {
				computedStyles,
				includeBlendedBackgroundColors: true,
				includeDOMRects: true,
				includeTextColorOpacities: true,
			})
			domSnapshots.push({ index: snapshotIndex++, snapshot, cursorX: cx, cursorY: cy })
		} catch {
		} finally {
			inflight--
		}
	}

	return {
		async start() {
			if (recording) return
			recording = true
			startTime = Date.now()

			await captureCss()
			computedStyles = await getValidComputedStyleNames(page)

			// Inline images/canvas as data URIs before first capture
			await page.evaluate(CAPTURE_CANVAS_SCRIPT)
			page.on('load', async () => {
				try {
					await captureCss()
					await page.evaluate(CAPTURE_CANVAS_SCRIPT)
				} catch {}
			})

			// DOMSnapshot CDP session
			snapshotCdp = await page.context().newCDPSession(page)
			await snapshotCdp.send('DOMSnapshot.enable')

			domTimer = setInterval(captureSnapshot, 1000 / domFps)

			cursorTimer = setInterval(() => {
				cursorTimeline.push({ t: Date.now() - startTime, x: cursorX, y: cursorY })
			}, 1000 / fps)
		},

		async stop() {
			if (!recording) return
			recording = false
			if (domTimer) {
				clearInterval(domTimer)
				domTimer = null
			}
			if (cursorTimer) {
				clearInterval(cursorTimer)
				cursorTimer = null
			}
			if (snapshotCdp) {
				try {
					await snapshotCdp.detach()
				} catch {}
				snapshotCdp = null
			}
		},

		async save(nameOrDir: string, outputDir?: string) {
			const saveStart = Date.now()
			await this.stop()
			const captureTime = (saveStart - startTime) / 1000
			const effectiveFps = domSnapshots.length / captureTime
			console.log(`Capture: ${domSnapshots.length} snapshots in ${captureTime.toFixed(1)}s = ${effectiveFps.toFixed(0)}fps`)

			const baseDir = outputDir ?? join(import.meta.dirname, '..', 'recordings', nameOrDir)
			const snapshotsDir = join(baseDir, 'snapshots')
			const cursorDir = join(baseDir, 'cursor')
			mkdirSync(snapshotsDir, { recursive: true })
			mkdirSync(cursorDir, { recursive: true })

			const write =
				typeof Bun !== 'undefined'
					? (path: string, data: any) => Bun.write(path, typeof data === 'string' ? data : JSON.stringify(data))
					: async (path: string, data: any) => {
							const { writeFile } = await import('node:fs/promises')
							return writeFile(path, typeof data === 'string' ? data : JSON.stringify(data))
						}

			// Snapshots
			if (cachedCss) await write(join(snapshotsDir, 'styles.css'), cachedCss)
			await write(join(snapshotsDir, 'meta.json'), { computedStyles, domFps, fps })
			await Promise.all(domSnapshots.map(s => write(join(snapshotsDir, `snapshot-${String(s.index).padStart(4, '0')}.json`), s.snapshot)))

			// Cursor
			const frameMap = domSnapshots.map(s => ({ index: s.index, cursorX: s.cursorX, cursorY: s.cursorY }))
			await write(join(cursorDir, 'framemap.json'), JSON.stringify(frameMap))
			await write(join(cursorDir, 'cursor.json'), JSON.stringify(cursorTimeline))

			return {
				baseDir,
				snapshotCount: domSnapshots.length,
				cursorCount: cursorTimeline.length,
			}
		},
	}
}
