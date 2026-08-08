import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenIssue, givenRemote, givenThread, givenWorkspace } from '@test/support'
import { IssueStatus, ThreadStatus, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import type { Thread } from '@thread/entities/Thread'
import { ThreadRepository } from '@thread/repositories'
import { GetHomeDashboard } from './GetHomeDashboard'

/**
 * F1 — THE CONVERSATION LIST IS NOT THE ACTIVE-SESSION LIST.
 *
 * The sidebar rendered `activeSessions`, which filters to `RUNNING | NEEDS_ATTENTION`. A thread that
 * is simply IDLE — the normal state of a conversation nobody is being answered in right now — was
 * therefore invisible: the founder had one real thread, with real messages, and the sidebar said
 * "Nenhuma conversa ainda".
 *
 * The bug was one word at a call site, but the reason it survived is that both fields are plausible
 * names for "the threads". So the test asserts the DISTINCTION rather than either list alone: an idle
 * thread must appear in one and not the other, which is a statement neither field can satisfy by
 * accident.
 */
describe('GetHomeDashboard — threads vs activeSessions', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('AC-F1.1 — an IDLE thread is listed as a conversation but is NOT an active session', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID, workspaceId: workspace.id.value })

		const dashboard = await testBed.resolve(GetHomeDashboard).execute({ ownerId: OPERATOR_ID })

		expect(dashboard.threads.map(t => t.threadId)).toContain(thread.id.value)
		expect(dashboard.activeSessions.map(t => t.threadId)).not.toContain(thread.id.value)
	})

	/**
	 * THE BUG THE FOUNDER SAW: "1 agente trabalhando agora" in the headline, "Nenhuma sessão ativa"
	 * directly beneath it, on the same payload.
	 *
	 * `threads.status` is written in exactly three places — `create()` → IDLE, `pause()` → PAUSED,
	 * `resume()` → IDLE (`setStatus` has no caller) — so the column NEVER holds RUNNING or
	 * NEEDS_ATTENTION, which are the only two values `activeSessions` filters for. The block was empty
	 * by construction, permanently, no matter what the agents were doing.
	 *
	 * Note this test does not touch `thread.status` at all: it creates the state the PRODUCT creates
	 * (an issue working on a thread) and asserts the dashboard reflects it. Setting the column by hand
	 * is what let the old version of this test pass over a field the product cannot actually set.
	 *
	 * FALSIFIER: read `t.status` from the column again in `GetHomeDashboard` instead of deriving, and
	 * this goes red while the IDLE case above stays green.
	 */
	it('a thread with a WORKING issue is RUNNING and IS an active session — status is derived, not stored', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID, workspaceId: workspace.id.value })
		await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value, key: 'working-now', status: IssueStatus.WORKING })

		const dashboard = await testBed.resolve(GetHomeDashboard).execute({ ownerId: OPERATOR_ID })

		// The headline and the block must agree — that disagreement WAS the bug.
		expect(dashboard.agentsRunningNow).toBe(1)
		expect(dashboard.activeSessions.map(t => t.threadId)).toContain(thread.id.value)
		expect(dashboard.threads.find(t => t.threadId === thread.id.value)?.status).toBe(ThreadStatus.RUNNING)
	})

	it('the operator pausing beats work in flight — PAUSED outranks RUNNING', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID, workspaceId: workspace.id.value })
		await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value, key: 'working-now', status: IssueStatus.WORKING })
		thread.pause()
		await testBed.resolve(ThreadRepository).save(thread)

		const dashboard = await testBed.resolve(GetHomeDashboard).execute({ ownerId: OPERATOR_ID })

		expect(dashboard.threads.find(t => t.threadId === thread.id.value)?.status).toBe(ThreadStatus.PAUSED)
		// Paused is not "active" — the operator asked for silence.
		expect(dashboard.activeSessions.map(t => t.threadId)).not.toContain(thread.id.value)
	})
})

/**
 * THE BUG THE FOUNDER SAW: "Resposta mediana — 0s", every day, on a console with real conversations in
 * it. `today.medianResponseSeconds` was the literal `0` in the return object; nothing on the read path
 * had ever looked at a clock.
 *
 * FALSIFIER for the whole block: put `medianResponseSeconds: 0` back and every test below goes red.
 * None of them can pass on a constant, because each asserts a DIFFERENT number off different timings.
 */
