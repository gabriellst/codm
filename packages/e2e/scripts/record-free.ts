/**
 * Free-form recorder: launches a headed browser with the DemoRecorder running.
 * Navigate freely, then stop via:
 *   - Press ENTER in the terminal
 *   - Touch the stop file: touch /tmp/recorder-stop
 *   - Send SIGTERM/SIGINT to the process
 *
 * Usage:
 *   bun e2e/scripts/record-free.ts [url]
 *   bun e2e/scripts/record-free.ts http://localhost:5173
 *
 * Output: e2e/recordings/free-session-<timestamp>/
 * Then:   bun e2e/scripts/generate-html.ts e2e/recordings/free-session-<timestamp>
 */

import { chromium } from 'playwright'
import { createDemoRecorder } from '../utils/recorder'
import { existsSync, unlinkSync } from 'node:fs'

const STOP_FILE = '/tmp/recorder-stop'

const url = process.argv[2] || 'about:blank'
const sessionName = `free-session-${Date.now()}`

// Clean up stale stop file
if (existsSync(STOP_FILE)) unlinkSync(STOP_FILE)

console.log('Launching headed browser...')
console.log(`Session: ${sessionName}`)
console.log(`URL: ${url}`)
console.log('')

const browser = await chromium.launch({
	headless: false,
	args: ['--window-size=1366,768'],
})

const context = await browser.newContext({
	viewport: { width: 1366, height: 768 },
})

const page = await context.newPage()
await page.goto(url)

console.log('Starting recorder (DOM@10fps, cursor@10fps)...')
const recorder = await createDemoRecorder(page, { fps: 10, domFps: 10 })
await recorder.start()

console.log('')
console.log('='.repeat(50))
console.log('  RECORDING — navigate freely in the browser')
console.log('  Stop with: touch /tmp/recorder-stop')
console.log('  Or press ENTER here, or Ctrl+C')
console.log('='.repeat(50))
console.log('')

async function saveAndExit() {
	console.log('Stopping recorder and saving...')
	const result = await recorder.save(sessionName)
	console.log(`Saved ${result.snapshotCount} snapshots, ${result.cursorCount} cursor frames`)
	console.log(`Output: ${result.baseDir}`)
	console.log('')
	console.log('Generate HTML with:')
	console.log(`  bun e2e/scripts/generate-html.ts ${result.baseDir}`)
	await browser.close()
	if (existsSync(STOP_FILE)) unlinkSync(STOP_FILE)
	process.exit(0)
}

// Stop via SIGTERM or SIGINT
let stopping = false
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
	process.on(sig, async () => {
		if (stopping) return
		stopping = true
		console.log(`\nReceived ${sig}`)
		await saveAndExit()
	})
}

// Stop via file watch or stdin — whichever comes first
await new Promise<void>(resolve => {
	// Poll for stop file
	const filePoller = setInterval(() => {
		if (existsSync(STOP_FILE)) {
			clearInterval(filePoller)
			resolve()
		}
	}, 500)

	// Stdin Enter
	process.stdin.once('data', () => {
		clearInterval(filePoller)
		resolve()
	})
})

await saveAndExit()
