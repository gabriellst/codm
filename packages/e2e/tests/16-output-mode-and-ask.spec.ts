import { expect } from '@playwright/test'
import { getThreadSettings } from '@codm/client-typescript/typescript'
import { test } from '../utils/test'
import { givenAttachedThread, givenCompletedOnboarding, givenFreshUser } from '../utils/given'
import { authenticateCloudSession } from '../utils/given/cloud'
import { t } from '../utils/i18n'

/**
 * Fase 3 (S8a) — the operator chooses how much of what its tasks say reaches the group, and the choice
 * survives reopening the dialog. Drives the REAL stack: the thread comes from the real `AttachThread`, the
 * selector is clicked in the real console, persistence is proven by re-reading through the SDK.
 */
test('o operador escolhe o que chega ao grupo, e a escolha persiste', async ({ page, goto }) => {
	test.setTimeout(60_000)

	const user = await givenFreshUser({})
	const thread = await givenAttachedThread(user.session, { displayName: 'Ada' })
	await givenCompletedOnboarding(user.session, thread)
	const client = user.session.client

	// The owner's decided default for every group, new or existing.
	expect((await getThreadSettings(thread.threadId, { client })).outputMode).toBe('DECISIONS_AND_LIVE')

	await authenticateCloudSession(page)
	await goto('/threads/$threadId', { threadId: thread.threadId })
	await page.getByRole('button', { name: t('session.threadSettings') }).click()

	const selector = page.getByLabel(t('session.outputMode'))
	await expect(selector).toContainText(t('enums.GroupOutputMode.DECISIONS_AND_LIVE'))
	await selector.click()
	await page.getByRole('option', { name: t('enums.GroupOutputMode.EVERYTHING') }).click()

	await expect
		.poll(async () => (await getThreadSettings(thread.threadId, { client })).outputMode, {
			timeout: 5_000,
			message: 'the output mode never reached the backend',
		})
		.toBe('EVERYTHING')

	await page.reload()
	await page.getByRole('button', { name: t('session.threadSettings') }).click()
	await expect(page.getByLabel(t('session.outputMode'))).toContainText(t('enums.GroupOutputMode.EVERYTHING'))
})

/**
 * Answering an issue's ask from the console's Needs-you card — HONEST SKIP, the same cause as flow (d)
 * (`08-stop-resolve.spec.ts`): the hermetic harness cannot RAISE a stop (the e2e stub AgentRunner never
 * calls `AskDecision`/`AskQuestion`, and no `/_test` seam produces one). The behaviour is proven against
 * the real backend one level down: `StopAskCard/index.test.tsx` (react, integration harness — option
 * button resolves the stop; free-text question) and `GetNeedsYouPanel.test.ts` (the ask view).
 *
 * To un-skip: have the stub agent call `AskDecision` on a sentinel prompt token, then click the option on
 * the card and assert the Needs-you panel clears.
 */
test('responder uma decisão pelo cartão "precisa de você"', async () => {
	// biome-ignore lint/suspicious/noSkippedTests: intentional HONEST SKIP, see docstring above — the hermetic harness has no seam to raise an ask.
	test.skip(true, 'No hermetic ask-raising path: the e2e stub AgentRunner never calls AskDecision/AskQuestion.')
})
