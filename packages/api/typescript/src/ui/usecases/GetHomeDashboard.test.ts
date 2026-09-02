import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenChannel, givenIssue, givenRemote, givenThread, givenWorkspace, GIVEN_MENTION_TAG } from '@test/support'
import { IssueStatus, ThreadStatus, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import type { Thread } from '@thread/entities/Thread'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { OPERATOR_PARTICIPANT_ID } from '@thread/objects/TranscriptSpeaker'
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
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('AC-F1.1 — an IDLE thread is listed as a conversation but is NOT an active session', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, workspaceId: workspace.id.value })

		const dashboard = await testBed.resolve(GetHomeDashboard).execute({ ownerId: MOCK_CLOUD_OWNER_ID })

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
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, workspaceId: workspace.id.value })
		await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, key: 'working-now', status: IssueStatus.WORKING })

		const dashboard = await testBed.resolve(GetHomeDashboard).execute({ ownerId: MOCK_CLOUD_OWNER_ID })

		// The headline and the block must agree — that disagreement WAS the bug.
		expect(dashboard.agentsRunningNow).toBe(1)
		expect(dashboard.activeSessions.map(t => t.threadId)).toContain(thread.id.value)
		expect(dashboard.threads.find(t => t.threadId === thread.id.value)?.status).toBe(ThreadStatus.RUNNING)
	})

	it('the operator pausing beats work in flight — PAUSED outranks RUNNING', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, workspaceId: workspace.id.value })
		await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, key: 'working-now', status: IssueStatus.WORKING })
		thread.pause()
		await testBed.resolve(ThreadRepository).save(thread)

		const dashboard = await testBed.resolve(GetHomeDashboard).execute({ ownerId: MOCK_CLOUD_OWNER_ID })

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
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
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
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		return givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, workspaceId: workspace.id.value })
	}

	it('measures the wait from the inbound message to the reply that answered it', async () => {
		const thread = await newThread()
		await givenTranscript(thread, [
			{ kind: TranscriptKind.CONTACT, at: todayAt(0) },
			{ kind: TranscriptKind.SYSTEM, at: todayAt(2) },
		])

		const dashboard = await testBed.resolve(GetHomeDashboard).execute({ ownerId: MOCK_CLOUD_OWNER_ID })

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

		const dashboard = await testBed.resolve(GetHomeDashboard).execute({ ownerId: MOCK_CLOUD_OWNER_ID })

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

		const dashboard = await testBed.resolve(GetHomeDashboard).execute({ ownerId: MOCK_CLOUD_OWNER_ID })

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

		const dashboard = await testBed.resolve(GetHomeDashboard).execute({ ownerId: MOCK_CLOUD_OWNER_ID })

		expect(dashboard.today.medianResponseSeconds).toBe(300)
	})

	/** The operator answering by hand from the console is still an answer the contact received. */
	it('counts a DIRECT reply from the operator, not just the agent', async () => {
		const thread = await newThread()
		await givenTranscript(thread, [
			{ kind: TranscriptKind.CONTACT, at: todayAt(0) },
			{ kind: TranscriptKind.DIRECT, at: todayAt(3) },
		])

		const dashboard = await testBed.resolve(GetHomeDashboard).execute({ ownerId: MOCK_CLOUD_OWNER_ID })

		expect(dashboard.today.medianResponseSeconds).toBe(180)
	})

	/** An unanswered inbound has no wait to report yet — it must not be counted as an instant reply. */
	it('an inbound nobody has answered contributes nothing', async () => {
		const thread = await newThread()
		await givenTranscript(thread, [{ kind: TranscriptKind.CONTACT, at: todayAt(0) }])

		const dashboard = await testBed.resolve(GetHomeDashboard).execute({ ownerId: MOCK_CLOUD_OWNER_ID })

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

		const dashboard = await testBed.resolve(GetHomeDashboard).execute({ ownerId: MOCK_CLOUD_OWNER_ID })

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
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const CHANNEL = '019e4d24-0000-7041-9e1c-0000000000d1'
	const JID = '5511900000010@s.whatsapp.net'
	const GROUP_JID = '120363000000000000@g.us'
	const PHOTO_URL = 'https://pps.whatsapp.net/v/t61.24694-24/group.jpg'

	const threadOn = async (contactExternalId: string) => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		return givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, workspaceId: workspace.id.value, channelId: CHANNEL, contactExternalId })
	}

	const dashboard = () => testBed.resolve(GetHomeDashboard).execute({ ownerId: MOCK_CLOUD_OWNER_ID })

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
		await givenRemote(testBed, { channelId: CHANNEL, remoteId: JID, name: 'Diego Martins', avatarUrl: PHOTO_URL })
		thread.recordEntry({ kind: TranscriptKind.CONTACT, text: 'bom dia', senderExternalId: JID, at: new Date() })
		await testBed.resolve(ThreadRepository).save(thread)

		const line = (await dashboard()).latestActivity.find(a => a.subtitle === 'bom dia')

		expect(line?.sender).toEqual({ channelId: CHANNEL, externalId: JID, displayName: 'Diego Martins', hasAvatar: true })
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

