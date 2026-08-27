import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Page } from '@playwright/test'
import {
	addWorkspace,
	getAttachThreadWizard,
	getSessionIssues,
	getThreadSettings,
	setParticipantInvocation,
} from '@codm/client-typescript/typescript'
import { test, expect } from '../utils/test'
import { givenFreshUser, injectInboundMessage, selectAgentScenario, type AgentScenarioId } from '../utils/given'
import { authenticateCloudSession } from '../utils/given/cloud'
import { createDemoCursor } from '../demo/cursor'
import { createDemoRecorder } from '../demo/recorder'
import { writeBuiltScreen } from '../demo/demo-screen'
import { t, type Locale } from '../utils/i18n'

/**
 * DEMO — the product film, in ONE continuous take, entirely inside the console.
 *
 * The founder's brief (`.plans/2026-08-27-demo-roteirizada.md`): attach a conversation from inside the
 * product, watch a message arrive, watch the agent answer and open a task, watch that task's terminal
 * work, and end on the image of the screen it built plus the link to its pull request — with NO
 * WhatsApp on screen at any point.
 *
 * Everything below is the REAL console driven through the REAL stack (daemon + gateway + SPA over a
 * scratch SQLite), with synthetic data only — the same rule `91-demo-thread-artifacts.spec.ts` states
 * for its own captures. What is scripted is what the AGENT says and does: the `demo` roteiro
 * (`agent/services/AgentScenario/scenarios.ts`, selected through the `/_test/agent/scenario` door)
 * declares its lines, its tool frames and the two artifacts it declares over the real MCP endpoint.
 * Nothing about the transport, the events, the projections or the UI is faked.
 *
 * Gated behind `DEMO=on` like `90` and `91`: it takes minutes, it paces the agent deliberately, and it
 * switches a daemon-wide scenario that every other spec's assertions depend on. Invocation:
 *
 *   DEMO=on FILM=pt bun scripts/run-e2e.ts tests/92-demo-attach-artefato.spec.ts
 *   DEMO=on FILM=en bun scripts/run-e2e.ts tests/92-demo-attach-artefato.spec.ts
 *
 * ONE FILM PER INVOCATION — see the `test.skip` below for why the harness cannot record both in one
 * daemon. Then turn each take into something watchable:
 *
 *   bun demo/render-mp4.ts demo-out/demo-attach-artefato-pt         # the MP4
 *   bun demo/generate-html.ts demo-out/demo-attach-artefato-pt      # inspect frames in a browser
 *   bun demo/generate-svg.ts  demo-out/demo-attach-artefato-pt      # vector frames for the edit
 *
 * ### What is ON camera and what is not
 * The film starts at `/attach`. Everything before it is state a real operator would already have:
 * a completed onboarding, a paired channel, a project folder. The channel is paired OFF camera
 * THROUGH THE REAL UI (`/channels`, the same flow `12-channel-qr.spec.ts` proves) rather than through
 * the `/_test/gateway` seam — not for honesty points, but because the contact list the attach wizard
 * offers only exists after the gateway's real sync pipeline has run. The seam seeds a channel ROW; it
 * does not seed the people in it.
 *
 * ### Why the mention tag is readable instead of hidden
 * A thread is mention-gated from birth and the tag is minted from the workspace's FOLDER NAME
 * (`mintMentionTag`). `91` had to hide that caption because a `mkdtemp` folder mints an unreadable
 * handle. This film gives the workspace a real name — `web` — so the tag mints as `@web`, the caption
 * reads "Só responde quando mencionada com @web", and the contact's message can cite it in a way a
 * person would actually type. A product detail worth showing, obtained by naming a folder.
 *
 * ### Capture-layer tweaks (DOM only, via `addInitScript` + MutationObserver — never app code)
 * Two, both substitutions in text nodes. Nothing about layout, timing or behaviour is touched.
 *   1. `91`'s: the scratch workspace paths read `~/acme/web` and `~/acme/api` wherever they print.
 *   2. The MCP declarations print raw uuids in the terminal panel's action rows —
 *      `TerminalOutputAccumulator.summarize` keeps only top-level SCALARS of a tool's input, so an
 *      MCP call shows its ids and drops the `data` that carries the interesting half. Those
 *      `<name>Id: <uuid>` pairs are dropped, leaving the tool name, which is the informative part.
 */

