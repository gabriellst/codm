#!/usr/bin/env bun
/**
 * A recorded take → a watchable MP4.
 *
 * The DOM recorder (`utils/recorder.ts`) captures STRUCTURE, not pixels: a CDP `DOMSnapshot` per
 * frame plus the page's CSS. That is what makes a take resolution-free and diffable — and it is also
 * why it is not a video yet. This script closes that gap: reconstruct each frame's HTML (the same
 * `lib/reconstruct.ts` the extension and `generate-html.ts` use), rasterise it in a real Chromium at
 * the size the film was shot, and hand the sequence to ffmpeg.
 *
 * Usage:
 *   bun scripts/render-mp4.ts films/demo-attach-artefato
 *   bun scripts/render-mp4.ts films/demo-attach-artefato --scale 2 --out /tmp/demo-4k.mp4
 *
 * Flags:
 *   --out <path>      where the MP4 lands (default: `<film-dir>/<dir name>.mp4`)
 *   --fps <n>         override the derived capture rate (see "Timing" below)
 *   --scale <n>       device pixel ratio: 1 → 1920×1080 master, 2 → 3840×2160 (default 1)
 *   --width/--height  the shot's viewport (default 1920×1080 — what spec 92 records at)
 *   --keep-frames     keep the intermediate PNGs (a few hundred MB) for a frame-accurate edit
 *
 * ### Timing — derived, never assumed
 * The recorder writes no timestamp per snapshot, but it DOES write the cursor timeline, sampled on
 * its own clock with a millisecond offset per entry. The take's real duration is that timeline's last
 * offset, so the capture rate is `snapshots / duration` — the honest number, which is always below
 * the requested `domFps` because a snapshot that arrives while three are already in flight is
 * dropped. Encoding at the requested rate instead would play the film fast by exactly that drop rate.
 *
 * ### Fonts
 * Nothing to embed: the console's stacks are system fonts (`--font-sans` / `--font-mono` in
 * `app/react/src/index.css` resolve to `ui-sans-serif` / `ui-monospace` and friends), so an offline
 * rasterisation on the machine that recorded renders the same glyphs it filmed. A take that ever
 * starts using a webfont has to inline it here before this stays true.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { chromium } from 'playwright'
import { collectImageUrls, reconstructHtml, type FrameEntry, type ImageMap } from '../lib/reconstruct'

/**
 * Run a child to completion, streaming its output rather than buffering it.
 *
 * NOT `promisify(execFile)`, which is what this was and why every render appeared to take twenty
 * minutes: `execFile` collects the child's stdout AND stderr into memory, and ffmpeg narrates every
 * frame to stderr. Measured — the encode finished, the MP4 was complete and correct on disk, and the
 * script then sat there forever with its PNGs uncleaned and its final line unprinted. Three separate
 * "the rasteriser is slow" conclusions came out of that, and all three were wrong.
 *
 * `-loglevel error` below cuts the narration at the source; spawning with the child's output inherited
 * removes the buffer that could fill either way.
 */
function run(command: string, args: readonly string[]): Promise<void> {
	return new Promise((done, fail) => {
		const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'] })
		child.on('error', fail)
		child.on('close', code => (code === 0 ? done() : fail(new Error(`${command} exited with ${code}`))))
	})
}

// ── Arguments ───────────────────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
/** Flags that consume the next argument — everything else is either a switch or the positional. */
const VALUED = new Set(['out', 'fps', 'scale', 'width', 'height'])

const flags = new Map<string, string>()
const positionals: string[] = []
for (let i = 0; i < argv.length; i++) {
	const arg = argv[i]
	if (!arg?.startsWith('--')) {
		if (arg) positionals.push(arg)
		continue
	}
	const name = arg.slice(2)
	if (VALUED.has(name)) {
		const value = argv[++i]
		if (value === undefined) {
			console.error(`--${name} needs a value`)
			process.exit(1)
		}
		flags.set(name, value)
	} else {
		flags.set(name, 'true')
	}
}

const flag = (name: string): string | undefined => flags.get(name)
const filmDir = positionals[0]