/**
 * O ROSTO DO OPERADOR NA HOME — o par exato dos dois testes de `GetSessionChat`, e por isso escrito
 * ao lado deles em espírito: uma linha tem de se ler igual na home e na conversa de onde veio.
 *
 * As linhas do próprio operador são atribuídas ao sentinela `operator`, que não é um JID e nunca terá
 * linha em `gateway_remotes`. Esta leitura DESCARTAVA o sender por causa disso, e sem `sender` o
 * console cai no rótulo do `kind` — a atividade recente escrevia "Você" onde devia estar o nome e a
 * foto da conta conectada.
 *
 * FALSIFICADOR: tire o `case` do join (ou a troca no `senderOf`) e o primeiro teste volta a
 * `undefined` enquanto o segundo — a degradação — segue verde. É essa meia-falha silenciosa que o par
 * existe para pegar.
 */
describe('GetHomeDashboard — a linha do operador tem o rosto da conta conectada', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const GROUP_JID = '120363000000000001@g.us'
	/** A conta CONECTADA — o JID por trás do sentinela, vindo de `channels.owner_remote_id`. */
	const OWNER = '5511900000009@s.whatsapp.net'
	const OWNER_PHOTO = 'https://pps.whatsapp.net/v/t61.24694-24/owner_n.jpg'

	const threadOnChannelWith = async (ownerRemoteId: string) => {
		const { channelId } = await givenChannel(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, ownerRemoteId })
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const thread = await givenThread(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			workspaceId: workspace.id.value,
			channelId,
			contactExternalId: GROUP_JID,
		})
		return { thread, channelId }
	}

	const dashboard = () => testBed.resolve(GetHomeDashboard).execute({ ownerId: MOCK_CLOUD_OWNER_ID })

	it('resolve o sentinela `operator` na conta do canal — nome e foto, não o rótulo do kind', async () => {
		const { thread, channelId } = await threadOnChannelWith(OWNER)
		await givenRemote(testBed, { channelId, remoteId: OWNER, name: 'Diego Martins', avatarUrl: OWNER_PHOTO })
		thread.recordEntry({ kind: TranscriptKind.DIRECT, text: 'já subi', senderExternalId: OPERATOR_PARTICIPANT_ID, at: new Date() })
		await testBed.resolve(ThreadRepository).save(thread)

		expect((await dashboard()).latestActivity.find(a => a.subtitle === 'já subi')?.sender).toEqual({
			channelId,
			externalId: OWNER,
			displayName: 'Diego Martins',
			hasAvatar: true,
		})
	})

	/**
	 * O par do teste acima: sem `owner_remote_id` (canal antigo — a coluna nasceu com default `''` — ou
	 * desconectado) não há a quem apontar, e a linha volta a ser anônima. Degradação, nunca erro: a home
	 * não pode deixar de carregar porque a conta ainda não foi projetada.
	 */
	it('deixa a linha do operador anônima quando o canal não tem conta conectada', async () => {
		const { thread } = await threadOnChannelWith('')
		thread.recordEntry({ kind: TranscriptKind.DIRECT, text: 'já subi', senderExternalId: OPERATOR_PARTICIPANT_ID, at: new Date() })
		await testBed.resolve(ThreadRepository).save(thread)

		expect((await dashboard()).latestActivity.find(a => a.subtitle === 'já subi')?.sender).toBeUndefined()
	})

	/**
	 * A troca é do SENTINELA e de mais nada. Um contato de verdade continua resolvendo por si — se o
	 * `case` casasse largo demais, toda linha de entrada herdaria o rosto do dono do canal.
	 */
	it('não empresta a conta conectada para a linha de um contato', async () => {
		const CONTACT = '5511900000001@s.whatsapp.net'
		const { thread, channelId } = await threadOnChannelWith(OWNER)
		await givenRemote(testBed, { channelId, remoteId: OWNER, name: 'Diego Martins', avatarUrl: OWNER_PHOTO })
		await givenRemote(testBed, { channelId, remoteId: CONTACT, name: 'Ada Lovelace' })
		thread.recordEntry({ kind: TranscriptKind.CONTACT, text: 'e aí?', senderExternalId: CONTACT, at: new Date() })
		await testBed.resolve(ThreadRepository).save(thread)

		expect((await dashboard()).latestActivity.find(a => a.subtitle === 'e aí?')?.sender).toEqual({
			channelId,
			externalId: CONTACT,
			displayName: 'Ada Lovelace',
			hasAvatar: false,
		})
	})
})

