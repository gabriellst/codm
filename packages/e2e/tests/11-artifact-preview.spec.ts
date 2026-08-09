import { copyFileSync, mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect } from '@playwright/test'
import { sendDirectMessage } from '@codm/client-typescript/typescript'
import { test } from '../utils/test'
import { givenArtifact, givenAttachedThread, writeSampleFile, writeSampleWav } from '../utils/given'
import { authenticateCloudSession } from '../utils/given/cloud'

/**
 * ARTIFACT PREVIEW — the artifacts of a thread, rendered as themselves, in the conversation.
 *
 * ### What is actually being proven
 * The screen used to draw a striped `repeating-linear-gradient` where an image belonged, and that was
 * not a styling bug: `ref` never crossed the wire, so there were no bytes to show. Which means the
 * only assertion that can tell the fix from the bug is one that reads the DECODED MEDIA:
 *
 *  - `naturalWidth > 0` on the `<img>` — the image was fetched AND parsed. A broken `src` gives 0.
 *  - `readyState >= 1` + `duration > 0` on `<video>`/`<audio>` — metadata was parsed off the stream
 *    that `GetArtifactContent` served, `Range` request included.
 *
 * A `toBeVisible()` on the element would pass against the fallback file row, which is exactly the
 * shape this feature replaced.
 *
 * ### Why the fixtures are generated, never committed
 * The preview degrades to a file row whenever the browser cannot decode the bytes, so an undecodable
 * fixture makes a green spec that screenshots the fallback. The image and the video are produced by
 * PLAYWRIGHT ITSELF (a real screenshot, a real recorded video) so the engine that renders them is the
 * engine that made them; the audio is 16-bit PCM synthesized in `utils/given/artifact.ts`. No ffmpeg
 * on the build host, no binary blobs in git.
 *
 * ### It also writes the docs images
 * `SHOTS_DIR` receives the two screenshots referenced from the design spec. That is a side effect of
 * a real assertion pass, not a separate "take a picture" script — a screenshot nobody asserted on is
 * a picture of whatever happened to render.
 */
const SHOTS_DIR = resolve(import.meta.dirname, '../../../.specs/2026-08-06-artifact-preview')

