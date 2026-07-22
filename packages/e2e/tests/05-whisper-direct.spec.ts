import { test, expect } from '../utils/test'
import { getSessionChat, steerThread, sendDirectMessage, pauseThread, resumeThread } from '@codedm/client-typescript/typescript'
import { givenAttachedThread } from '../utils/given'

/**
 * Canonical flow (c) — whisper vs direct composer modes.
 *
 * The Thread aggregate owns the mode guard: a WHISPER (steer) may only be sent while the session is
 * LIVE, and a DIRECT message only while PAUSED (Thread.assertCanSteer / assertCanSendDirect). The BFF
 * `composerMode` mirrors that guard for the UI. This spec drives both rails through the SDK and proves
 * each mode is accepted in its own state and REJECTED in the other.
 */
test('composer modes — whisper only while live, direct only while paused', async ({ given }) => {
	const user = await given.freshUser({})
	const thread = await givenAttachedThread(user.session)
	const client = user.session.client

	// Live: composer is in STEER (whisper) mode.
	const live = await getSessionChat(thread.threadId, { client })
	expect(live.paused).toBe(false)
	expect(live.composerMode).toBe('STEER')

	// A whisper is accepted while live…
	const whispered = await steerThread(thread.threadId, { text: 'focus on the auth module' }, { client })
	expect(whispered.entryId).toBeTruthy()

	// …but a direct message is rejected while live (direct is a paused-only mode).
	await expect(sendDirectMessage(thread.threadId, { text: 'hi from operator' }, { client })).rejects.toThrow()

	// Pause → composer flips to DIRECT.
	await pauseThread(thread.threadId, { client })
	const paused = await getSessionChat(thread.threadId, { client })
	expect(paused.paused).toBe(true)
	expect(paused.composerMode).toBe('DIRECT')

	// A direct message is accepted while paused…
	const direct = await sendDirectMessage(thread.threadId, { text: 'taking over for a sec' }, { client })
	expect(direct.entryId).toBeTruthy()

	// …but a whisper is rejected while paused (whisper is a live-only mode).
	await expect(steerThread(thread.threadId, { text: 'nudge the agent' }, { client })).rejects.toThrow()

	// Resume restores the live/whisper posture.
	await resumeThread(thread.threadId, { client })
	const resumed = await getSessionChat(thread.threadId, { client })
	expect(resumed.paused).toBe(false)
	expect(resumed.composerMode).toBe('STEER')
})
