/**
 * CLI wrapper for DOMSnapshot → HTML reconstruction.
 *
 * Core logic lives in e2e/lib/reconstruct.ts (shared with the Chrome extension).
 *
 * Resolves external image URLs → data URIs at generation time (not during snapshot capture)
 * using a shared image cache across all frames.
 *
 * Usage:
 *   bun e2e/scripts/generate-html.ts <recording-dir>              # all frames → html/
 *   bun e2e/scripts/generate-html.ts <recording-dir> --frame 30   # single frame
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { reconstructHtml, collectImageUrls, type FrameEntry, type ImageMap } from '../lib/reconstruct'

const args = process.argv.slice(2)
const recordingDir = args.find(a => !a.startsWith('--'))
const frameArg = args.includes('--frame') ? Number(args[args.indexOf('--frame') + 1]) : null

if (!recordingDir || !existsSync(join(recordingDir, 'snapshots', 'meta.json'))) {
	console.error('Usage: bun e2e/scripts/generate-html.ts <recording-dir> [--frame N]')
	process.exit(1)
}

const snapshotsDir = join(recordingDir, 'snapshots')
const cursorDir = join(recordingDir, 'cursor')
const outputDir = join(recordingDir, 'html')

const meta = JSON.parse(readFileSync(join(snapshotsDir, 'meta.json'), 'utf-8'))
const computedStyles: string[] = meta.computedStyles || []
const fallbackCss = existsSync(join(snapshotsDir, 'styles.css')) ? readFileSync(join(snapshotsDir, 'styles.css'), 'utf-8') : ''
const frameMap: FrameEntry[] = JSON.parse(readFileSync(join(cursorDir, 'framemap.json'), 'utf-8'))

function getCssForFrame(frameIndex: number): string {
	const perFrameCss = join(snapshotsDir, `styles-${String(frameIndex).padStart(4, '0')}.css`)
	return existsSync(perFrameCss) ? readFileSync(perFrameCss, 'utf-8') : fallbackCss
}

const framesToProcess = frameArg !== null ? frameMap.filter(f => f.index === frameArg) : frameMap

if (framesToProcess.length === 0) {
	console.error(`Frame ${frameArg} not found in framemap`)
	process.exit(1)
}

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

async function resolveImages(): Promise<ImageMap> {
	// Collect all unique image URLs across all frames
	const allUrls = new Set<string>()
	for (const frame of framesToProcess) {
		const snapPath = join(snapshotsDir, `snapshot-${String(frame.index).padStart(4, '0')}.json`)
		if (!existsSync(snapPath)) continue
		const snapshot = JSON.parse(readFileSync(snapPath, 'utf-8'))
		for (const url of collectImageUrls(snapshot)) allUrls.add(url)
	}

	if (allUrls.size === 0) return {}
	console.log(`Resolving ${allUrls.size} image URL(s)...`)

	const imageMap: ImageMap = {}
	const results = await Promise.all([...allUrls].map(async url => ({ url, dataUri: await fetchAsDataUri(url) })))
	for (const { url, dataUri } of results) {
		if (dataUri) imageMap[url] = dataUri
	}

	const resolved = Object.keys(imageMap).length
	if (resolved < allUrls.size) console.log(`  ${allUrls.size - resolved} image(s) could not be fetched`)
	return imageMap
}

// ── Generate HTML ───────────────────────────────────────

const imageMap = await resolveImages()

mkdirSync(outputDir, { recursive: true })
console.log(`Converting ${framesToProcess.length} snapshot(s) → HTML...`)

for (let i = 0; i < framesToProcess.length; i++) {
	const frame = framesToProcess[i]
	const snapPath = join(snapshotsDir, `snapshot-${String(frame.index).padStart(4, '0')}.json`)
	if (!existsSync(snapPath)) continue

	const snapshot = JSON.parse(readFileSync(snapPath, 'utf-8'))
	const html = reconstructHtml(snapshot, computedStyles, getCssForFrame(frame.index), imageMap)
	writeFileSync(join(outputDir, `frame-${String(frame.index).padStart(4, '0')}.html`), html)

	if ((i + 1) % 100 === 0 || i === framesToProcess.length - 1) console.log(`  ${i + 1}/${framesToProcess.length}`)
}

console.log(`Done! ${framesToProcess.length} HTML files → ${outputDir}/`)
