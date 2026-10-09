import { expect } from '@playwright/test'
import { getThreadSettings, setParticipantElevation } from '@codm/client-typescript/typescript'
import { test } from '../utils/test'
import { givenAttachedThread, givenCompletedOnboarding, givenFreshUser } from '../utils/given'
import { authenticateCloudSession } from '../utils/given/cloud'
import { t } from '../utils/i18n'

/** The switch's accessible name — the same interpolated copy the console renders, read from the bundle. */
const elevationToggle = (name: string) => t('session.canElevateToggleFor').replace('{{name}}', name)

/**
 * Story 1 (participant-permission-posture, AC-2 / AC-3) — the operator marks who may approve actions
 * with no filter, and the choice survives reopening the dialog.
 *
 * Drives the REAL stack: the thread is attached through the real `AttachThread` (the seed under test
 * for AC-2), the toggle is clicked in the real console, and persistence is proven by re-reading through
 * the SDK and by a reload — never by the switch's own state.
 */
test('o operador marca quem pode liberar ações sem filtro, e a escolha sobrevive a reabrir', async ({ page, goto }) => {
	test.setTimeout(60_000)

	const user = await givenFreshUser({})
	const thread = await givenAttachedThread(user.session, { displayName: 'Ada' })
	await givenCompletedOnboarding(user.session, thread)
	const client = user.session.client

	// AC-2 — the seed: the operator WITH elevation, the counterparty WITHOUT.
	const seeded = await getThreadSettings(thread.threadId, { client })
	const operator = seeded.participants.find(p => p.participantId === 'operator')
	const member = seeded.participants.find(p => p.participantId === thread.contactExternalId)
	expect(operator?.canElevate).toBe(true)
	expect(member?.canElevate).toBe(false)

	await authenticateCloudSession(page)
	await goto('/threads/$threadId', { threadId: thread.threadId })
	await page.getByRole('button', { name: t('session.threadSettings') }).click()

	const memberToggle = page.getByRole('switch', { name: elevationToggle(member!.name) })
	await expect(memberToggle).toHaveAttribute('aria-checked', 'false')
	await expect(page.getByRole('switch', { name: elevationToggle(operator!.name) })).toHaveAttribute('aria-checked', 'true')

	await memberToggle.click()
	await expect(memberToggle).toHaveAttribute('aria-checked', 'true')

	// AC-3 — persisted, read back through the SDK.
	await expect
		.poll(
			async () =>
				(await getThreadSettings(thread.threadId, { client })).participants.find(p => p.participantId === thread.contactExternalId)
					?.canElevate,
			{ timeout: 5_000, message: 'the elevation flip never reached the backend' },
		)
		.toBe(true)

	// …and on reopen.
	await page.reload()
	await page.getByRole('button', { name: t('session.threadSettings') }).click()
	await expect(page.getByRole('switch', { name: elevationToggle(member!.name) })).toHaveAttribute('aria-checked', 'true')

	// AC-3 — an id that is not a participant is refused (PARTICIPANT_NOT_FOUND), never silently admitted.
	await expect(setParticipantElevation(thread.threadId, 'nobody@s.whatsapp.net', { canElevate: true }, { client })).rejects.toThrow()
})