/**
 * Where takes land — `packages/e2e/demo-out/`, and NOT the recorder's own default.
 *
 * `createDemoRecorder.save(name)` defaults to `e2e/recordings/<name>`, which is Playwright's
 * `outputDir` (playwright.config.ts) — a directory Playwright OWNS and WIPES at the start of every
 * run. Measured the hard way: this film recorded cleanly, then a later `run-e2e.ts` on an unrelated
 * spec deleted all 679 frames of it. A take costs minutes and cannot be reproduced byte-for-byte
 * (jitter, timing), so it does not live anywhere a test runner is entitled to clear.
 *
 * `demo-out/` is the name the rest of the family already uses for this — see `demo/README.md`.
 */
const filmDir = (name: string) => resolve(import.meta.dirname, '..', 'demo-out', name)

/** What the workspace path reads as on screen. */
const FILM_WORKSPACE_PATH = '~/acme/web'
/** The folder is really named this, so the mention tag mints as `@web` (see docblock). */
const FILM_WORKSPACE_FOLDER = 'web'
const FILM_MENTION_TAG = `@${FILM_WORKSPACE_FOLDER}`

/** The project the operator already had — the console is never empty in the film. */
const PRIOR_WORKSPACE_PATH = '~/acme/api'
const PRIOR_WORKSPACE_FOLDER = 'api'

/** `mock.ContactSeed{Name: "Ada Lovelace"}` — `packages/api/go/internal/channel/overlay.go`. */
const ROTEIRO_CONTACT_NAME = 'Ada Lovelace'
/** The roteiro's OTHER seeded contact — the prior conversation, attached off camera. */
const PRIOR_CONTACT_NAME = 'Alan Turing'
/** `providerLabel[ProviderKind.CLAUDE_CODE]`, DETECTED by the e2e column's `MockProviderDetector`. */
const ROTEIRO_PROVIDER_NAME = 'Claude Code'

/** The LINK artifact the film ends on — the one value both languages share (`DEMO_PR_URL`). */
const DEMO_PR_URL = 'https://github.com/acme/web/pull/214'

/**
 * ONE film, in one language.
 *
 * Every field here is a value the DAEMON's roteiro decides (`agent/services/AgentScenario/scenarios.ts`)
 * and this spec has to recognise on screen — restated rather than imported, because a spec cannot reach
 * into daemon source. `AgentScenarioSelection.test.ts` is what stops the two sides drifting silently:
 * it pins the roteiro's own copy without needing a browser.
 *
 * The two entries below are the SAME film. That is enforced on the daemon side — `demoScenario` builds
 * both from one structure, and a unit test asserts cut-for-cut equality — so what differs here is
 * words, a scenario id and an output directory.
 */
interface Film {
	readonly locale: Locale
	/** What `navigator.language` reports, and what the i18n detector caches (`app/react/src/lib/i18n.ts`). */
	readonly browserLocale: string
	readonly scenarioId: AgentScenarioId
	readonly dir: string
	/** What the contact writes. Cites the thread's tag, because the gate is on from birth. */
	readonly ask: string
	/** A substring of the ask, for locating its row once it lands. */
	readonly askRow: string
	/** A substring of the agent's opening reply — the beat that proves the turn ran. */
	readonly reply: string
	/** A substring of the agent's closing line, said on the `ISSUE_RESULT` turn. */
	readonly closing: string
	/** The fork goal, slugged server-side — the key the issue row shows. */
	readonly issueKey: string
	/** The IMAGE artifact the work turn declares, written into the workspace before it runs. */
	readonly screenFile: string
}

