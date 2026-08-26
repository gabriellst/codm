import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { createIssue, getSessionChat, sendDirectMessage, transitionIssueStatus } from '@codm/client-typescript/typescript'
import { test, expect } from '../utils/test'
import {
	givenFreshUser,
	givenArtifact,
	givenAttachedThread,
	givenCompletedOnboarding,
	injectInboundMessage,
	writeSampleFile,
	writeSampleWav,
} from '../utils/given'
import { authenticateCloudSession } from '../utils/given/cloud'
import { t } from '../utils/i18n'

/**
 * DEMO — the film assets for `whatsapp-artefato` (video-creation-framework, `screenplay.md` § "Assets
 * que este filme precisa"). PROMOTIONAL captures of the REAL console, driven through the real stack
 * (daemon + gateway + SPA over a scratch SQLite), with synthetic data only. Assertions are LEVE — just
 * enough that a capture only lands if the state it is supposed to show actually rendered.
 *
 * Gated behind `DEMO=on` like `90-demo-onboarding.spec.ts`: it writes into a SIBLING repository and
 * takes minutes (a 36s live recording of the thinking indicator), so it must never run as part of the
 * normal suite. Invocation:
 *
 *   DEMO=on bun scripts/run-e2e.ts tests/91-demo-thread-artifacts.spec.ts
 *
 * ### What is captured (all 1920×1080 CSS px at deviceScaleFactor 2 → 3840×2160 PNG)
 *   (a) the chat with only the operator's green bubble ("Ada, dá uma olhada no preview…" · Você)
 *   (b) header "Em execução" + the live "Pensando" indicator under that bubble — full-frame PNG, a
 *       burst of PNG frames of one spinner cycle (with a timing sidecar), five full-frame PNGs with the
 *       five verbs the screenplay names, and a 36s webm recorded in a second browser context
 *   (c) the full thread with the five artifacts (Captura de tela / Vídeo / Áudio / Deploy de preview /
 *       Arquivo) — 1080p pinned at the end + a tall variant that holds the whole timeline
 *   (d) plus the operator's closing bubble ("Perfeito, era isso mesmo. Pode seguir.")
 *   (5) the Artefatos tab (five cards, "há N seg.")
 *   (6) the Início dashboard (4 / 4 / 3 s) + the "Resposta mediana" tile alone + the exact clip that
 *       becomes the "Captura de tela" artifact
 *   (7) the sidebar alone, in both thread states (Ocioso / Em execução), plus per-element layers
 *
 * ### How the states are reached — real product mechanics, nothing patched in the app
 *   - "Em execução" is DERIVED (`ThreadStatusDeriver`: a non-archived issue in WORKING ⟹ RUNNING). An
 *     issue is opened through the REAL `createIssue` endpoint (`DeclareIssueOpen` — born WORKING, no
 *     agent run is queued by it, exactly what `10-terminal-tool-frame.spec.ts` relies on) and later
 *     closed through the REAL `transitionIssueStatus` endpoint. Four issues opened+closed today is what
 *     puts "4 Tarefas abertas · 4 Tarefas fechadas" on the dashboard and "4" on the sidebar counter.
 *   - The console's "Pensando" indicator mounts ONLY while the thread is RUNNING AND the newest
 *     transcript row is the CONTACT's own inbound message (`SessionChatSection.showThinkingIndicator`).
 *     A DIRECT (operator) bubble can never be the newest row of a thinking thread — so the scene the
 *     screenplay describes (spinner right under the operator's own bubble) needs one inbound CONTACT
 *     line AFTER the operator's message, which the capture layer then HIDES (see the tweaks below).
 *   - "3 s · Resposta mediana" is the REAL median (`GetHomeDashboard.medianResponse`): one inbound
 *     CONTACT line answered ~3s later by the operator's DIRECT bubble. That inbound line is the other
 *     hidden row.
 *
 * ### Capture-layer tweaks (DOM only, applied via `addInitScript` + MutationObserver — never app code)
 *   1. The workspace path (a `mkdtemp` under `/var/folders/…`) reads `~/acme/web` wherever it is
 *      printed: the session header's mono line and the FILE artifact row (the .md is written INSIDE the
 *      workspace so the same substitution covers it).
 *   2. The mention-gate caption ("Só responde quando mencionada com @codm-e2e-ws-…") is
 *      `visibility: hidden` — it leaks the e2e handle and is not part of the scene.
 *   3. The two inbound CONTACT rows described above are `display: none` in the transcript (the virtual
 *      list re-measures them to 0). They still exist server-side and therefore still show on the
 *      dashboard's "Últimas atividades" list, worded so they read naturally there.
 *   4. The five verb-named PNGs of state (b) set the indicator's verb text (the real component picks a
 *      random verb every ~6s; the screenplay names five specific ones). The glyph, ease and layout are
 *      untouched, and the un-tweaked frame + burst + webm carry whatever verbs the component chose.
 */

