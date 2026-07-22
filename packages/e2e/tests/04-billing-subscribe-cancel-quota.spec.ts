import { test, expect } from '../utils/test'
import { createOwner, setActiveOwner, createSubscription, getSubscription, cancelSubscription, listPlans, getUsage } from '@template/client-typescript/typescript'

/**
 * Canonical flow 4 — billing subscribe → cancel → quota read, on the SANDBOX gateway.
 *
 * Requires BILLING_SANDBOX=true on the api-typescript process (see .env.example): the
 * SandboxPaymentProvider settles charges in-process, no external gateway involved.
 * Plans/quota use the template placeholders (PlanName FREE/STARTER/PRO, QuotaKey EXAMPLE_KEY).
 */
test('subscribe on sandbox, then cancel — plans + usage stay readable', async ({ given }) => {
	const user = await given.freshUser({})
	const owner = await createOwner({ name: 'E2E Billing Owner' }, { client: user.session.client })
	await setActiveOwner(owner.ownerId, { client: user.session.client })

	const plans = await listPlans({ client: user.session.client })
	expect(Array.isArray(plans.plans ?? plans)).toBe(true)

	const sub = await createSubscription({ planName: 'STARTER', consentAccepted: true }, { client: user.session.client })
	expect(sub.subscriptionId).toBeTruthy()

	const current = await getSubscription({ client: user.session.client })
	expect(current).toBeTruthy()

	await cancelSubscription({ immediate: true }, { client: user.session.client })

	const usage = await getUsage({ client: user.session.client })
	expect(usage).toBeTruthy()
})
