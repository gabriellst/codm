import { test, expect } from '../utils/test'
import { getSessionChat, steerThread, sendDirectMessage, pauseThread, resumeThread } from '@codedm/client-typescript/typescript'
import { givenAttachedThread } from '../utils/given'

/**
 * Canonical flow (c) — the composer after the mode UNLOCK.
 *
 * The mode locks died with `Thread.assertCanSteer`/`assertCanSendDirect` (founder, 29-jul): a whisper
 * and a direct message are BOTH accepted in any state. What stays state-derived is `composerMode`,
 * the DEFAULT of what Enter does, and the rule is the founder's (see GetSessionChat): a RUNNING
 * thread is a live conversation, so typing goes to the PEOPLE in it (DIRECT); a PAUSED thread
 * answers nobody, so typing is instruction for the agents (STEER). This spec proves both lanes are
 * open in both states and that the default follows pause/resume.
 */
test('composer — both lanes always open; the default follows the thread state', async ({ given }) => {
	const user = await given.freshUser({})
	const thread = await givenAttachedThread(user.session)
	const client = user.session.client

	// Live: the default is DIRECT — Enter talks to the people in the conversation.
	const live = await getSessionChat(thread.threadId, { client })
	expect(live.paused).toBe(false)
	expect(live.composerMode).toBe('DIRECT')

	// Both lanes are open while live: a whisper queues for the agents…
	const whispered = await steerThread(thread.threadId, { text: 'focus on the auth module' }, { client })
	expect(whispered.entryId).toBeTruthy()

	// …and a direct message goes out as the operator's own voice.
	const directWhileLive = await sendDirectMessage(thread.threadId, { text: 'hi from operator' }, { client })
	expect(directWhileLive.entryId).toBeTruthy()

	// Pause → the default flips to STEER: nobody is listening, so typing is instruction.
	await pauseThread(thread.threadId, { client })
	const paused = await getSessionChat(thread.threadId, { client })
	expect(paused.paused).toBe(true)
	expect(paused.composerMode).toBe('STEER')

	// Both lanes stay open while paused too.
	const direct = await sendDirectMessage(thread.threadId, { text: 'taking over for a sec' }, { client })
	expect(direct.entryId).toBeTruthy()
	const whisperWhilePaused = await steerThread(thread.threadId, { text: 'nudge the agent' }, { client })
	expect(whisperWhilePaused.entryId).toBeTruthy()

	// Resume restores the live default.
	await resumeThread(thread.threadId, { client })
	const resumed = await getSessionChat(thread.threadId, { client })
	expect(resumed.paused).toBe(false)
	expect(resumed.composerMode).toBe('DIRECT')
})
