import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { PgDatabaseDriver } from '@codm/core-typescript'
import { panelActions } from '@codm/contracts/db/pg'
import {
	AskAnswerKind,
	IssueLifeState,
	IssueStatus,
	PanelActionKind,
	PanelActionOutcome,
	PanelActionStatus,
	StopKind,
	StopResolution,
} from '@codm/contracts-typescript/wire/enums'
import type { PanelOpenStop } from '@shared/schemas'
import { TestBed } from '@test/support'
import { SyncPanel } from './SyncPanel'
import { SyncPanelRoster } from './SyncPanelRoster'
import { RequestPanelCode } from './RequestPanelCode'
import { VerifyPanelCode } from './VerifyPanelCode'
import { RequestPanelAction } from './RequestPanelAction'
import { GetPanelAction } from './GetPanelAction'
import { RotatePanelLink } from './RotatePanelLink'
import { GetPanelIssue } from './GetPanelIssue'
import { GetPanelBoard } from './GetPanelBoard'

const OWNER = '019e4d24-6524-7041-9e1c-8108180cde10'
const OTHER_OWNER = '019e4d24-6524-7041-9e1c-8108180cde11'
const GROUP = '019e4d24-6524-7041-9e1c-8108180cde20'
const OTHER_GROUP = '019e4d24-6524-7041-9e1c-8108180cde21'
const ISSUE = '019e4d24-6524-7041-9e1c-8108180cde30'
const OTHER_ISSUE = '019e4d24-6524-7041-9e1c-8108180cde31'
const STOP = '019e4d24-6524-7041-9e1c-8108180cde50'

const ANA = { memberId: 'm-ana-aaaaaaaaaaaaaaaaaa', name: 'Ana', canRelease: true }
const BETO = { memberId: 'm-beto-bbbbbbbbbbbbbbbbb', name: 'Beto', canRelease: false }
const OPEN_STOP = {
	stopId: STOP,
	issueId: ISSUE,
	kind: StopKind.APPROVAL_NEEDED,
	resolutions: [StopResolution.APPROVE, StopResolution.DENY],
}

const DECISION = '019e4d24-6524-7041-9e1c-8108180cde51'
const QUESTION = '019e4d24-6524-7041-9e1c-8108180cde52'
/** Fase 3 — the asks as the daemon reports them (`askViewOf`): a decision that publishes, a free-text question. */
const DECISION_ASK: PanelOpenStop = {
	stopId: DECISION,
	issueId: ISSUE,
	kind: StopKind.DECISION_REQUESTED,
	resolutions: [],
	ask: {
		kind: StopKind.DECISION_REQUESTED,
		code: 'APP-1 · D1',
		question: 'Publico a prévia?',
		reply: {
			kind: AskAnswerKind.OPTION,
			options: [
				{ id: 'yes', label: 'Sim' },
				{ id: 'no', label: 'Não' },
			],
		},
		releaseRequired: true,
	},
}
const QUESTION_ASK: PanelOpenStop = {
	stopId: QUESTION,
	issueId: ISSUE,
	kind: StopKind.QUESTION_ASKED,
	resolutions: [],
	ask: {
		kind: StopKind.QUESTION_ASKED,
		code: 'APP-1 · D2',
		question: 'Qual título?',
		reply: { kind: AskAnswerKind.TEXT },
		defaultLabel: 'Novidades',
	},
}

const issue = (issueId: string, threadId: string) => ({
	issueId,
	threadId,
	key: 'APP-1',
	title: 'Toggle de dark mode',
	status: IssueStatus.WORKING,
	lifeState: IssueLifeState.RUNNING,
	archived: false,
	timeline: [],
	updatedAt: '2026-11-13T10:00:00.000Z',
})

const refused = (promise: Promise<unknown>) =>
	promise.then(
		() => undefined,
		(error: unknown) => (error as { name?: string }).name,
	)