/** Where the film keeps its console assets — a sibling repo, overridable for anyone else's checkout. */
const OUT_DIR =
	process.env.FILM_ASSETS_DIR ??
	resolve(import.meta.dirname, '../../../../video-creation-framework/studio/saas-motion/videos/whatsapp-artefato/assets/console')

const FILM_WORKSPACE_PATH = '~/acme/web'
const MESSAGE_ASK = 'Ada, dá uma olhada no preview e me manda como ficou.'
const MESSAGE_OK = 'Perfeito, era isso mesmo. Pode seguir.'
/** The two inbound lines the capture layer hides in the transcript (see docblock, mechanics + tweak 3). */
const HIDDEN_INBOUND_BEFORE_ASK = 'Preview da PR 214 no ar. Quer que eu revise?'
const HIDDEN_INBOUND_AFTER_ASK = 'Olhando o preview agora.'
/** The five verbs the screenplay names for the "Pensando" beat (S8) — all members of `THINKING_VERBS`. */
const FILM_VERBS = ['Pensando', 'Explorando', 'Compilando', 'Costurando', 'Criando'] as const
/** Four synthetic issues — "4 Tarefas abertas · 4 Tarefas fechadas" on the dashboard, "4" on the rail. */
const ISSUE_TITLES = [
	'Revisar preview da PR 214',
	'Corrigir contraste do botão primário',
	'Atualizar dependências do web',
	'Escrever relatório da issue',
] as const
const LIVE_RECORDING_MS = 36_000
const MEDIA_TIMEOUT = { timeout: 15_000 }

// 1920×1080 @2x — every PNG below comes out 3840×2160 unless clipped/element-scoped.
test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 })

interface FilmTweaks {
	realPath: string
	filmPath: string
	mentionCaptionPrefix: string
	hiddenRowTexts: string[]
}

/**
 * Installs the capture-layer tweaks (docblock, "Capture-layer tweaks" 1–3) on a page BEFORE its first
 * navigation. A MutationObserver re-applies them on every DOM change, so React re-renders (SSE-driven
 * refetches, the virtual list re-mounting rows on scroll) never un-tweak a frame mid-capture.
 */
async function installFilmTweaks(page: Page, tweaks: FilmTweaks): Promise<void> {
	await page.addInitScript(cfg => {
		const apply = () => {
			const root = document.body ?? document.documentElement
			if (!root) return
			const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
			const texts: Text[] = []
			let node: Node | null = walker.nextNode()
			while (node) {
				texts.push(node as Text)
				node = walker.nextNode()
			}
			for (const text of texts) {
				const value = text.nodeValue
				if (!value) continue
				if (value.includes(cfg.realPath)) text.nodeValue = value.split(cfg.realPath).join(cfg.filmPath)
				if (value.startsWith(cfg.mentionCaptionPrefix) && text.parentElement) text.parentElement.style.visibility = 'hidden'
			}
			for (const row of Array.from(document.querySelectorAll<HTMLElement>('[data-slot="virtual-list-item"]'))) {
				const content = row.textContent ?? ''
				if (cfg.hiddenRowTexts.some(hidden => content.includes(hidden))) row.style.display = 'none'
			}
		}
		// Observe the DOCUMENT node, not `documentElement`: an init script runs at document creation, when
		// `<html>` may not exist yet — `observe(null)` throws and silently kills the whole tweak. The
		// interval is a belt-and-suspenders sweep for anything a mutation batch might slip past.
		new MutationObserver(apply).observe(document, { childList: true, subtree: true, characterData: true })
		document.addEventListener('DOMContentLoaded', apply)
		setInterval(apply, 250)
	}, tweaks)
}