if (!filmDir || !existsSync(join(filmDir, 'snapshots', 'meta.json'))) {
	console.error('Usage: bun scripts/render-mp4.ts <film-dir> [--out file.mp4] [--fps n] [--scale n] [--keep-frames]')
	console.error('  <film-dir> must contain snapshots/meta.json — a directory written by `recorder.save()`.')
	process.exit(1)
}

const width = Number(flag('width') ?? 1920)
const height = Number(flag('height') ?? 1080)
const scale = Number(flag('scale') ?? 1)
const keepFrames = flags.has('keep-frames')
const outPath = resolve(flag('out') ?? join(filmDir, `${basename(resolve(filmDir))}.mp4`))

// ── The take ────────────────────────────────────────────────────────────────────────────────────

const snapshotsDir = join(filmDir, 'snapshots')
const cursorDir = join(filmDir, 'cursor')
const pngDir = join(filmDir, 'png')

const meta = JSON.parse(readFileSync(join(snapshotsDir, 'meta.json'), 'utf-8'))
const computedStyles: string[] = meta.computedStyles ?? []
const fallbackCss = existsSync(join(snapshotsDir, 'styles.css')) ? readFileSync(join(snapshotsDir, 'styles.css'), 'utf-8') : ''
const frames: FrameEntry[] = JSON.parse(readFileSync(join(cursorDir, 'framemap.json'), 'utf-8'))

if (frames.length === 0) {
	console.error('That take has no frames.')
	process.exit(1)
}

/** The capture rate the take actually achieved — see "Timing" in the docblock. */
function derivedFps(): number {
	const override = flag('fps')
	if (override) return Number(override)
	const timeline: { t: number }[] = JSON.parse(readFileSync(join(cursorDir, 'cursor.json'), 'utf-8'))
	const durationMs = timeline[timeline.length - 1]?.t ?? 0
	if (durationMs <= 0) return meta.domFps ?? 10
	return Math.round((frames.length / (durationMs / 1000)) * 100) / 100
}

const fps = derivedFps()
/** The container's rate: the nearest standard one AT OR ABOVE the capture, so `-r` never decimates. */
const outputFps = fps > 30 ? 60 : 30

function snapshotPathOf(index: number): string {
	return join(snapshotsDir, `snapshot-${String(index).padStart(4, '0')}.json`)
}

function cssFor(index: number): string {
	const perFrame = join(snapshotsDir, `styles-${String(index).padStart(4, '0')}.css`)
	return existsSync(perFrame) ? readFileSync(perFrame, 'utf-8') : fallbackCss
}

/**
 * Any image the capture layer did not already inline.
 *
 * The recorder inlines images and canvases as data URIs while it records, so this is normally empty —
 * and when it is not, the dev server that served those URLs is long gone by the time anyone renders.
 * A miss is left alone rather than failed on: one un-fetchable avatar is not a reason to refuse a film.
 */
async function resolveImages(): Promise<ImageMap> {
	const urls = new Set<string>()
	for (const frame of frames) {
		const path = snapshotPathOf(frame.index)
		if (!existsSync(path)) continue
		for (const url of collectImageUrls(JSON.parse(readFileSync(path, 'utf-8')))) urls.add(url)
	}
	if (urls.size === 0) return {}

	console.log(`Resolving ${urls.size} external image URL(s)…`)
	const map: ImageMap = {}
	await Promise.all(
		[...urls].map(async url => {
			try {
				const res = await fetch(url)
				if (!res.ok) return
				const body = Buffer.from(await res.arrayBuffer())
				map[url] = `data:${res.headers.get('content-type') || 'image/png'};base64,${body.toString('base64')}`
			} catch {
				// Unreachable host, dead dev server — the frame renders without it.
			}
		}),
	)
	const missed = urls.size - Object.keys(map).length
	if (missed > 0) console.log(`  ${missed} could not be fetched — those frames render without them`)
	return map
}

// ── Rasterise ───────────────────────────────────────────────────────────────────────────────────