/**
 * ACTING FROM THE PANEL (fase 2, item 6b) against a real Postgres (PGlite).
 *
 * What must hold: only an identified device acts, and only on an issue of ITS group (a foreign issue looks
 * like a foreign link); answering a stop needs the release grant up front; an action reaches the daemon
 * ONCE per window and only while fresh; the daemon's outcome lands once, on its own owner's action, and
 * the page reads it back; rotating the link kills pending actions.
 */
describe('panel — acting as an identified member', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OWNER, db: 'pg' })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const pull = (outcomes?: Parameters<SyncPanelRoster['execute']>[0]['outcomes'], ownerId = OWNER) =>
		testBed.resolve(SyncPanelRoster).execute({ ownerId, groups: [], outcomes })

	/** A group with a board, its roster and open stop pushed, and ANA + BETO identified; returns the token and the two device tokens. */
	const identifiedGroup = async () => {
		const { groups } = await testBed.resolve(SyncPanel).execute({
			ownerId: OWNER,
			groups: [
				{ threadId: GROUP, name: 'Equipe' },
				{ threadId: OTHER_GROUP, name: 'Outra' },
			],
			issues: [issue(ISSUE, GROUP), issue(OTHER_ISSUE, OTHER_GROUP)],
		})
		const token = groups.find(group => group.threadId === GROUP)?.token ?? ''
		const otherToken = groups.find(group => group.threadId === OTHER_GROUP)?.token ?? ''
		await testBed.resolve(SyncPanelRoster).execute({
			ownerId: OWNER,
			groups: [
				{ threadId: GROUP, members: [ANA, BETO], openStops: [OPEN_STOP] },
				{ threadId: OTHER_GROUP, members: [ANA], openStops: [] },
			],
		})
		const device = async (memberId: string) => {
			await testBed.resolve(RequestPanelCode).execute({ token, memberId })
			const code = (await pull()).deliveries.find(delivery => delivery.memberId === memberId)?.code ?? ''
			return (await testBed.resolve(VerifyPanelCode).execute({ token, memberId, code })).deviceToken
		}
		return { token, otherToken, ana: await device(ANA.memberId), beto: await device(BETO.memberId) }
	}
	const act = (token: string, deviceToken: string | undefined, action: Parameters<RequestPanelAction['execute']>[0]['action']) =>
		testBed.resolve(RequestPanelAction).execute({ token, deviceToken, action })
	const status = (token: string, deviceToken: string, actionId: string) =>
		testBed.resolve(GetPanelAction).execute({ token, deviceToken, actionId })
	const db = () => testBed.resolve(PgDatabaseDriver).db

	it('stores the action and hands it to the daemon once, as the member who asked', async () => {
		const { token, beto } = await identifiedGroup()
		const { actionId, status: pending } = await act(token, beto, { kind: PanelActionKind.STEER, issueId: ISSUE, text: 'Use o tema escuro' })
		expect(pending).toBe(PanelActionStatus.PENDING)

		const first = await pull()
		expect(first.actions).toEqual([
			{
				actionId,
				threadId: GROUP,
				memberId: BETO.memberId,
				action: { kind: PanelActionKind.STEER, issueId: ISSUE, text: 'Use o tema escuro' },
			},
		])
		expect((await pull()).actions).toEqual([])
		// Another owner's pull never sees it.
		expect((await pull(undefined, OTHER_OWNER)).actions).toEqual([])
		expect((await status(token, beto, actionId)).status).toBe(PanelActionStatus.PENDING)
	})

	it('an unidentified device, a foreign issue and another group are refused like a wrong link', async () => {
		const { token, otherToken, ana } = await identifiedGroup()
		const pause = { kind: PanelActionKind.PAUSE, issueId: ISSUE } as const

		expect(await refused(act(token, undefined, pause))).toBe('PANEL_MEMBER_NOT_FOUND')
		expect(await refused(act(token, 'not-a-session', pause))).toBe('PANEL_MEMBER_NOT_FOUND')
		// An issue of another group of the same owner, through this group's link: not here.
		expect(await refused(act(token, ana, { kind: PanelActionKind.PAUSE, issueId: OTHER_ISSUE }))).toBe('PANEL_NOT_FOUND')
		// This device's session is for GROUP: on the other group's link it is nobody.
		expect(await refused(act(otherToken, ana, { kind: PanelActionKind.PAUSE, issueId: OTHER_ISSUE }))).toBe('PANEL_MEMBER_NOT_FOUND')
		expect(await refused(act('x'.repeat(43), ana, pause))).toBe('PANEL_NOT_FOUND')
		expect((await pull()).actions).toEqual([])
	})

	it('answering a stop needs the release grant, an open stop of that issue and an offered answer', async () => {
		const { token, ana, beto } = await identifiedGroup()
		const approve = { kind: PanelActionKind.ANSWER_STOP, issueId: ISSUE, stopId: STOP, resolution: StopResolution.APPROVE } as const

		expect(await refused(act(token, beto, approve))).toBe('PANEL_CANNOT_RELEASE')
		expect(await refused(act(token, ana, { ...approve, stopId: '019e4d24-6524-7041-9e1c-8108180cde59' }))).toBe('PANEL_NOT_FOUND')
		expect(await refused(act(token, ana, { ...approve, resolution: StopResolution.TAKE_OVER }))).toBe('PANEL_RESOLUTION_NOT_OFFERED')

		const { actionId } = await act(token, ana, approve)
		expect((await pull()).actions.map(action => action.actionId)).toEqual([actionId])

		// The page learns the stop and its answers from the issue read.
		expect((await testBed.resolve(GetPanelIssue).execute({ token, issueId: ISSUE })).openStops).toEqual([
			{
				stopId: STOP,
				kind: StopKind.APPROVAL_NEEDED,
				resolutions: [StopResolution.APPROVE, StopResolution.DENY],
			},
		])
	})

	it('fase 3 — answering an ask: an open ask of that issue, a releaser for a decision with an effect, an offered answer', async () => {
		const { token, ana, beto } = await identifiedGroup()
		await testBed.resolve(SyncPanelRoster).execute({
			ownerId: OWNER,
			groups: [{ threadId: GROUP, members: [ANA, BETO], openStops: [OPEN_STOP, DECISION_ASK, QUESTION_ASK] }],
		})
		const answer = (stopId: string, a: { kind: AskAnswerKind.OPTION; optionId: string } | { kind: AskAnswerKind.TEXT; text: string }) =>
			({ kind: PanelActionKind.ANSWER_ASK, issueId: ISSUE, stopId, answer: a }) as const
		const no = { kind: AskAnswerKind.OPTION, optionId: 'no' } as const

		// A decision whose answer publishes: only someone who may release.
		expect(await refused(act(token, beto, answer(DECISION, no)))).toBe('PANEL_CANNOT_RELEASE')
		// An option the ask does not list, and an option on a free-text question: not offered.
		expect(await refused(act(token, ana, answer(DECISION, { kind: AskAnswerKind.OPTION, optionId: 'maybe' })))).toBe(
			'PANEL_RESOLUTION_NOT_OFFERED',
		)
		expect(await refused(act(token, beto, answer(QUESTION, no)))).toBe('PANEL_RESOLUTION_NOT_OFFERED')
		// A stop that is not an ask, and an ask of another issue: not here.
		expect(await refused(act(token, ana, answer(STOP, no)))).toBe('PANEL_NOT_FOUND')
		expect(await refused(act(token, ana, { ...answer(DECISION, no), issueId: OTHER_ISSUE }))).toBe('PANEL_NOT_FOUND')

		// A question without effect: anyone identified; a releaser on the decision.
		const text = await act(token, beto, answer(QUESTION, { kind: AskAnswerKind.TEXT, text: 'Novidades de novembro' }))
		const option = await act(token, ana, answer(DECISION, no))
		expect((await pull()).actions.map(action => action.actionId).sort()).toEqual([text.actionId, option.actionId].sort())

		// The page reads every open ask of the issue, as the daemon reported it.
		const { openStops } = await testBed.resolve(GetPanelIssue).execute({ token, issueId: ISSUE })
		expect(openStops.map(stop => stop.ask?.code)).toEqual([undefined, 'APP-1 · D1', 'APP-1 · D2'])
		// The board card carries the issue's open asks (the same views), in that order — a plain stop is not an ask.
		const card = (await testBed.resolve(GetPanelBoard).execute({ token })).issues.find(row => row.issueId === ISSUE)
		expect(card?.openAsks).toEqual([DECISION_ASK.ask, QUESTION_ASK.ask].filter(ask => ask !== undefined))
	})

	it('the outcome round-trips: the daemon reports, the page reads DONE / REFUSED with the code — first report wins', async () => {
		const { token, ana, beto } = await identifiedGroup()
		const paused = await act(token, ana, { kind: PanelActionKind.PAUSE, issueId: ISSUE })
		const resumed = await act(token, ana, { kind: PanelActionKind.RESUME, issueId: ISSUE })
		await pull()

		await pull([
			{ actionId: paused.actionId, status: PanelActionOutcome.DONE },
			{ actionId: resumed.actionId, status: PanelActionOutcome.REFUSED, code: 'ISSUE_NOT_PAUSED' },
		])
		expect(await status(token, ana, paused.actionId)).toEqual({
			actionId: paused.actionId,
			kind: PanelActionKind.PAUSE,
			status: PanelActionStatus.DONE,
		})
		expect(await status(token, ana, resumed.actionId)).toEqual({
			actionId: resumed.actionId,
			kind: PanelActionKind.RESUME,
			status: PanelActionStatus.REFUSED,
			code: 'ISSUE_NOT_PAUSED',
		})

		// A repeated or contradicting report changes nothing; another owner cannot report on it at all.
		await pull([{ actionId: paused.actionId, status: PanelActionOutcome.REFUSED, code: 'X' }])
		await pull([{ actionId: resumed.actionId, status: PanelActionOutcome.DONE }], OTHER_OWNER)
		expect((await status(token, ana, paused.actionId)).status).toBe(PanelActionStatus.DONE)
		expect((await status(token, ana, resumed.actionId)).status).toBe(PanelActionStatus.REFUSED)
		// Only the member who asked reads it.
		expect(await refused(status(token, beto, paused.actionId))).toBe('PANEL_NOT_FOUND')
	})

	it('no outcome: handed out again after a while; never after it went stale, which the page reads as EXPIRED', async () => {
		const { token, ana } = await identifiedGroup()
		const { actionId } = await act(token, ana, { kind: PanelActionKind.PAUSE, issueId: ISSUE })
		expect((await pull()).actions).toHaveLength(1)

		await db()
			.update(panelActions)
			.set({ deliveredAt: new Date(Date.now() - 60 * 1000) })
			.where(eq(panelActions.id, actionId))
		expect((await pull()).actions.map(action => action.actionId)).toEqual([actionId])

		await db()
			.update(panelActions)
			.set({ requestedAt: new Date(Date.now() - 5 * 60 * 1000), deliveredAt: null })
			.where(eq(panelActions.id, actionId))
		expect((await pull()).actions).toEqual([])
		expect((await status(token, ana, actionId)).status).toBe(PanelActionStatus.EXPIRED)
	})

	it('a device is rate-limited to 20 actions a minute', async () => {
		const { token, ana } = await identifiedGroup()
		for (let i = 0; i < 20; i += 1) await act(token, ana, { kind: PanelActionKind.PAUSE, issueId: ISSUE })
		expect(await refused(act(token, ana, { kind: PanelActionKind.PAUSE, issueId: ISSUE }))).toBe('PANEL_ACTION_RATE_LIMITED')
	})

	it('rotating the link kills pending actions', async () => {
		const { token, ana } = await identifiedGroup()
		await act(token, ana, { kind: PanelActionKind.PAUSE, issueId: ISSUE })
		await testBed.resolve(RotatePanelLink).execute({ ownerId: OWNER, threadId: GROUP })
		expect((await pull()).actions).toEqual([])
	})
})