describe('GetHomeDashboard — today.medianResponseSeconds', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	/** Today at a fixed hour, so a suite run at 23:59 cannot push a seeded line into tomorrow. */
	const todayAt = (minutesPastNoon: number) => new Date(new Date().setHours(12, 0, 0, 0) + minutesPastNoon * 60_000)

	/** Seeds a transcript through the aggregate that owns it — `recordEntry` + `save`, never a raw insert. */
	const givenTranscript = async (thread: Thread, lines: { kind: TranscriptKind; at: Date }[]) => {
		for (const line of lines) {
			thread.recordEntry({
				kind: line.kind,
				text: `${line.kind} line`,
				senderExternalId: line.kind === TranscriptKind.CONTACT ? 'contact-1' : undefined,
				at: line.at,
			})
		}
		await testBed.resolve(ThreadRepository).save(thread)
	}

	const newThread = async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		return givenThread(testBed, { ownerId: OPERATOR_ID, workspaceId: workspace.id.value })
	}

	it('measures the wait from the inbound message to the reply that answered it', async () => {
		const thread = await newThread()
		await givenTranscript(thread, [
			{ kind: TranscriptKind.CONTACT, at: todayAt(0) },
			{ kind: TranscriptKind.SYSTEM, at: todayAt(2) },
		])

		const dashboard = await testBed.resolve(GetHomeDashboard).execute({ ownerId: OPERATOR_ID })

		expect(dashboard.today.medianResponseSeconds).toBe(120)
	})

	/**
	 * THE MEDIAN, not the mean — with waits of 60/120/1800 the average is 660s, a number no conversation
	 * in the set actually took. Three samples with a lopsided tail is the smallest shape that tells the
	 * two apart.
	 */
	it('reports the median of the day, so one conversation left hanging cannot move the number', async () => {
		for (const [start, reply] of [
			[0, 1],
			[10, 12],
			[20, 50],
		]) {
			const thread = await newThread()
			await givenTranscript(thread, [
				{ kind: TranscriptKind.CONTACT, at: todayAt(start!) },
				{ kind: TranscriptKind.SYSTEM, at: todayAt(reply!) },
			])
		}

		const dashboard = await testBed.resolve(GetHomeDashboard).execute({ ownerId: OPERATOR_ID })

		expect(dashboard.today.medianResponseSeconds).toBe(120)
	})

	/**
	 * A contact who writes four lines in a row waited from the FIRST one. Pairing the reply with the last
	 * line instead would report 60s here — a real answer measured as if the earlier three minutes hadn't
	 * happened.
	 */
	it('a burst of inbound lines is ONE wait, timed from the first of them', async () => {
		const thread = await newThread()
		await givenTranscript(thread, [
			{ kind: TranscriptKind.CONTACT, at: todayAt(0) },
			{ kind: TranscriptKind.CONTACT, at: todayAt(1) },
			{ kind: TranscriptKind.CONTACT, at: todayAt(3) },
			{ kind: TranscriptKind.SYSTEM, at: todayAt(4) },
		])

		const dashboard = await testBed.resolve(GetHomeDashboard).execute({ ownerId: OPERATOR_ID })

		expect(dashboard.today.medianResponseSeconds).toBe(240)
	})

	/**
	 * `WHISPER` is an in-app steer the contact never sees. Letting it stop the clock would report the
	 * operator talking to the agent as if the contact had been answered.
	 */
	it('an in-app whisper does not answer the contact — only what reaches the channel stops the clock', async () => {
		const thread = await newThread()
		await givenTranscript(thread, [
			{ kind: TranscriptKind.CONTACT, at: todayAt(0) },
			{ kind: TranscriptKind.WHISPER, at: todayAt(1) },
			{ kind: TranscriptKind.SYSTEM, at: todayAt(5) },
		])

		const dashboard = await testBed.resolve(GetHomeDashboard).execute({ ownerId: OPERATOR_ID })

		expect(dashboard.today.medianResponseSeconds).toBe(300)
	})

	/** The operator answering by hand from the console is still an answer the contact received. */
	it('counts a DIRECT reply from the operator, not just the agent', async () => {
		const thread = await newThread()
		await givenTranscript(thread, [
			{ kind: TranscriptKind.CONTACT, at: todayAt(0) },
			{ kind: TranscriptKind.DIRECT, at: todayAt(3) },
		])

		const dashboard = await testBed.resolve(GetHomeDashboard).execute({ ownerId: OPERATOR_ID })

		expect(dashboard.today.medianResponseSeconds).toBe(180)
	})

	/** An unanswered inbound has no wait to report yet — it must not be counted as an instant reply. */
	it('an inbound nobody has answered contributes nothing', async () => {
		const thread = await newThread()
		await givenTranscript(thread, [{ kind: TranscriptKind.CONTACT, at: todayAt(0) }])

		const dashboard = await testBed.resolve(GetHomeDashboard).execute({ ownerId: OPERATOR_ID })

		expect(dashboard.today.medianResponseSeconds).toBe(0)
	})

	/** Yesterday's conversation is not today's number — the window matches the two counters beside it. */
	it('ignores waits from before today', async () => {
		const thread = await newThread()
		const yesterdayAt = (minutes: number) => new Date(todayAt(minutes).getTime() - 24 * 60 * 60_000)
		await givenTranscript(thread, [
			{ kind: TranscriptKind.CONTACT, at: yesterdayAt(0) },
			{ kind: TranscriptKind.SYSTEM, at: yesterdayAt(9) },
		])

		const dashboard = await testBed.resolve(GetHomeDashboard).execute({ ownerId: OPERATOR_ID })

		expect(dashboard.today.medianResponseSeconds).toBe(0)
	})
})