/**
 * STOP THE RECONSTRUCTED PAGE FROM RE-PLAYING ITS ANIMATIONS.
 *
 * A frame is a static DOM plus the page's real stylesheet — and that stylesheet still contains every
 * `@keyframes` and `animation` the app declares. Loading it starts them all from zero, so a
 * screenshot taken right after `setContent` catches whatever was mid-flight: measured, the attach
 * wizard's `animate-in fade-in` (a 300ms enter on each step) rendered every wizard frame of the film
 * washed out, at the opacity the animation begins with rather than the one the snapshot recorded.
 *
 * Killing the animation is what makes the frame honest, not what makes it prettier: the reconstruct
 * writes each node's COMPUTED style inline, so with nothing animating on top, every element rests at
 * exactly the value the recorder measured — including a genuinely mid-fade element, which stays
 * mid-fade. Waiting the animations out instead would settle them all to their END state and quietly
 * erase the motion the take actually captured.
 */
const FREEZE_ANIMATIONS = `<style>*,*::before,*::after{animation:none!important;transition:none!important}</style>`

const imageMap = await resolveImages()

rmSync(pngDir, { recursive: true, force: true })
mkdirSync(pngDir, { recursive: true })

console.log(`Rasterising ${frames.length} frame(s) at ${width * scale}×${height * scale}…`)
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale })
const page = await context.newPage()

let rendered = 0
for (const frame of frames) {
	const path = snapshotPathOf(frame.index)
	if (!existsSync(path)) continue

	const snapshot = JSON.parse(readFileSync(path, 'utf-8'))
	const html = reconstructHtml(snapshot, computedStyles, cssFor(frame.index), imageMap)
	// `domcontentloaded`, not `load`: everything is inline, so there is no network to wait for, and
	// `load` would sit out the timeout on any stylesheet URL the page still nominally references.
	await page.setContent(html + FREEZE_ANIMATIONS, { waitUntil: 'domcontentloaded' })
	await page.screenshot({ path: join(pngDir, `frame-${String(rendered).padStart(5, '0')}.png`) })

	rendered++
	if (rendered % 50 === 0 || rendered === frames.length) console.log(`  ${rendered}/${frames.length}`)
}

await browser.close()

if (rendered === 0) {
	console.error('No frame could be reconstructed — the snapshots are missing or unreadable.')
	process.exit(1)
}

// ── Encode ──────────────────────────────────────────────────────────────────────────────────────

console.log(`Encoding ${rendered} frame(s) captured at ${fps} fps → ${outputFps} fps container → ${outPath}`)
await run('ffmpeg', [
	'-y',
	// Quiet: this child's stderr used to be the reason the script never exited (see `run`).
	'-loglevel',
	'error',
	'-framerate',
	String(fps),
	'-i',
	join(pngDir, 'frame-%05d.png'),
	'-c:v',
	'libx264',
	// Visually lossless for screen content, which is flat colour and text — the two things a low
	// bitrate destroys first.
	'-crf',
	'18',
	'-preset',
	'slow',
	// `yuv420p` and an even frame size: the combination every player and every upload pipeline
	// accepts. Without the scale filter an odd dimension (a `--scale` that lands on one) fails encode.
	'-vf',
	'scale=trunc(iw/2)*2:trunc(ih/2)*2',
	'-pix_fmt',
	'yuv420p',
	// A STANDARD output rate, chosen so it never sits BELOW the capture — `-r` resamples in both
	// directions, and downwards it decimates. Measured: a 60fps take pinned at `-r 30` came out with
	// 2114 frames over 70.5s, i.e. half of everything the capture paid for, silently. Duplicating
	// frames upward changes nothing about what is on screen or when; dropping them changes the film.
	'-r',
	String(outputFps),
	'-movflags',
	'+faststart',
	outPath,
])

if (!keepFrames) rmSync(pngDir, { recursive: true, force: true })

const seconds = Math.round((rendered / fps) * 10) / 10
console.log(`Done — ${seconds}s of film at ${fps} fps capture rate → ${outPath}`)
if (keepFrames) console.log(`Frames kept at ${pngDir}`)