/** A clip spanning two elements vertically, full width of `<main>` — for "header", "composer", bursts. */
async function clipBetween(page: Page, top: Locator, bottom: Locator, pad = 8) {
	const main = await page.locator('main').boundingBox()
	const a = await top.boundingBox()
	const b = await bottom.boundingBox()
	if (!main || !a || !b) throw new Error('clipBetween: an element has no box')
	const y = Math.max(a.y - pad, 0)
	return { x: main.x, y, width: main.width, height: b.y + b.height + pad - y }
}

const sleep = (ms: number) => new Promise(resolvePromise => setTimeout(resolvePromise, ms))

test('demo: film assets — Ada thread through (a)→(d), catalog, dashboard, sidebar, thinking indicator', async ({ page, browser, goto }) => {
	// biome-ignore lint/suspicious/noSkippedTests: intentional OPT-IN gate, see docblock — this writes film assets into a sibling repo and records for 36s; never part of the normal suite.
	test.skip(process.env.DEMO !== 'on', 'demo spec — opt-in via DEMO=on (writes film assets outside the repo, see docblock)')
	test.setTimeout(420_000)

	mkdirSync(join(OUT_DIR, 'layers'), { recursive: true })
	mkdirSync(join(OUT_DIR, 'pensando', 'frames'), { recursive: true })
	const out = (name: string) => join(OUT_DIR, name)
	const layer = (name: string) => join(OUT_DIR, 'layers', name)

	const user = await givenFreshUser({})
	const client = user.session.client
	const thread = await givenAttachedThread(user.session, { displayName: 'Ada' })
	await givenCompletedOnboarding(user.session)
	const scratch = mkdtempSync(join(tmpdir(), 'codm-film-'))

	const inbound = (text: string) =>
		injectInboundMessage(user.session, {
			channelId: thread.channelId,
			contactExternalId: thread.contactExternalId,
			senderExternalId: thread.contactExternalId,
			contactDisplayName: 'Ada',
			// No mention tag: the thread is mention-gated from birth, so an uncited line is transcribed
			// and never classified — no agent run, no reply, just the CONTACT row this scene needs.
			text,
		})

	const tweaks: FilmTweaks = {
		realPath: thread.workspacePath,
		filmPath: FILM_WORKSPACE_PATH,
		mentionCaptionPrefix: t('session.autonomyMentionGated').split('{{')[0]?.trimEnd() ?? 'Só responde quando mencionada',
		hiddenRowTexts: [HIDDEN_INBOUND_BEFORE_ASK, HIDDEN_INBOUND_AFTER_ASK],
	}
	await authenticateCloudSession(page)
	await installFilmTweaks(page, tweaks)

	// ── The conversation's opening: one inbound line, answered 3s later by the operator's bubble.
	//    That pair IS the dashboard's "3 s · Resposta mediana" (real median, one wait of ~3s today).
	await inbound(HIDDEN_INBOUND_BEFORE_ASK)
	await sleep(3_000)
	await sendDirectMessage(thread.threadId, { text: MESSAGE_ASK }, { client })

	const threadRoute = '/threads/$threadId' as const
	const statusBadge = () => page.locator('h1').locator('xpath=following-sibling::span[1]')
	const askRow = () => page.locator('[data-slot="virtual-list-item"]', { hasText: MESSAGE_ASK })
	const header = () => page.locator('h1').locator('xpath=ancestor::div[contains(@class,"sticky")][1]')
	const composerHint = () => page.getByText(t('session.composerDirectHint'))
	const composerInput = () => page.getByPlaceholder(t('session.composerPlaceholderDirect'))

	// ── (a) only the operator's bubble, thread Ocioso ────────────────────────────────────────────
	await goto(threadRoute, { threadId: thread.threadId })
	await expect(askRow()).toBeVisible()
	await expect(statusBadge()).toHaveText(t('enums.ThreadStatus.IDLE'))
	await expect(page.getByText(FILM_WORKSPACE_PATH, { exact: false })).toBeVisible()
	await expect(page.locator('[data-slot="virtual-list-item"]', { hasText: HIDDEN_INBOUND_BEFORE_ASK })).toBeHidden()
	await expect(composerHint()).toBeVisible()
	await page.waitForTimeout(800) // let fonts/avatars settle before the frame
	await page.screenshot({ path: out('chat-a.png'), fullPage: false })
	await page.locator('aside').screenshot({ path: out('sidebar.png') })
	await header().screenshot({ path: layer('header--ocioso.png') })
	await askRow().screenshot({ path: layer('bubble--ask.png') })
	// The brand mark and the wordmark, as the rail renders them (the vector is `codm-logomark.svg` beside).
	await page
		.locator('aside svg')
		.first()
		.screenshot({ path: out('logo-dm.png') })
	await page
		.locator('aside')
		.getByText('CODM', { exact: true })
		.screenshot({ path: out('wordmark-codm.png') })
	await page.screenshot({ path: layer('composer.png'), clip: await clipBetween(page, composerInput(), composerHint(), 12) })

	// ── (b) Em execução + the live "Pensando" indicator ──────────────────────────────────────────
	await inbound(HIDDEN_INBOUND_AFTER_ASK)
	const working = await createIssue(thread.threadId, { title: ISSUE_TITLES[0], provider: 'CLAUDE_CODE' }, { client })
	await expect.poll(async () => (await getSessionChat(thread.threadId, { client })).thread.status, { timeout: 20_000 }).toBe('RUNNING')
	await expect(statusBadge()).toHaveText(t('enums.ThreadStatus.RUNNING'), { timeout: 20_000 })
	const indicator = page.locator('[data-slot="thinking-indicator"]')
	await expect(indicator).toBeVisible({ timeout: 20_000 })
	await expect(page.locator('[data-slot="virtual-list-item"]', { hasText: HIDDEN_INBOUND_AFTER_ASK })).toBeHidden()
	await page.waitForTimeout(800)
	await page.screenshot({ path: out('chat-b-running.png'), fullPage: false })
	await page.locator('aside').screenshot({ path: out('sidebar--running.png') })
	await header().screenshot({ path: layer('header--em-execucao.png') })
	await indicator.screenshot({ path: layer('thinking-indicator.png') })

	// A burst of one spinner cycle (2s ease, 27 glyphs) — bubble + indicator, full main width. Each
	// frame's wall-clock offset goes to a sidecar so the film can re-time them against the real ease.
	const burstClip = await clipBetween(page, askRow(), indicator, 16)
	const burstStarted = Date.now()
	const burstTimings: { frame: string; atMs: number; verb: string; glyph: string }[] = []
	for (let index = 0; index < 40; index++) {
		const frame = `frame-${String(index).padStart(3, '0')}.png`
		const [glyph, verb] = await Promise.all([
			indicator.locator('span').first().textContent(),
			indicator.locator('span').last().textContent(),
		])
		await page.screenshot({ path: join(OUT_DIR, 'pensando', 'frames', frame), clip: burstClip })
		burstTimings.push({ frame, atMs: Date.now() - burstStarted, verb: verb ?? '', glyph: glyph ?? '' })
	}
	writeFileSync(join(OUT_DIR, 'pensando', 'frames', 'timings.json'), JSON.stringify(burstTimings, null, '\t'))

	// The five named verbs (tweak 4): text of the verb span only, right before each frame.
	const verbSpan = indicator.locator('span').last()
	for (const verb of FILM_VERBS) {
		await verbSpan.evaluate((el, value) => {
			el.textContent = `${value}…`
		}, verb)
		await expect(verbSpan).toHaveText(`${verb}…`)
		await page.screenshot({ path: join(OUT_DIR, 'pensando', `${verb.toLowerCase()}.png`), clip: burstClip })
		await page.screenshot({ path: join(OUT_DIR, 'pensando', `${verb.toLowerCase()}--full.png`), fullPage: false })
	}

	// Live recording of the indicator in a SECOND context (the main page keeps its @2x PNG job). The
	// verb changes every 3 spinner cycles (~6s), so 36s ≈ six verbs, all chosen by the component.
	const origin = new URL(page.url()).origin
	const recorder = await browser.newContext({
		viewport: { width: 1920, height: 1080 },
		deviceScaleFactor: 2,
		locale: 'pt-BR',
		recordVideo: { dir: scratch, size: { width: 1920, height: 1080 } },
	})
	const recorderPage = await recorder.newPage()
	await authenticateCloudSession(recorderPage)
	await installFilmTweaks(recorderPage, tweaks)
	await recorderPage.goto(`${origin}/app/threads/${thread.threadId}`)
	await expect(recorderPage.locator('[data-slot="thinking-indicator"]')).toBeVisible({ timeout: 20_000 })
	await recorderPage.waitForTimeout(LIVE_RECORDING_MS)
	const liveVideo = recorderPage.video()
	await recorder.close()
	if (liveVideo) copyFileSync(await liveVideo.path(), join(OUT_DIR, 'pensando', 'live.webm'))

	// ── Close the work: the remaining issues open+close today → 4 / 4 on the dashboard, thread back
	//    to Ocioso, no agent running. Real endpoints, real derivation.
	await transitionIssueStatus(
		thread.threadId,
		working.issueId,
		{ status: 'COMPLETED', summary: 'Preview revisado.', key: working.key },
		{ client },
	)
	for (const title of ISSUE_TITLES.slice(1)) {
		const issue = await createIssue(thread.threadId, { title, provider: 'CLAUDE_CODE' }, { client })
		await transitionIssueStatus(thread.threadId, issue.issueId, { status: 'COMPLETED', summary: 'Feito.', key: issue.key }, { client })
	}
	await expect.poll(async () => (await getSessionChat(thread.threadId, { client })).thread.status, { timeout: 20_000 }).toBe('IDLE')

	// ── (6) Início — 4 / 4 / 3 s, no agents working — and the clip that becomes the image artifact.
	await goto('/dashboard')
	await expect(page.getByRole('heading', { name: t('nav.home') })).toBeVisible()
	await expect(page.getByText(t('dashboard.agentsWorkingNone'), { exact: false })).toBeVisible({ timeout: 20_000 })
	const tile = (label: string) => page.getByText(label, { exact: true }).locator('xpath=..')
	await expect(tile(t('dashboard.issuesOpened'))).toContainText('4', { timeout: 20_000 })
	await expect(tile(t('dashboard.issuesClosed'))).toContainText('4')
	await expect(tile(t('dashboard.medianResponse'))).toContainText('3')
	await page.waitForTimeout(800)
	await page.screenshot({ path: out('dashboard.png'), fullPage: false })
	await tile(t('dashboard.medianResponse')).screenshot({ path: out('stat-3s.png') })
	const imagePath = join(scratch, 'captura-do-console.png')
	const dashboardClip = await clipBetween(
		page,
		page.getByRole('heading', { name: t('nav.home') }),
		page.getByRole('heading', { name: t('dashboard.activeSessions') }),
		24,
	)
	await page.screenshot({ path: imagePath, clip: dashboardClip })
	copyFileSync(imagePath, out('dashboard--clip-captura-de-tela.png'))

	// The video artifact: a real webm from Playwright's own encoder, same recipe as 11-artifact-preview.
	const videoContext = await browser.newContext({ recordVideo: { dir: scratch, size: { width: 640, height: 400 } } })
	const videoPage = await videoContext.newPage()
	await authenticateCloudSession(videoPage)
	await videoPage.goto(`${origin}/app/dashboard`)
	await videoPage.waitForTimeout(1_200)
	const recordedVideo = videoPage.video()
	await videoContext.close()
	const videoPath = join(scratch, 'gravacao-do-fluxo.webm')
	copyFileSync(await recordedVideo!.path(), videoPath)

	const audioPath = writeSampleWav(scratch)
	// INSIDE the workspace, so the FILE row's path reads `~/acme/web/relatorio-da-issue.md` (tweak 1).
	const filePath = writeSampleFile(thread.workspacePath)

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
	await givenArtifact(user.session, { threadId: thread.threadId, kind: 'FILE', name: 'relatorio-da-issue.md', ref: filePath, meta: '5 KB' })

	// ── (5) Artefatos — straight after recording, so the cards still read "há N seg." ─────────────
	await goto('/threads/$threadId/artifacts', { threadId: thread.threadId })
	const cardImage = page.locator('img[alt="captura-do-console.png"]')
	await expect(cardImage).toBeVisible(MEDIA_TIMEOUT)
	await expect.poll(() => cardImage.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 15_000 }).toBeGreaterThan(0)
	await expect(page.locator('video')).toBeVisible(MEDIA_TIMEOUT)
	await expect(page.locator('audio')).toBeVisible(MEDIA_TIMEOUT)
	await expect(page.getByText('relatorio-da-issue.md', { exact: true })).toBeVisible()
	await page.waitForTimeout(600)
	await page.screenshot({ path: out('artefatos.png'), fullPage: false })
	const card = (name: string) =>
		page.locator('main').getByText(name, { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-asymmetric-lg")][1]')
	for (const name of [
		'relatorio-da-issue.md',
		'Deploy de preview',
		'nota-de-voz.wav',
		'gravacao-do-fluxo.webm',
		'captura-do-console.png',
	]) {
		await card(name).screenshot({ path: layer(`catalog-card--${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`) })
	}

	// ── (c) the full thread, five artifacts, Ocioso ──────────────────────────────────────────────
	await goto(threadRoute, { threadId: thread.threadId })
	const image = page.locator('img[alt="captura-do-console.png"]')
	await expect(image).toBeVisible(MEDIA_TIMEOUT)
	await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 15_000 }).toBeGreaterThan(0)
	await expect(page.locator('a[href="https://acme-pr-214.vercel.app"]')).toBeVisible(MEDIA_TIMEOUT)
	await expect(page.getByText(`${FILM_WORKSPACE_PATH}/relatorio-da-issue.md`)).toBeVisible()
	await expect(statusBadge()).toHaveText(t('enums.ThreadStatus.IDLE'))
	await page.waitForTimeout(1_000)
	await page.screenshot({ path: out('chat-c-artifacts.png'), fullPage: false })

	// Tall variant — the transcript is a windowed scroller (fullPage cannot reach it), so the viewport
	// grows until one frame holds every row; per-row layers are taken here, where all rows are mounted.
	await page.setViewportSize({ width: 1920, height: 1800 })
	await page.waitForTimeout(1_000)
	await page.screenshot({ path: out('chat-c-artifacts--tall.png'), fullPage: false })
	// By what each row CONTAINS — the media rows print no file name, only the element (`<img>`,
	// `<video>`, `<audio>`), the link row its href, the file row its path.
	const artifactRows: [string, string][] = [
		['img[alt="captura-do-console.png"]', 'artifact--captura-de-tela'],
		['video', 'artifact--video'],
		['audio', 'artifact--audio'],
		['a[href="https://acme-pr-214.vercel.app"]', 'artifact--deploy-de-preview'],
		['a[href*="/artifacts/"][href$="/content"]', 'artifact--arquivo'],
	]
	for (const [selector, name] of artifactRows) {
		const row = page
			.locator('[data-slot="virtual-list-item"]')
			.filter({ has: page.locator(selector) })
			.first()
		await expect(row).toBeVisible()
		await row.scrollIntoViewIfNeeded()
		await row.screenshot({ path: layer(`${name}.png`) })
	}
	await page.setViewportSize({ width: 1920, height: 1080 })

	// ── (d) the closing bubble ──────────────────────────────────────────────────────────────────
	await sendDirectMessage(thread.threadId, { text: MESSAGE_OK }, { client })
	// A fresh navigation, not a wait: an operator DIRECT sent through the SDK is not one of the events
	// `useThreadRealtime` invalidates the chat on, so the mounted page never learns about it (measured:
	// 20s, no row). `11-artifact-preview.spec.ts` sends both messages BEFORE navigating for this reason.
	await goto(threadRoute, { threadId: thread.threadId })
	const okRow = page.locator('[data-slot="virtual-list-item"]', { hasText: MESSAGE_OK })
	await expect(okRow).toBeVisible({ timeout: 20_000 })
	await expect(page.locator('a[href="https://acme-pr-214.vercel.app"]')).toBeVisible(MEDIA_TIMEOUT)
	await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 15_000 }).toBeGreaterThan(0)
	await page.waitForTimeout(1_200)
	await page.screenshot({ path: out('chat-d-reply.png'), fullPage: false })
	await okRow.screenshot({ path: layer('bubble--ok.png') })
	await page.setViewportSize({ width: 1920, height: 1800 })
	await page.waitForTimeout(1_000)
	await page.screenshot({ path: out('chat-d-reply--tall.png'), fullPage: false })

	// The order the screenplay depends on: ask → artifacts → ok, merged by timestamp.
	const rows = page.locator('[data-slot="virtual-list-item"]:visible')
	expect(await rows.first().textContent()).toContain('dá uma olhada no preview')
	expect(await rows.last().textContent()).toContain('era isso mesmo')
})
