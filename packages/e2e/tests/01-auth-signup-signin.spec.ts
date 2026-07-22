import { test, expect } from '../utils/test'
import { t } from '../utils/i18n'
import { generateEmail } from '../utils/generators'

/**
 * Canonical flow 1 — auth sign-up + sign-in.
 *
 * The generic entry flow every product keeps: a visitor signs up through the UI form,
 * lands authenticated, and can sign back in with the same credentials.
 */
test('sign-up via UI form lands authenticated', async ({ page, network }) => {
	const email = generateEmail()

	await page.goto('/sign-up')
	await page.getByLabel(t('auth.signUp.name')).fill('E2E User')
	await page.getByLabel(t('auth.signUp.email')).fill(email)
	await page.getByLabel(t('auth.signUp.password'), { exact: true }).fill('Password123!')
	await page.getByLabel(t('auth.signUp.confirmPassword')).fill('Password123!')
	await page.getByRole('checkbox').check()
	await page.getByRole('button', { name: t('auth.signUp.submit') }).click()

	await Promise.race([page.waitForURL(url => !url.pathname.includes('/sign-up'), { timeout: 15_000 }), network.waitForFailure()])
	expect(page.url()).not.toContain('/sign-up')
})

test('sign-in with an existing user reaches the app shell', async ({ page, given, loginAs }) => {
	const user = await given.freshUser({})

	await loginAs({ email: user.email, password: user.password })
	expect(page.url()).not.toContain('/sign-in')
})