/**
 * THE FACES. The sidebar and the active-sessions list drew initials for every conversation, including
 * the ~55% of the founder's real contact book that `gateway_remotes` holds a photo for. Nothing on
 * this read had ever joined the two.
 *
 * The payload carries `hasAvatar` plus the two halves of the daemon's own avatar route
 * (`channelId` + `externalId`) — never the platform url, which is signed, expiring, and off-CSP
 * (rail DSK-12).
 *
 * FALSIFIER: drop the `remotes` LEFT JOIN and every `hasAvatar: true` below goes false while the
 * "no entry" cases stay green — which is exactly the silent half-failure the join is here to prevent.
 */
describe('GetHomeDashboard — conversation and sender faces', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const CHANNEL = '019e4d24-0000-7041-9e1c-0000000000d1'
	const JID = '558386387518@s.whatsapp.net'
	const GROUP_JID = '120363000000000000@g.us'
	const PHOTO_URL = 'https://pps.whatsapp.net/v/t61.24694-24/group.jpg'

	const threadOn = async (contactExternalId: string) => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		return givenThread(testBed, { ownerId: OPERATOR_ID, workspaceId: workspace.id.value, channelId: CHANNEL, contactExternalId })
	}

	const dashboard = () => testBed.resolve(GetHomeDashboard).execute({ ownerId: OPERATOR_ID })

	it('a conversation whose contact has a photo is flagged, with the address to fetch it from', async () => {
		const thread = await threadOn(GROUP_JID)
		await givenRemote(testBed, { channelId: CHANNEL, remoteId: GROUP_JID, name: 'Time CODM', avatarUrl: PHOTO_URL })

		const row = (await dashboard()).threads.find(t => t.threadId === thread.id.value)

		expect(row?.hasAvatar).toBe(true)
		expect(row?.channelId).toBe(CHANNEL)
		expect(row?.externalId).toBe(GROUP_JID)
	})

	/** DEGRADES TO INITIALS: a thread whose contact the gateway sync has not written must still list. */
	it('a conversation with no contact-book entry still lists, reporting no photo', async () => {
		const thread = await threadOn(GROUP_JID)

		const row = (await dashboard()).threads.find(t => t.threadId === thread.id.value)

		expect(row?.hasAvatar).toBe(false)
		expect(row?.externalId).toBe(GROUP_JID)
	})

	/** The key is (channel, remote) — another channel's row with the same JID must not lend its face. */
	it('does not borrow a photo from a different channel', async () => {
		const thread = await threadOn(GROUP_JID)
		await givenRemote(testBed, {
			channelId: '019e4d24-0000-7041-9e1c-0000000000d2',
			remoteId: GROUP_JID,
			name: 'Outro grupo',
			avatarUrl: PHOTO_URL,
		})

		expect((await dashboard()).threads.find(t => t.threadId === thread.id.value)?.hasAvatar).toBe(false)
	})

	/**
	 * WHO SPOKE on the latest-activity list. It printed the transcript KIND and the text and never the
	 * person — which in a group is a different person on every line.
	 */
	it('attributes a recent inbound line to the contact who sent it, with their face', async () => {
		const thread = await threadOn(GROUP_JID)
		await givenRemote(testBed, { channelId: CHANNEL, remoteId: JID, name: 'Gabriel Araújo', avatarUrl: PHOTO_URL })
		thread.recordEntry({ kind: TranscriptKind.CONTACT, text: 'bom dia', senderExternalId: JID, at: new Date() })
		await testBed.resolve(ThreadRepository).save(thread)

		const line = (await dashboard()).latestActivity.find(a => a.subtitle === 'bom dia')

		expect(line?.sender).toEqual({ channelId: CHANNEL, externalId: JID, displayName: 'Gabriel Araújo', hasAvatar: true })
	})

	/** A sender with no contact-book row keeps the attribution, falling back to the JID for a name. */
	it('an unknown sender keeps the attribution and reports no photo', async () => {
		const thread = await threadOn(GROUP_JID)
		thread.recordEntry({ kind: TranscriptKind.CONTACT, text: 'quem sou eu', senderExternalId: JID, at: new Date() })
		await testBed.resolve(ThreadRepository).save(thread)

		const line = (await dashboard()).latestActivity.find(a => a.subtitle === 'quem sou eu')

		expect(line?.sender).toEqual({ channelId: CHANNEL, externalId: JID, displayName: JID, hasAvatar: false })
	})

	/**
	 * The product's OWN lines have no face to borrow — the agent's `SYSTEM` reply carries no sender at
	 * all, exactly as in `GetSessionChat`, so the console keeps composing their caption from `kind`.
	 */
	it('a line the product produced carries no sender', async () => {
		const thread = await threadOn(GROUP_JID)
		thread.recordEntry({ kind: TranscriptKind.SYSTEM, text: 'resposta do agente', at: new Date() })
		await testBed.resolve(ThreadRepository).save(thread)

		expect((await dashboard()).latestActivity.find(a => a.subtitle === 'resposta do agente')?.sender).toBeUndefined()
	})
})