/**
 * `mentionCta` — the dashboard's own "mencione o agente" follow-up (moved here 2026-08-26 from a
 * frontend-only Zustand field that only ever survived one React tick post-onboarding).
 *
 * WHETHER it is owed is ONE owner-wide, one-way fact: nobody carrying `OPERATOR_PARTICIPANT_ID` has
 * ever written a line in ANY thread of the owner. WHICH thread it names is the mention gate — an
 * eligibility filter over the owner's live threads, not a second condition on the CTA coming back.
 *
 * The two questions are asserted apart on purpose. While the read was per-thread (until 2026-08-27)
 * every test below still passed, because each one owned a single thread — the shape that cannot tell
 * "the operator has never spoken" from "the operator has never spoken HERE". It took a second thread
 * to see it, which is why that case now leads the suite.
 */
describe('GetHomeDashboard — mentionCta', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const dashboard = () => testBed.resolve(GetHomeDashboard).execute({ ownerId: MOCK_CLOUD_OWNER_ID })

	/**
	 * THE REGRESSION THAT MADE THIS FIRST-RUN-GLOBAL. The operator talks to the agent in one thread —
	 * first run over, for good — and then attaches a second conversation, which is necessarily empty.
	 * Under the per-thread rule that empty thread qualified (gated, no operator line of its OWN), so
	 * the dashboard told a long-time user to "fale com o agente pela primeira vez" every time they
	 * added a contact. Two threads is the minimum shape that can catch it.
	 */
	it('never returns once the operator has spoken anywhere — not even for a brand-new empty thread', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const spokenIn = await givenThread(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			workspaceId: workspace.id.value,
			contactExternalId: 'old-friend',
		})
		spokenIn.recordEntry({
			kind: TranscriptKind.CONTACT,
			text: '@test-workspace oi',
			senderExternalId: OPERATOR_PARTICIPANT_ID,
			at: new Date(),
		})
		await testBed.resolve(ThreadRepository).save(spokenIn)

		// Attached afterwards, so it also wins the most-recently-created tie-break the CTA used to pick by.
		await new Promise(resolve => setTimeout(resolve, 5))
		await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, workspaceId: workspace.id.value, contactExternalId: 'brand-new' })

		expect((await dashboard()).mentionCta).toBeUndefined()
	})

	/**
	 * The fact is "has this operator ever spoken", not "is there a live thread they spoke in" — so the
	 * owner-wide read is deliberately NOT joined onto `threads`. Deleting the conversation does not
	 * unspeak the line, and a rule that let it would hand the per-thread bug back in a smaller form:
	 * delete the thread you talked in, and the first-run banner returns.
	 */
	it('stays retired when the only thread the operator spoke in was since deleted', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const repo = testBed.resolve(ThreadRepository)
		const spokenIn = await givenThread(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			workspaceId: workspace.id.value,
			contactExternalId: 'gone',
		})
		spokenIn.recordEntry({
			kind: TranscriptKind.CONTACT,
			text: '@test-workspace oi',
			senderExternalId: OPERATOR_PARTICIPANT_ID,
			at: new Date(),
		})
		spokenIn.delete()
		await repo.save(spokenIn)

		await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, workspaceId: workspace.id.value, contactExternalId: 'still-here' })

		expect((await dashboard()).mentionCta).toBeUndefined()
	})

	it('surfaces a freshly attached thread — gated, untouched by the operator', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, workspaceId: workspace.id.value })

		const result = await dashboard()

		expect(result.mentionCta).toEqual({ threadId: thread.id.value, tag: GIVEN_MENTION_TAG })
	})

	/** The operator pasting the mention into the channel is exactly what satisfies this CTA. */
	it('disappears once the operator has written a line — any kind, any device', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, workspaceId: workspace.id.value })
		thread.recordEntry({
			kind: TranscriptKind.CONTACT,
			text: '@test-workspace oi',
			senderExternalId: OPERATOR_PARTICIPANT_ID,
			at: new Date(),
		})
		await testBed.resolve(ThreadRepository).save(thread)

		expect((await dashboard()).mentionCta).toBeUndefined()
	})

	/**
	 * A real contact's own lines must NOT satisfy this CTA — an already-busy group thread stays flagged
	 * until the OPERATOR specifically has said something, not merely until the thread has any traffic.
	 */
	it('stays present while only a real contact has spoken, not the operator', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, workspaceId: workspace.id.value })
		thread.recordEntry({ kind: TranscriptKind.CONTACT, text: 'oi', senderExternalId: 'someone-else', at: new Date() })
		await testBed.resolve(ThreadRepository).save(thread)

		expect((await dashboard()).mentionCta).toEqual({ threadId: thread.id.value, tag: GIVEN_MENTION_TAG })
	})

	/** The gate decides WHICH thread has something to paste — a thread without one is not eligible. */
	it('is absent when the operator has turned the mention gate off', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, workspaceId: workspace.id.value })
		thread.configureMentionGate({ enabled: false })
		await testBed.resolve(ThreadRepository).save(thread)

		expect((await dashboard()).mentionCta).toBeUndefined()
	})

	it('is absent when there is no thread at all', async () => {
		expect((await dashboard()).mentionCta).toBeUndefined()
	})

	/**
	 * Two eligible threads: the most recently CREATED one wins, not an arbitrary row order. The
	 * `createdAt` column is millisecond-resolution `$defaultFn(() => new Date())` — a real gap between
	 * the two writes (not just two ticks of the same microtask queue) is what makes the tie-break
	 * observable at all.
	 */
	it('names the most recently created eligible thread when more than one is on offer', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, workspaceId: workspace.id.value, contactExternalId: 'older' })
		// Long enough to cross a clock TICK, not just to "wait a bit". The assertion below is about
		// which thread is newer, so the two `createdAt` values have to actually differ — and the
		// Windows system clock advances in ~15.6ms steps by default, so a 5ms sleep routinely leaves
		// both rows stamped with the SAME millisecond and the tie-break picks arbitrarily. It failed
		// intermittently, and only under load, which reads like an unrelated race until you notice
		// the sleep is shorter than the tick. Any interval longer than the tick must contain one.
		await new Promise(resolve => setTimeout(resolve, 25))
		const newer = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, workspaceId: workspace.id.value, contactExternalId: 'newer' })

		expect((await dashboard()).mentionCta?.threadId).toBe(newer.id.value)
	})
})