const FILMS: readonly Film[] = [
	{
		locale: 'pt',
		browserLocale: 'pt-BR',
		scenarioId: 'demo-pt',
		dir: 'demo-attach-artefato-pt',
		ask: `${FILM_MENTION_TAG} a tela de cobrança tá sem o resumo do plano. consegue montar?`,
		askRow: 'resumo do plano',
		reply: 'vou montar o resumo do plano',
		closing: 'os testes passaram e o PR está aberto',
		issueKey: 'montar-o-resumo-do-plano-assinado',
		screenFile: 'resumo-do-plano.png',
	},
	{
		locale: 'en',
		browserLocale: 'en-US',
		scenarioId: 'demo-en',
		dir: 'demo-attach-artefato-en',
		ask: `${FILM_MENTION_TAG} the billing screen is missing the plan summary. can you build it?`,
		askRow: 'plan summary',
		reply: "I'll build the plan summary into the billing screen",
		closing: 'the tests pass and the PR is open',
		issueKey: 'add-the-plan-summary-to-billing',
		screenFile: 'plan-summary.png',
	},
]

// 1920×1080 — the DOM recorder captures structure, not pixels, so `deviceScaleFactor` buys nothing
// here (unlike `91`, which takes @2x PNGs). The viewport is what decides the layout on film.
test.use({ viewport: { width: 1920, height: 1080 } })

interface FilmTweaks {
	/** Scratch directory → what it reads as on screen. Applied to every text node. */
	paths: { from: string; to: string }[]
}

