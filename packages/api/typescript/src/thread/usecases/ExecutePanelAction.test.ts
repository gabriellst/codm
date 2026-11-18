import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { LibSqlDatabaseDriver } from '@codm/core-typescript'
import {
	AskAnswerKind,
	AskEffect,
	ContactKind,
	IssueControlSource,
	IssueStatus,
	Language,
	IssueTimelineItemKind,
	MailboxItemKind,
	MailboxTargetKind,
	PanelActionKind,
	PanelActionOutcome,
	PermissionPosture,
	StopKind,
	StopResolution,
	TranscriptKind,
} from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenChannel, givenIssue, givenRemote, givenRemoteMembership, givenStop, givenThread } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import type { PanelActionBody } from '@shared/schemas'
import { IssueRepository } from '@issue/repositories/IssueRepository'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import { assembleIssueTimeline } from '@issue/utils/issueTimeline'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { PanelActionLedger } from '../repositories/PanelActionLedger'
import { PanelRosterRelay, type MockPanelRosterRelay } from '../services/PanelRosterRelay'
import { PanelMemberKey } from '../services/PanelMemberKey'
import { THREAD_MESSAGES } from '../i18n/messages'
import { PanelActionEcho } from '../enums'
import { PublishPanelRoster } from './PublishPanelRoster'

// Neutral fixtures: made-up addresses that only LOOK like WhatsApp ids, so a leak is detectable.
const GROUP_JID = '120300000000000001@g.us'
const OWNER_JID = '5500000000001@s.whatsapp.net'
const ANA_JID = '5500000000002@s.whatsapp.net'
const BETO_JID = '5500000000003@s.whatsapp.net'
const MUTED_JID = '5500000000004@s.whatsapp.net'

let sequence = 0
/** A fresh action id per call (uuid-shaped, ordered). */
const actionId = () => {
	sequence += 1
	return `019e4d24-6524-7041-9e1c-${(0x8108180ce000 + sequence).toString(16)}`
}

/**
 * ACTING FROM THE PANEL, ON THE DAEMON (fase 2, item 6b) — through the real pull (`PublishPanelRoster`),
 * with the cloud replaced by its recorder.
 *
 * What must hold: each action runs AS the member its opaque id resolves to on this machine (the same use
 * cases, source PANEL, the contact-book name), with the release grant re-checked now; an action handed out
 * twice acts once; the group gets one exact echo line linked to the issue, never the steer's words; the
 * outcome reaches the cloud on the next pull; and nothing carrying a phone number or JID leaves.
 *
 * Falsifiers: resolve the member by name and Beto's pause is attributed to someone else; skip the ledger
 * and the duplicate pauses twice (ISSUE_ALREADY_PAUSED on the second); trust the cloud's `canRelease` and
 * the member who lost the grant approves; put the steer text in the echo and the leak check fails.
 */
