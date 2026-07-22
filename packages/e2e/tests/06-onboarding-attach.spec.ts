import { test, expect } from '../utils/test'
import { getSetupChecklist, getAttachThreadWizard } from '@codedm/client-typescript/typescript'
import { givenAttachedThread } from '../utils/given'

/**
 * Canonical flow (a) — onboarding checklist → attach-thread happy path.
 *
 * The onboarding gate's three "done" flags are a cross-context BFF read (channel CONNECTED, workspace
 * registered, thread attached). This spec drives the same backend the attach-thread wizard drives —
 * seed a connected channel, register a workspace, attach a thread — and proves the checklist reports
 * all three complete and the wizard read exposes the connected channel + detected provider it offers.
 *
 * Single-operator shared DB: the checklist is owner-global, so this asserts only the ORDER-INDEPENDENT
 * positive direction (all-done after completing the flow), never an "initially empty" state another
 * spec's seeding could have advanced.
 */
test('onboarding checklist completes once channel + workspace + thread exist', async ({ given }) => {
	const user = await given.freshUser({})
	const client = user.session.client

	// The wizard read is reachable and enumerates providers before anything is attached.
	const wizardBefore = await getAttachThreadWizard({ client })
	expect(Array.isArray(wizardBefore.providers)).toBe(true)

	// Complete the flow the wizard performs (connected channel → workspace → attached thread).
	await givenAttachedThread(user.session)

	const checklist = await getSetupChecklist({ client })
	expect(checklist.channelDone).toBe(true)
	expect(checklist.workspaceDone).toBe(true)
	expect(checklist.threadDone).toBe(true)

	// The wizard now offers at least one CONNECTED channel to attach against.
	const wizardAfter = await getAttachThreadWizard({ client })
	expect(wizardAfter.channels.length).toBeGreaterThan(0)
})