/**
 * Install the capture-layer substitutions BEFORE the page's first navigation.
 *
 * A MutationObserver re-applies them on every DOM change, so React re-renders — SSE-driven refetches,
 * the virtual list re-mounting rows as the terminal scrolls — never un-tweak a frame mid-take.
 * Lifted from `91`, minus the tweaks this film does not need (see this file's docblock).
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
				let next = value
				for (const path of cfg.paths) if (next.includes(path.from)) next = next.split(path.from).join(path.to)
				// `threadId: 0193…, issueId: 0193…` on the terminal's MCP action rows. Dropped rather than
				// substituted: there is no shorter true thing to put there, and the tool NAME is the
				// informative half. Matched by PATTERN rather than against a known id, because the ids are
				// minted after this script is installed and `addInitScript` only reaches future documents —
				// re-installing it mid-take would never run.
				next = next.replace(/\b(?:owner|thread|issue|entry)Id:\s*[0-9a-f]{8}-[0-9a-f-]{27}(?:,\s*)?/gi, '')
				if (next !== value) text.nodeValue = next
			}
		}
		// Observe the DOCUMENT node, not `documentElement`: an init script runs at document creation,
		// when `<html>` may not exist yet — `observe(null)` throws and silently kills the whole tweak.
		new MutationObserver(apply).observe(document, { childList: true, subtree: true, characterData: true })
		document.addEventListener('DOMContentLoaded', apply)
		setInterval(apply, 250)
	}, tweaks)
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

for (const film of FILMS) {
	// A `describe` per film so `test.use` can set the CONTEXT's locale — `navigator.language` is the
	// second thing the console's detector reads, after localStorage (`app/react/src/lib/i18n.ts`), and
	// it is also what formats the timestamps beside every message.
	test.describe(`${film.locale}`, () => {
		test.use({ locale: film.browserLocale })

		test(`demo: attach → conversa → issue → terminal → artefato, tudo dentro do app (${film.locale})`, async ({ page, browser, goto }) => {
			// biome-ignore lint/suspicious/noSkippedTests: intentional OPT-IN gate, see docblock — this paces an agent for ~30s on purpose and switches a daemon-wide scenario every other spec depends on; it must never run as part of the normal suite.
			test.skip(process.env.DEMO !== 'on', 'demo spec — opt-in via DEMO=on (see docblock: it is a film, not a gate)')
			// ONE FILM PER RUN, and the constraint is the harness's, not this spec's. `OperatorMiddleware`
			// stamps a single constant operator, so a daemon has ONE onboarding row and ONE roster of
			// attached contacts (`06-onboarding-attach.spec.ts` documents the collapse at length). The second
			// film in a shared daemon would find onboarding already complete and Ada already attached — the
			// two things its opening depends on. `run-e2e.ts` mints a fresh scratch data dir per INVOCATION,
			// so two invocations is exactly what buys two fresh daemons.
			// biome-ignore lint/suspicious/noSkippedTests: the unsafe fix SILENTLY STRIPS this `.skip` on every commit (spec `90` carries the same guard and the same warning) — without it both films record into one daemon and the second one fails on state the first left behind.
			test.skip(process.env.FILM !== film.locale, `this film records alone — re-run with FILM=${film.locale} (see the note above for why)`)
			test.setTimeout(420_000)

			// ── OFF CAMERA — the state a real operator would already have ────────────────────────────────
			const user = await givenFreshUser({})
			const client = user.session.client
			await selectAgentScenario(user.session, film.scenarioId)

			// Two folders, because the console will show two projects: the one the film works in, and the one
			// the operator already had. Real directories — `AddWorkspace` stats the path and rejects a missing
			// one — and the film one is really NAMED `web`, which is what mints the readable tag (docblock).
			const projects = mkdtempSync(join(tmpdir(), 'codm-demo-'))
			const workspacePath = join(projects, FILM_WORKSPACE_FOLDER)
			const priorWorkspacePath = join(projects, PRIOR_WORKSPACE_FOLDER)
			mkdirSync(workspacePath, { recursive: true })
			mkdirSync(priorWorkspacePath, { recursive: true })
			// The bytes the scripted work turn will declare as its IMAGE artifact. Written BEFORE the turn
			// runs, because the declaration names a path and `RecordArtifact` is not going to invent one.
			await writeBuiltScreen(browser, workspacePath, film.screenFile, film.locale)
			await addWorkspace({ path: workspacePath }, { client })

			// THE LANGUAGE, seeded before the first navigation. The console's detector reads
			// `localStorage` first and `navigator` second (`app/react/src/lib/i18n.ts`), and it CACHES its
			// verdict back into localStorage — so writing the key is both belt and braces for the context
			// locale above, and immune to the detector normalising `pt-BR` to `pt` on its own.
			await page.addInitScript(lng => window.localStorage.setItem('i18nextLng', lng), film.locale)
			await authenticateCloudSession(page)
			await installFilmTweaks(page, {
				paths: [
					{ from: workspacePath, to: FILM_WORKSPACE_PATH },
					{ from: priorWorkspacePath, to: PRIOR_WORKSPACE_PATH },
				],
			})

			// ── The operator's PRIOR history, walked through the onboarding wizard itself ─────────────────
			//
			// This is 35 lines of clicking that never reaches the film, and the reasons it is not an SDK call
			// are worth stating, because the obvious shortcut is broken and the second-obvious one is a lie:
			//
			//  1. `givenCompletedOnboarding` (bare `completeOnboarding`) NO LONGER WORKS — the 2026-08-26
			//     draft/atomic-commit rewrite made `CompleteOnboarding` revalidate a server-side draft, and a
			//     bare call presents an empty one (`ONBOARDING_DRAFT_INCOMPLETE`). That breakage is not this
			//     film's to fix: it is failing 6 specs at HEAD on this branch, and repairing it properly means
			//     deciding what "completed" should mean for a spec that has no channel at all.
			//  2. There is no skip endpoint. Completing REQUIRES a draft, and a draft always materializes a
			//     thread — so the console cannot be reached with zero conversations in it, whatever route is
			//     taken. Rather than fight that, the film accepts it and uses it: the prior conversation is
			//     ALAN TURING (the roteiro's other seeded contact) on the other project, which is what a real
			//     operator's console looks like anyway. Ada stays untouched for the attach that IS on camera.
			//  3. Pairing the channel has to happen before any of it, and it is the wizard's own CHANNEL step
			//     that does it — `ConnectChannelForm` auto-connects on mount, and the Go roteiro serves a real
			//     QR then pairs after 2s through the real mapper → outbox → handler → projector chain. The
			//     contact list every later step reads only exists once that sync has run.
			//
			// Plain Playwright clicks, no cursor and no recorder: none of this is on film. The selectors are
			// `90-demo-onboarding.spec.ts`'s, which is where they are actually covered.
			await goto('/dashboard')
			await expect(page).toHaveURL(/\/onboarding/)
			await page
				.locator('[data-sonner-toast]')
				.first()
				.waitFor({ state: 'detached', timeout: 8_000 })
				.catch(() => {})

			const next = () => page.getByRole('button', { name: t('onboarding.next', film.locale) })
			for (const slide of ['onboarding.slide1Title', 'onboarding.slide2Title', 'onboarding.slide3Title'] as const) {
				await expect(page.getByRole('heading', { name: t(slide, film.locale) })).toBeVisible()
				await next().click()
			}

			// CHANNEL — nothing to click to begin; the form connects on mount and the roteiro pairs after 2s.
			await expect(page.getByText(t('channels.pairConnectedTitle', film.locale))).toBeVisible({ timeout: 30_000 })
			await next().click()

			// WORKSPACE — the project the operator already had.
			await page.getByRole('button', { name: t('workspaces.addFolderRow', film.locale) }).click()
			await page.getByLabel(t('workspaces.projectFolder', film.locale)).fill(priorWorkspacePath)
			await Promise.all([
				page.waitForResponse(res => res.url().includes('/ui/onboarding/step') && res.request().method() === 'PATCH' && res.ok()),
				next().click(),
			])

			// CONTACT — Alan, NOT Ada: the film's own attach needs an unattached contact to pick.
			await expect(page.getByRole('heading', { name: t('attach.stepThreadTitle', film.locale) })).toBeVisible()
			await page.getByRole('button', { name: PRIOR_CONTACT_NAME }).click({ timeout: 30_000 })
			await next().click()

			// AGENTS + REVIEW, then the commit that materializes the prior workspace and thread.
			await expect(page.getByRole('heading', { name: t('attach.stepAgentsTitle', film.locale) })).toBeVisible()
			await page.locator('[role="button"]').filter({ hasText: ROTEIRO_PROVIDER_NAME }).click()
			await next().click()
			await expect(page.getByRole('heading', { name: t('attach.stepReviewTitle', film.locale) })).toBeVisible()
			await next().click()
			await expect(page.getByRole('heading', { name: t('onboarding.finalTitle', film.locale) })).toBeVisible()
			await Promise.all([
				page.waitForResponse(res => res.url().includes('/ui/onboarding/complete') && res.request().method() === 'POST' && res.ok()),
				page.getByRole('button', { name: t('onboarding.getStarted', film.locale) }).click(),
			])
			await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 })

			// WHO the message will come from, read off the same wizard query the CONTACT step renders — so the
			// person the cursor clicks below and the person who writes are the same row, by construction. The
			// sync rides the connect event through a separate handler, hence the poll rather than a read.
			let contact: { channelId: string; externalId: string } | undefined
			await expect
				.poll(
					async () => {
						const wizard = await getAttachThreadWizard({}, { client })
						contact = wizard.contacts.find(candidate => candidate.displayName === ROTEIRO_CONTACT_NAME)
						return contact?.externalId
					},
					{ timeout: 30_000, message: `the roteiro's contact "${ROTEIRO_CONTACT_NAME}" never synced into the wizard` },
				)
				.toBeTruthy()
			if (!contact) throw new Error('unreachable — the poll above only settles once the contact is found')
			const sender = contact

			// ── ROLL ─────────────────────────────────────────────────────────────────────────────────────
			await goto('/attach')
			await expect(page.getByRole('heading', { name: t('attach.stepThreadTitle', film.locale) })).toBeVisible()

			// A QUARTER SLOWER THAN CANON, and declared here rather than in the default (founder's call,
			// 27/08). `DEFAULT_PACE.speedPxPerMs` is 1.6 — the family's measured "mão decidida", tuned for a
			// PR smoke that wants to be quick. A product film is watched by someone deciding whether to care,
			// and it can afford to let the eye follow the pointer to its target. This is exactly the override
			// `CursorPace` exists for: one journey choosing its own tempo, without recalibrating a module
			// constant for every other journey in the family.
			const cursor = await createDemoCursor(page, { pace: { speedPxPerMs: 1.2 } })
			// DOM at 10fps, cursor at 30. The two rates are independent knobs by design: the cursor timeline is
			// a few numbers per frame while a DOMSnapshot of this console is ~hundreds of KB, so the take's
			// whole cost lives in `domFps`. At ~90s this lands around 900 snapshots — raise it and the recorder
			// holds them all in memory before writing.
			const recorder = await createDemoRecorder(page, { fps: 60, domFps: 60 })
			await recorder.start()
			await sleep(700) // a beat of stillness before the first move — the take needs a head

			// 1. CONTACT — a person from the roteiro's seeded contact list, synced through the real pipeline.
			const contactRow = page.getByRole('button', { name: ROTEIRO_CONTACT_NAME })
			await expect(contactRow).toBeVisible({ timeout: 20_000 })
			await cursor.click(contactRow)
			await sleep(400)
			await cursor.click(page.getByRole('button', { name: t('attach.continue', film.locale) }))

			// 2. WORKSPACE — located by the FILM path, because the tweak has already rewritten the row's text.
			await expect(page.getByRole('heading', { name: t('attach.stepWorkspaceTitle', film.locale) })).toBeVisible()
			const workspaceRow = page.locator('main').getByRole('button').filter({ hasText: FILM_WORKSPACE_PATH }).first()
			await expect(workspaceRow).toBeVisible()
			await cursor.click(workspaceRow)
			await sleep(400)
			await cursor.click(page.getByRole('button', { name: t('attach.continue', film.locale) }))

			// 3. AGENTS — "Claude Code" is DETECTED by the e2e column's canned catalog, no PATH probe.
			await expect(page.getByRole('heading', { name: t('attach.stepAgentsTitle', film.locale) })).toBeVisible()
			await cursor.click(page.locator('[role="button"]').filter({ hasText: ROTEIRO_PROVIDER_NAME }))
			await sleep(400)
			await cursor.click(page.getByRole('button', { name: t('attach.continue', film.locale) }))

			// 4. REVIEW — "Vincular conversa" is the commit, and the app navigates itself into the thread.
			await expect(page.getByRole('heading', { name: t('attach.stepReviewTitle', film.locale) })).toBeVisible()
			await sleep(900) // let the review card be readable before it is committed
			await cursor.click(page.getByRole('button', { name: t('attach.finish', film.locale) }), { circulate: true })

			// 5. THE THREAD — attached, idle, gated on a tag a person can actually type.
			await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}/, { timeout: 30_000 })
			const threadId = new URL(page.url()).pathname.split('/threads/')[1]?.split('/')[0] ?? ''
			expect(threadId).toMatch(/^[0-9a-f-]{36}$/)
			const settings = await getThreadSettings(threadId, { client })
			// Read back rather than assumed: if the mint ever stops deriving the tag from the folder name, the
			// message below would cite a tag nothing matches and the film would silently show a thread that
			// never answers — the most expensive way to discover it.
			expect(settings.mentionGate.enabled && settings.mentionGate.tag).toBe(FILM_MENTION_TAG)
			await expect(page.getByText(FILM_WORKSPACE_PATH, { exact: false })).toBeVisible()
			const statusBadge = () => page.locator('h1').locator('xpath=following-sibling::span[1]')
			await expect(statusBadge()).toHaveText(t('enums.ThreadStatus.IDLE', film.locale))

			// ── ADA MAY SUMMON THE AGENT. Not a workaround — a decision the product makes the operator take.
			//
			// `AttachThread` seeds a 1:1 roster as "operator invokes, the counterparty OBSERVES"
			// (`canInvoke: false`), and `Thread.addressedToAgent` checks the roster BEFORE the mention gate. So
			// a freshly attached conversation answers its operator and nobody else, and the contact's first
			// message is transcribed and left alone — which is exactly what the console showed while this film
			// was being built. Granting the right is `SetParticipantInvocation` (C13), the same call the thread
			// settings dialog makes.
			//
			// Done through the SDK because the brief's film is attach → message → answer → task → artifact, and
			// a permissions detour is a different story. It is a GOOD story — "you decide who can summon the
			// agent" is the product's whole control posture — and turning this into an on-camera beat is a
			// couple of clicks in `ThreadSettingsDialog` whenever the founder wants it.
			await setParticipantInvocation(threadId, sender.externalId, { canInvoke: true }, { client })

			await sleep(1_200) // the empty conversation, held long enough to register as empty

			// 6. THE MESSAGE ARRIVES — through the gateway ingress seam, so nothing on screen is a chat app
			//    other than this one. `useThreadRealtime` invalidates the chat on `message_ingested`, so the
			//    row lands live, with no navigation.
			await injectInboundMessage(user.session, {
				channelId: sender.channelId,
				contactExternalId: sender.externalId,
				senderExternalId: sender.externalId,
				contactDisplayName: ROTEIRO_CONTACT_NAME,
				text: film.ask,
			})
			const askRow = page.locator('[data-slot="virtual-list-item"]', { hasText: film.askRow })
			await expect(askRow).toBeVisible({ timeout: 30_000 })

			// 7. THE AGENT ANSWERS, then forks the work. The thinking indicator mounts while the newest row is
			//    still the contact's own message and the thread is RUNNING, so it appears exactly in the gap
			//    the scripted act's pauses open up.
			await expect(page.getByText(film.reply, { exact: false })).toBeVisible({ timeout: 60_000 })
			await expect(statusBadge()).toHaveText(t('enums.ThreadStatus.RUNNING', film.locale), { timeout: 60_000 })

			// 8. INTO THE TASK — the roteiro's work act opens with a 6s pause precisely so this navigation
			//    lands before anything streams (`scenarios.ts`, "THE LEAD-IN").
			// Scoped to `main`: the rail carries its own "Tarefas" link (with a count beside it), and
			// `getByRole`'s name match is a substring — unscoped, this resolves to two elements.
			const tab = (labelKey: 'session.tabChat' | 'session.tabIssues') =>
				page.locator('main').getByRole('link', { name: t(labelKey, film.locale) })
			await cursor.click(tab('session.tabIssues'))
			const issueRow = page.getByRole('link').filter({ hasText: film.issueKey }).first()
			await expect(issueRow).toBeVisible({ timeout: 30_000 })
			await sleep(600)
			await cursor.click(issueRow)

			// 9. THE TERMINAL — `terminal-stream-connected` renders on the SSE `onopen`, and the daemon claims
			//    this browser as the issue's observer synchronously, before those headers exist. Seeing the
			//    badge means the slot is held and no frame of the run can be dropped from here on.
			await expect(page.getByTestId('terminal-stream-connected')).toBeVisible({ timeout: 60_000 })
			// The work act, streaming at reading speed. Asserted at its two ends only: the film is what happens
			// in between, and asserting every beat would be re-testing the scenario the daemon already unit-tests.
			const actions = page.getByTestId('terminal-action-tool')
			await expect(actions.filter({ hasText: 'Glob' })).toBeVisible({ timeout: 60_000 })
			await expect(actions.filter({ hasText: 'mcp__codm__RecordArtifact' }).first()).toBeVisible({ timeout: 120_000 })
			await expect(actions.filter({ hasText: 'mcp__codm__TransitionIssueStatus' })).toBeVisible({ timeout: 60_000 })
			await expect
				.poll(
					async () => {
						const issues = await getSessionIssues(threadId, { client })
						return issues.groups.flatMap(group => group.items).find(item => item.key === film.issueKey)?.status
					},
					{ timeout: 60_000, message: 'the scripted work turn never declared the issue COMPLETED' },
				)
				.toBe('COMPLETED')
			await sleep(1_500) // the finished terminal, held

			// 10. BACK TO THE CONVERSATION — where the run's output is waiting: the screen it built and the
			//     link to its pull request, as rows of the thread, plus the agent's closing line (the second
			//     act of the orchestrator's script, which the finished issue enqueues on its own).
			await cursor.click(tab('session.tabChat'))
			const screenshot = page.locator(`img[alt="${film.screenFile}"]`)
			await expect(screenshot).toBeVisible({ timeout: 30_000 })
			// The `<img>` is VISIBLE even when the bytes failed to decode, and the console falls back to a file
			// row on `onError` — so the film's closing frame is only honest if the image really painted.
			await expect.poll(() => screenshot.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 30_000 }).toBeGreaterThan(0)
			await expect(page.locator(`a[href="${DEMO_PR_URL}"]`)).toBeVisible({ timeout: 30_000 })
			const closingRow = page.locator('[data-slot="virtual-list-item"]', { hasText: film.closing })
			await expect(closingRow).toBeVisible({ timeout: 60_000 })
			await expect(statusBadge()).toHaveText(t('enums.ThreadStatus.IDLE', film.locale), { timeout: 60_000 })

			// THE THIRD CAPTURE-LAYER TWEAK, and the only one that touches an attribute rather than text.
			//
			// A DOMSnapshot keeps an `<img>`'s URL as it found it — `demo/inline-assets.ts` says so out loud and
			// explains the trade: resolving images at GENERATION time keeps the capture phase fast. That works
			// while whatever served them is still up, and the console's artifact bytes come off the DAEMON
			// (`/artifacts/:id/content`), which the harness tears down the moment the spec ends. So the film's
			// closing frame — the screen the agent built — reconstructed as a broken-image icon.
			//
			// Re-fetching each image and swapping in its data URI moves the resolution INTO the take, where the
			// server still exists. The pixels are the ones the browser already painted; only the address
			// changes. Done here rather than in `demo/recorder.ts` because the general fix (inline on every
			// snapshot) would pay that cost on every frame of every recording to serve a case that only arises
			// when the film outlives its server.
			await page.evaluate(async () => {
				const asDataUri = (blob: Blob) =>
					new Promise<string>(done => {
						const reader = new FileReader()
						reader.onload = () => done(String(reader.result))
						reader.readAsDataURL(blob)
					})
				await Promise.all(
					Array.from(document.querySelectorAll('img')).map(async image => {
						if (!image.src || image.src.startsWith('data:')) return
						try {
							const response = await fetch(image.src, { credentials: 'include' })
							if (response.ok) image.src = await asDataUri(await response.blob())
						} catch {
							// Unreachable: the frame keeps the URL it had, exactly as before.
						}
					}),
				)
			})
			// Re-assert AFTER the swap: a data URI that failed to decode would put the console's `onError`
			// fallback on film, which is the one thing this whole tweak exists to prevent.
			await expect.poll(() => screenshot.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 15_000 }).toBeGreaterThan(0)

			// ── THE CLOSING FRAME ────────────────────────────────────────────────────────────────────────
			//
			// The DELIVERABLE: the screen the agent built, full height, with the pull request under it. That
			// is the frame this whole film is an argument for, so the take ends holding it.
			//
			// THE AGENT'S CLOSING LINE IS DELIBERATELY NOT FRAMED, and the reason is a product finding rather
			// than a staging choice. Measured across three takes: once the artifact image decodes to its real
			// height (448px), the transcript's windowed scroller rests ~18px short of its own last row — the
			// row sits at y≈974 while its scroller ends at y≈956, so it is clipped even though it is well
			// inside the 1080px viewport. Driving `scrollTop` to `scrollHeight` moves it into frame and the
			// list snaps back inside 300ms, on every frame sampled afterwards. So the line the second
			// orchestrator act exists to say is, right now, not reachable by scrolling at all.
			//
			// (This is also why `toBeInViewport()` is the wrong assertion for "will it be on film": it
			// intersects the row with the VIEWPORT, and a row clipped by a scrolling ancestor passes it. Two
			// takes were lost to believing it.)
			//
			// The line is asserted above — it exists, the two-act script works — and it is left off camera
			// until the scroller does. `.plans/2026-08-27-demo-roteirizada.md` carries the finding.
			await expect(closingRow).toHaveCount(1)
			await sleep(3_000) // the closing frame, held long enough to read

			// ── CUT ──────────────────────────────────────────────────────────────────────────────────────
			const saved = await recorder.save(film.dir, filmDir(film.dir))
			// Printed, not attached: the reconstruction scripts take a DIRECTORY, and the next thing whoever
			// ran this does is feed them one.
			console.log(`[demo] ${saved.snapshotCount} snapshots · ${saved.cursorCount} cursor frames → ${saved.baseDir}`)
			console.log(`[demo] next: bun demo/render-mp4.ts ${saved.baseDir}`)
			expect(saved.snapshotCount).toBeGreaterThan(0)
		})
	})
}
