import { test, expect } from '../utils/test'
import { t } from '../utils/i18n'

/**
 * Canonical flow 2 — profile preferences update.
 *
 * An authenticated user opens Settings → Account and saves preferences (timezone/language,
 * persisted on the UserProfile aggregate via UpdateProfile — the auth context owns the whole
 * user surface since the identity collapse).
 */
test('update timezone from settings/account', async ({ page, given, goto }) => {
	await given.freshUser({})

	await goto('/settings/account')
	const timezone = page.getByLabel(t('account.preferences.timezone'))
	await timezone.waitFor({ timeout: 15_000 })
	await timezone.fill('America/Sao_Paulo')
	await page
		.getByRole('button', { name: t('account.preferences.save') })
		.first()
		.click()

	await expect(page.getByText(t('account.preferences.saveSuccess')).first()).toBeVisible({ timeout: 10_000 })
})