test('preview de artefatos — imagem, áudio, vídeo, link e arquivo na conversa e no catálogo', async ({ page, browser, given, goto }) => {
	// Above the 30s default: this spec RECORDS a video, seeds five artifacts through the real
	// endpoint, and then waits for three media elements to actually decode on two screens.
	test.setTimeout(120_000)

	const user = await given.freshUser({})
	const thread = await givenAttachedThread(user.session, { displayName: 'Ada' })
	const client = user.session.client
	const scratch = mkdtempSync(join(tmpdir(), 'codm-e2e-artifacts-'))
	mkdirSync(SHOTS_DIR, { recursive: true })

	// ── The image: a REAL screenshot of the console, which is what an agent that just changed a
	//    screen would actually record.
	//
	//    NOT `waitForLoadState('networkidle')`: the console holds the owner-scoped SSE stream open for
	//    its whole life (`useServerEventSource`, mounted by the `(app)` layout), so there is always one
	//    request in flight and the network is never idle — that wait can only ever time out here.
	//    Waiting on rendered CONTENT is both correct and what the screenshot actually needs.
	// CloudSessionGate passou a envolver as rotas (app) DEPOIS que este spec foi escrito; sem o
	// token semeado toda navegação cai em /login. Ver utils/given/cloud.ts.
	await authenticateCloudSession(page)

	await goto('/dashboard')
	await expect(page.locator('main')).toBeVisible()
	await page.waitForTimeout(600)
	const imagePath = join(scratch, 'captura-do-console.png')
	// Clipped to a banner rather than the whole window: an artifact renders up to `max-h-80`, so a
	// full-window fixture makes one row as tall as a third of the timeline and the other four kinds
	// scroll out of the shot this spec exists to produce.
	await page.screenshot({ path: imagePath, clip: { x: 250, y: 40, width: 1100, height: 300 } })

	// ── The video: a REAL webm, recorded by Playwright's own encoder in a throwaway context. Closing
	//    the context is what finalizes the file, so the path is only valid after the await below.
	//    The URL is READ OFF the page under test — the runner picks its own ports (5273 by default,
	//    overridable via E2E_VITE_PORT), so any literal here would be wrong on somebody else's run.
	const consoleUrl = page.url()
	const recorder = await browser.newContext({ recordVideo: { dir: scratch, size: { width: 640, height: 400 } } })
	const recorderPage = await recorder.newPage()
	await recorderPage.goto(consoleUrl)
	await recorderPage.waitForTimeout(1_200)
	const recordedVideo = recorderPage.video()
	await recorder.close()
	const videoPath = join(scratch, 'gravacao-do-fluxo.webm')
	copyFileSync(await recordedVideo!.path(), videoPath)

	const audioPath = writeSampleWav(scratch)
	const filePath = writeSampleFile(scratch)

	// ── The conversation the artifacts land in. A message BEFORE and a message AFTER, because the
	//    timeline is merged by timestamp and "the artifact shows up in the right place" is the claim.
	await sendDirectMessage(thread.threadId, { text: 'Ada, dá uma olhada no preview e me manda como ficou.' }, { client })

	await givenArtifact(user.session, {
		threadId: thread.threadId,
		kind: 'IMAGE',
		name: 'captura-do-console.png',
		ref: imagePath,
		meta: 'Captura após a mudança',
	})
	await givenArtifact(user.session, {
		threadId: thread.threadId,
		kind: 'VIDEO',
		name: 'gravacao-do-fluxo.webm',
		ref: videoPath,
		meta: 'Fluxo completo, 1s',
	})
	await givenArtifact(user.session, {
		threadId: thread.threadId,
		kind: 'AUDIO',
		name: 'nota-de-voz.wav',
		ref: audioPath,
		meta: 'Nota de voz do agente',
	})
	await givenArtifact(user.session, {
		threadId: thread.threadId,
		kind: 'LINK',
		name: 'Deploy de preview',
		ref: 'https://acme-pr-214.vercel.app',
		meta: 'Vercel · pronto',
	})
	await givenArtifact(user.session, {
		threadId: thread.threadId,
		kind: 'FILE',
		name: 'relatorio-da-issue.md',
		ref: filePath,
		meta: '5 KB',
	})

	await sendDirectMessage(thread.threadId, { text: 'Perfeito, era isso mesmo. Pode seguir.' }, { client })

	// ── A CONVERSA ────────────────────────────────────────────────────────────────────────────────
	// Taller than the default viewport ONLY so one frame can hold the whole timeline — five artifact
	// kinds plus the two messages around them. The transcript is a windowed scroller, so `fullPage`
	// would capture the page around it and none of the rows below the fold.
	await page.setViewportSize({ width: 1512, height: 1620 })
	await goto('/threads/$threadId', { threadId: thread.threadId })

	const image = page.locator('img[alt="captura-do-console.png"]')
	await expect(image).toBeVisible()
	// DECODED, not merely present: 0 here is the striped-placeholder bug wearing an <img>.
	await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 15_000 }).toBeGreaterThan(0)

	const video = page.locator('video')
	await expect(video).toBeVisible()
	await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState), { timeout: 15_000 }).toBeGreaterThanOrEqual(1)
	expect(await video.evaluate((el: HTMLVideoElement) => el.duration)).toBeGreaterThan(0)

	const audio = page.locator('audio')
	await expect(audio).toBeVisible()
	await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.readyState), { timeout: 15_000 }).toBeGreaterThanOrEqual(1)
	expect(await audio.evaluate((el: HTMLAudioElement) => el.duration)).toBeGreaterThan(0)

	// The LINK's href is the raw URL — the content endpoint refuses that kind on purpose.
	await expect(page.locator('a[href="https://acme-pr-214.vercel.app"]')).toBeVisible()

	// The FILE row opens through the content endpoint.
	await expect(page.locator(`a[href*="/artifacts/"][href$="/content"]`).first()).toBeVisible()

	// The artifacts sit BETWEEN the two messages, which is the whole point of merging by timestamp.
	const rows = page.locator('[data-slot="virtual-list-item"]')
	const firstRowText = await rows.first().textContent()
	const lastRowText = await rows.last().textContent()
	expect(firstRowText).toContain('dá uma olhada no preview')
	expect(lastRowText).toContain('era isso mesmo')

	await page.screenshot({ path: join(SHOTS_DIR, 'conversa.png'), fullPage: false })

	// ── O CATÁLOGO ────────────────────────────────────────────────────────────────────────────────
	// Back to a grid-shaped viewport: the tall one above exists for the timeline, and reusing it here
	// would frame the five cards against half a screen of blank.
	await page.setViewportSize({ width: 1512, height: 1080 })
	await goto('/threads/$threadId/artifacts', { threadId: thread.threadId })

	const cardImage = page.locator('img[alt="captura-do-console.png"]')
	await expect(cardImage).toBeVisible()
	await expect.poll(() => cardImage.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 15_000 }).toBeGreaterThan(0)
	await expect(page.locator('video')).toBeVisible()
	await expect(page.locator('audio')).toBeVisible()

	// The striped placeholder this feature replaced must not exist on the screen any more.
	const stripes = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[style*="repeating-linear-gradient"]')].length)
	expect(stripes).toBe(0)

	await page.screenshot({ path: join(SHOTS_DIR, 'catalogo.png'), fullPage: false })
})