describe('ExecutePanelAction — through the roster pull', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
		const relay = testBed.resolve(PanelRosterRelay) as MockPanelRosterRelay
		relay.batches.length = 0
		relay.actions = []
		relay.pending = []
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const relay = () => testBed.resolve(PanelRosterRelay) as MockPanelRosterRelay
	const run = () => testBed.resolve(PublishPanelRoster).execute({})

	const givenGroup = async () => {
		const { channelId } = await givenChannel(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, ownerRemoteId: OWNER_JID })
		await givenRemote(testBed, { channelId, remoteId: GROUP_JID, name: 'Equipe', type: ContactKind.GROUP })
		await givenRemote(testBed, { channelId, remoteId: OWNER_JID, name: 'Dona' })
		await givenRemote(testBed, { channelId, remoteId: ANA_JID, name: 'Ana' })
		await givenRemote(testBed, { channelId, remoteId: BETO_JID, name: 'Beto' })
		await givenRemote(testBed, { channelId, remoteId: MUTED_JID, name: 'Caio' })
		for (const memberId of [OWNER_JID, ANA_JID, BETO_JID, MUTED_JID]) {
			await givenRemoteMembership(testBed, { channelId, groupId: GROUP_JID, memberId })
		}
		const thread = await givenThread(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			channelId,
			contactExternalId: GROUP_JID,
			contactKind: ContactKind.GROUP,
			participants: [
				{ participantId: 'operator', name: 'Operator', source: 'Operator on this machine', canInvoke: true, canElevate: true },
				// The roster JSON keeps the bare JID as the name — what goes out must be the contact-book name.
				{ participantId: ANA_JID, name: ANA_JID, source: 'Channel group member', canInvoke: true, canElevate: true },
				{ participantId: BETO_JID, name: BETO_JID, source: 'Channel group member', canInvoke: true, canElevate: false },
				{ participantId: MUTED_JID, name: MUTED_JID, source: 'Channel group member', canInvoke: false, canElevate: false },
			],
		})
		const threadId = thread.id.value
		const issue = await givenIssue(testBed, { threadId, key: 'APP-1', title: 'Toggle de dark mode' })
		const key = testBed.resolve(PanelMemberKey)
		return {
			channelId,
			threadId,
			issueId: issue.id.value,
			memberOf: (jid: string) => key.memberIdOf(threadId, jid),
		}
	}

	/** Hand `action` to the daemon as `memberId` on the next pull; returns the action id. */
	const handOut = (threadId: string, memberId: string, action: PanelActionBody, id = actionId()) => {
		relay().actions.push({ actionId: id, threadId, memberId, action })
		return id
	}

	const echoes = async (threadId: string) =>
		(await testBed.resolve(ThreadRepository).listEntries(threadId)).filter(entry => entry.kind === TranscriptKind.SYSTEM)
	/** Every echo goes out as one `deliver_channel_message` carrying the entry's own text. */
	const deliveries = () => testBed.probe().count('scheduledCommands', { name: 'deliver_channel_message' })
	const facts = (name: string, entityId: string) => testBed.probe().persistedEvents({ name, entityId })
	const lastOutcomes = () => relay().batches.at(-1)?.outcomes ?? []

	it('pause and resume run AS the member — source PANEL, contact-book name, one exact echo linked to the issue', async () => {
		const { threadId, issueId, memberOf } = await givenGroup()
		const paused = handOut(threadId, memberOf(BETO_JID), { kind: PanelActionKind.PAUSE, issueId })

		expect(await run()).toEqual(expect.objectContaining({ sent: true, acted: 1 }))
		expect((await testBed.resolve(IssueRepository).findById(issueId))?.paused).toBe(true)
		const [fact] = await facts('issue.paused', issueId)
		expect(fact?.payload).toEqual(
			expect.objectContaining({ source: IssueControlSource.PANEL, requestedBy: 'Beto', requestedById: BETO_JID }),
		)

		const [echo] = await echoes(threadId)
		expect(echo?.text).toBe('Beto pausou APP-1 pelo painel')
		expect(echo?.issueId).toBe(issueId)
		expect(await deliveries()).toBe(1)

		// The outcome rides the NEXT pull, then is not sent again.
		const resumed = handOut(threadId, memberOf(BETO_JID), { kind: PanelActionKind.RESUME, issueId })
		await run()
		expect(lastOutcomes()).toEqual([{ actionId: paused, status: PanelActionOutcome.DONE }])
		expect((await testBed.resolve(IssueRepository).findById(issueId))?.paused).toBe(false)
		expect((await echoes(threadId)).map(entry => entry.text)).toContain('Beto retomou APP-1 pelo painel')

		await run()
		expect(lastOutcomes()).toEqual([{ actionId: resumed, status: PanelActionOutcome.DONE }])
		await run()
		expect(lastOutcomes()).toEqual([])
	})

	it('an action handed out twice acts once — and reports the same outcome', async () => {
		const { threadId, issueId, memberOf } = await givenGroup()
		const id = handOut(threadId, memberOf(ANA_JID), { kind: PanelActionKind.PAUSE, issueId })
		await run()
		// The cloud did not hear back and hands the same action out again.
		handOut(threadId, memberOf(ANA_JID), { kind: PanelActionKind.PAUSE, issueId }, id)
		expect(await run()).toEqual(expect.objectContaining({ acted: 0 }))

		expect(await facts('issue.paused', issueId)).toHaveLength(1)
		expect(await echoes(threadId)).toHaveLength(1)
		expect(await testBed.resolve(PanelActionLedger).find(id)).toEqual(expect.objectContaining({ outcome: PanelActionOutcome.DONE }))
	})

	it('steer goes to the issue as the member (timeline shows it); the echo never carries the words', async () => {
		const { threadId, issueId, memberOf } = await givenGroup()
		handOut(threadId, memberOf(BETO_JID), { kind: PanelActionKind.STEER, issueId, text: 'Use o tema escuro no rodapé' })
		await run()

		// Beto has no release grant, so his steer runs filtered — never under the operator's posture.
		const steer = await testBed.resolve(MailboxRepository).claimNext('test', 60_000, [MailboxTargetKind.ISSUE])
		expect(steer?.kind).toBe(MailboxItemKind.STEER)
		expect(steer?.targetId).toBe(issueId)
		expect(steer?.posture).toBe(PermissionPosture.AUTO)

		const [echo] = await echoes(threadId)
		expect(echo?.text).toBe('Beto orientou APP-1 pelo painel')
		expect(echo?.text).not.toContain('tema escuro')
		expect(await deliveries()).toBe(1)

		const timeline = await assembleIssueTimeline(testBed.resolve(LibSqlDatabaseDriver), issueId, 'Toggle de dark mode')
		expect(timeline.some(item => item.kind === IssueTimelineItemKind.STEER && item.text === 'Beto: Use o tema escuro no rodapé')).toBe(true)
	})

	it('steer on a finished or waiting issue reopens it, like SteerIssueTurn — in the same transaction', async () => {
		const { threadId, memberOf } = await givenGroup()
		const done = await givenIssue(testBed, { threadId, key: 'APP-2', status: IssueStatus.COMPLETED })
		const waiting = await givenIssue(testBed, { threadId, key: 'APP-3', status: IssueStatus.NEEDS_INPUT })
		await givenStop(testBed, { threadId, issueId: waiting.id.value, kind: StopKind.HUMAN_REQUESTED })
		handOut(threadId, memberOf(ANA_JID), { kind: PanelActionKind.STEER, issueId: done.id.value, text: 'Refaça com o logo novo' })
		handOut(threadId, memberOf(ANA_JID), { kind: PanelActionKind.STEER, issueId: waiting.id.value, text: 'Pode seguir com a opção B' })
		expect(await run()).toEqual(expect.objectContaining({ acted: 2 }))

		const issues = testBed.resolve(IssueRepository)
		expect((await issues.findById(done.id.value))?.status).toBe(IssueStatus.WORKING)
		expect((await issues.findById(waiting.id.value))?.status).toBe(IssueStatus.WORKING)
		expect((await echoes(threadId)).map(entry => entry.text)).toEqual(['Ana orientou APP-2 pelo painel', 'Ana orientou APP-3 pelo painel'])
	})

	it('the echo follows the conversation language', () => {
		expect(THREAD_MESSAGES.panelActionEcho(Language.EN_US, { name: 'Ana', key: 'APP-12', echo: PanelActionEcho.PAUSED })).toBe(
			'Ana paused APP-12 from the panel',
		)
		expect(THREAD_MESSAGES.panelActionEcho(Language.EN_US, { name: 'Ana', key: 'APP-12', echo: PanelActionEcho.STEERED })).toBe(
			'Ana steered APP-12 from the panel',
		)
	})

	it('answering a stop: a member who may release approves it; one who lost the grant is refused, the stop stays open', async () => {
		const { threadId, issueId, memberOf } = await givenGroup()
		const stop = await givenStop(testBed, { threadId, issueId, kind: StopKind.APPROVAL_NEEDED })

		// The roster sends this open stop with the answers the panel offers (no TAKE_OVER).
		await run()
		expect(relay().batches.at(-1)?.groups[0]?.openStops).toEqual([
			{ stopId: stop.stopId, issueId, kind: StopKind.APPROVAL_NEEDED, resolutions: [StopResolution.APPROVE, StopResolution.DENY] },
		])

		// Beto has no release grant NOW (whatever the cloud's copy said): refused, nothing resolved, no echo.
		const refused = handOut(threadId, memberOf(BETO_JID), {
			kind: PanelActionKind.ANSWER_STOP,
			issueId,
			stopId: stop.stopId,
			resolution: StopResolution.APPROVE,
		})
		await run()
		expect(await testBed.resolve(PanelActionLedger).find(refused)).toEqual(
			expect.objectContaining({ outcome: PanelActionOutcome.REFUSED, code: 'PARTICIPANT_CANNOT_RELEASE' }),
		)
		expect(await testBed.resolve(ThreadRepository).openStops(threadId)).toHaveLength(1)
		expect(await echoes(threadId)).toHaveLength(0)

		handOut(threadId, memberOf(ANA_JID), {
			kind: PanelActionKind.ANSWER_STOP,
			issueId,
			stopId: stop.stopId,
			resolution: StopResolution.APPROVE,
		})
		await run()
		expect(lastOutcomes()).toEqual([{ actionId: refused, status: PanelActionOutcome.REFUSED, code: 'PARTICIPANT_CANNOT_RELEASE' }])
		expect(await testBed.resolve(ThreadRepository).openStops(threadId)).toHaveLength(0)
		expect((await testBed.resolve(ThreadRepository).findStop(stop.stopId))?.resolution).toBe(StopResolution.APPROVE)
		expect((await echoes(threadId)).map(entry => entry.text)).toEqual(['Ana aprovou APP-1 pelo painel'])
	})

	const YES_NO = [
		{ id: 'yes', label: 'Sim' },
		{ id: 'no', label: 'Não' },
	]

	it('fase 3 — an ask goes out with its view (code, options, who may answer, no address), not a bare resolution', async () => {
		const { threadId, issueId } = await givenGroup()
		const stop = await givenStop(testBed, {
			threadId,
			issueId,
			ask: {
				question: 'Publico a prévia?',
				options: YES_NO,
				effects: [AskEffect.PUBLISH],
				addresseeId: ANA_JID,
				requested: StopKind.DECISION_REQUESTED,
			},
		})

		await run()
		expect(relay().batches.at(-1)?.groups[0]?.openStops).toEqual([
			{
				stopId: stop.stopId,
				issueId,
				kind: StopKind.DECISION_REQUESTED,
				resolutions: [],
				ask: {
					kind: StopKind.DECISION_REQUESTED,
					code: 'APP-1 · D1',
					question: 'Publico a prévia?',
					reply: { kind: AskAnswerKind.OPTION, options: YES_NO },
					releaseRequired: true,
				},
			},
		])
		// The addressee is a WhatsApp address on this machine — it never rides the roster.
		expect(JSON.stringify(relay().batches)).not.toContain('@')
	})

	it('fase 3 — ANSWER_ASK runs AnswerStop as the member: the ruler of who answers, the answer recorded, one echo with the code', async () => {
		const { threadId, issueId, memberOf } = await givenGroup()
		const stop = await givenStop(testBed, {
			threadId,
			issueId,
			ask: { question: 'Publico a prévia?', options: YES_NO, effects: [AskEffect.PUBLISH], requested: StopKind.DECISION_REQUESTED },
		})
		const no = { kind: AskAnswerKind.OPTION, optionId: 'no' } as const

		// Beto may act but not release: a decision that publishes is refused, the ask stays open, no echo.
		const refused = handOut(threadId, memberOf(BETO_JID), { kind: PanelActionKind.ANSWER_ASK, issueId, stopId: stop.stopId, answer: no })
		await run()
		expect(await testBed.resolve(PanelActionLedger).find(refused)).toEqual(
			expect.objectContaining({ outcome: PanelActionOutcome.REFUSED, code: 'PARTICIPANT_CANNOT_RELEASE' }),
		)
		expect(await testBed.resolve(ThreadRepository).openStops(threadId)).toHaveLength(1)
		expect(await echoes(threadId)).toHaveLength(0)

		// Ana may release: the answer lands as hers, with the echo the group sees.
		handOut(threadId, memberOf(ANA_JID), { kind: PanelActionKind.ANSWER_ASK, issueId, stopId: stop.stopId, answer: no })
		await run()
		const answered = await testBed.resolve(ThreadRepository).findStop(stop.stopId)
		expect(answered?.resolution).toBe(StopResolution.ANSWER)
		expect(answered?.answer).toEqual(no)
		expect(answered?.answeredBy).toBe(ANA_JID)
		expect((await echoes(threadId)).map(entry => entry.text)).toEqual(['Ana respondeu APP-1 · D1 pelo painel'])

		// A second answer to the same ask (another device, a re-sent click): refused, the first one stands.
		const late = handOut(threadId, memberOf(ANA_JID), {
			kind: PanelActionKind.ANSWER_ASK,
			issueId,
			stopId: stop.stopId,
			answer: { kind: AskAnswerKind.OPTION, optionId: 'yes' },
		})
		await run()
		expect(await testBed.resolve(PanelActionLedger).find(late)).toEqual(
			expect.objectContaining({ outcome: PanelActionOutcome.REFUSED, code: 'STOP_ALREADY_RESOLVED' }),
		)
		expect(await echoes(threadId)).toHaveLength(1)
	})

	it('fase 3 — a question without effect: any member who may act answers in free text; a muted one and another issue are refused', async () => {
		const { threadId, issueId, memberOf } = await givenGroup()
		const other = await givenIssue(testBed, { threadId, key: 'APP-2', title: 'Outra' })
		const stop = await givenStop(testBed, {
			threadId,
			issueId,
			ask: {
				question: 'Qual título?',
				options: [],
				default: { kind: AskAnswerKind.TEXT, text: 'Novidades' },
				effects: [],
				requested: StopKind.QUESTION_ASKED,
			},
		})
		const text = { kind: AskAnswerKind.TEXT, text: 'Novidades de novembro' } as const

		const muted = handOut(threadId, memberOf(MUTED_JID), { kind: PanelActionKind.ANSWER_ASK, issueId, stopId: stop.stopId, answer: text })
		const foreign = handOut(threadId, memberOf(BETO_JID), {
			kind: PanelActionKind.ANSWER_ASK,
			issueId: other.id.value,
			stopId: stop.stopId,
			answer: text,
		})
		await run()
		expect(await testBed.resolve(PanelActionLedger).find(muted)).toEqual(expect.objectContaining({ code: 'PARTICIPANT_CANNOT_ACT' }))
		expect(await testBed.resolve(PanelActionLedger).find(foreign)).toEqual(expect.objectContaining({ code: 'STOP_NOT_FOUND' }))

		handOut(threadId, memberOf(BETO_JID), { kind: PanelActionKind.ANSWER_ASK, issueId, stopId: stop.stopId, answer: text })
		await run()
		expect((await testBed.resolve(ThreadRepository).findStop(stop.stopId))?.answer).toEqual(text)
		expect((await echoes(threadId)).map(entry => entry.text)).toEqual(['Beto respondeu APP-1 · D1 pelo painel'])
	})

	it("the account's own number answers as the operator; a muted member and one who left are refused", async () => {
		const { threadId, issueId, memberOf } = await givenGroup()
		const stop = await givenStop(testBed, { threadId, issueId, kind: StopKind.APPROVAL_NEEDED })
		const owner = handOut(threadId, memberOf(OWNER_JID), {
			kind: PanelActionKind.ANSWER_STOP,
			issueId,
			stopId: stop.stopId,
			resolution: StopResolution.DENY,
		})
		const muted = handOut(threadId, memberOf(MUTED_JID), { kind: PanelActionKind.PAUSE, issueId })
		const gone = handOut(threadId, 'AAAAAAAAAAAAAAAAAAAAAA', { kind: PanelActionKind.PAUSE, issueId })
		await run()

		const ledger = testBed.resolve(PanelActionLedger)
		expect(await ledger.find(owner)).toEqual(expect.objectContaining({ outcome: PanelActionOutcome.DONE }))
		expect(await ledger.find(muted)).toEqual(
			expect.objectContaining({ outcome: PanelActionOutcome.REFUSED, code: 'PARTICIPANT_CANNOT_ACT' }),
		)
		expect(await ledger.find(gone)).toEqual(expect.objectContaining({ outcome: PanelActionOutcome.REFUSED, code: 'PARTICIPANT_NOT_FOUND' }))
		expect((await echoes(threadId)).map(entry => entry.text)).toEqual(['Dona recusou APP-1 pelo painel'])
		expect((await testBed.resolve(IssueRepository).findById(issueId))?.paused).toBe(false)
	})

	it('an issue of another conversation is refused, and a failed pull keeps the outcome for the next one', async () => {
		const { threadId, memberOf } = await givenGroup()
		const elsewhere = await givenIssue(testBed, { key: 'OUT-1' })
		const id = handOut(threadId, memberOf(ANA_JID), { kind: PanelActionKind.PAUSE, issueId: elsewhere.id.value })
		await run()
		expect((await testBed.resolve(IssueRepository).findById(elsewhere.id.value))?.paused).toBe(false)

		relay().failing = true
		expect(await run()).toEqual(expect.objectContaining({ sent: false }))
		relay().failing = false
		await run()
		expect(lastOutcomes()).toEqual([{ actionId: id, status: PanelActionOutcome.REFUSED, code: 'ISSUE_NOT_FOUND' }])
	})

	it('nothing that leaves for the cloud carries a phone number or a JID — roster, stops, outcomes, the issue timeline', async () => {
		const { threadId, issueId, memberOf } = await givenGroup()
		const stop = await givenStop(testBed, { threadId, issueId, kind: StopKind.APPROVAL_NEEDED })
		handOut(threadId, memberOf(BETO_JID), { kind: PanelActionKind.STEER, issueId, text: 'Ajuste o contraste' })
		handOut(threadId, memberOf(BETO_JID), { kind: PanelActionKind.PAUSE, issueId })
		handOut(threadId, memberOf(BETO_JID), {
			kind: PanelActionKind.ANSWER_STOP,
			issueId,
			stopId: stop.stopId,
			resolution: StopResolution.DENY,
		})
		await run()
		await run()

		const wire = JSON.stringify(relay().batches)
		expect(wire).not.toContain('@')
		expect(wire).not.toMatch(/5500000000/)
		// The issue timeline is what the board snapshot publishes: names only, never the address.
		const timeline = JSON.stringify(await assembleIssueTimeline(testBed.resolve(LibSqlDatabaseDriver), issueId, 'Toggle de dark mode'))
		expect(timeline).not.toContain('@')
		expect(timeline).not.toMatch(/5500000000/)
		expect(timeline).toContain('Beto')
	})
})
