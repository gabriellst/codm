import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import {
	ArtifactKind,
	BatchItemDestinationKind,
	BatchStatus,
	IssueLifeState,
	IssueStatus,
	IssueTimelineItemKind,
	NudgeSource,
	PublishRunOutcome,
	QuotaState,
	SupervisorVerdict,
	SuspicionReason,
} from '@codm/contracts-typescript/wire/enums'
import type { Batch, PanelHealth } from '@shared/objects'
import type { IssueTimelineItem } from '@shared/schemas'
import { SyncPanel } from './SyncPanel'
import { GetPanelBoard } from './GetPanelBoard'
import { GetPanelIssue } from './GetPanelIssue'
import { RotatePanelLink } from './RotatePanelLink'

const OWNER = '019e4d24-6524-7041-9e1c-8108180cde10'
const OTHER_OWNER = '019e4d24-6524-7041-9e1c-8108180cde11'
const GROUP = '019e4d24-6524-7041-9e1c-8108180cde20'
const OTHER_GROUP = '019e4d24-6524-7041-9e1c-8108180cde21'
const ISSUE = '019e4d24-6524-7041-9e1c-8108180cde30'
const OTHER_ISSUE = '019e4d24-6524-7041-9e1c-8108180cde31'

const TURN: IssueTimelineItem = { kind: IssueTimelineItemKind.TURN_STARTED, id: 'evt-1', at: '2026-11-13T10:00:00.000Z' }

const issue = (overrides: Partial<Parameters<SyncPanel['execute']>[0]['issues'][number]> = {}) => ({
	issueId: ISSUE,
	threadId: GROUP,
	key: 'APP-1',
	title: 'Toggle de dark mode',
	status: IssueStatus.WORKING,
	lifeState: IssueLifeState.RUNNING,
	archived: false,
	timeline: [TURN],
	updatedAt: '2026-11-13T10:00:00.000Z',
	...overrides,
})

/**
 * THE CLOUD PANEL (fase 1, `.specs/2026-11-13-painel-na-nuvem-design.md`) against a real Postgres (PGlite).
 *
 * What must hold: a group gets ONE token that survives re-syncs; the board and the issue read by that
 * token show only that group; another group's issue and an unknown token look the same (404); a late
 * retry never overwrites a newer snapshot; another owner cannot take a group over; rotating kills the
 * old link.
 */
describe('panel — sync, public reads, rotation', () => {
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

	const sync = (ownerId: string, groups: { threadId: string; name: string }[], issues: ReturnType<typeof issue>[]) =>
		testBed.resolve(SyncPanel).execute({ ownerId, groups, issues })
	const tokenOf = async (ownerId: string, threadId: string, name = 'Grupo') =>
		(await sync(ownerId, [{ threadId, name }], [])).groups.find(group => group.threadId === threadId)?.token ?? ''
	const notFound = (promise: Promise<unknown>) =>
		promise.then(
			() => undefined,
			(error: unknown) => error,
		)

	it('a group keeps one token across syncs, and its board and issue read by that token', async () => {
		const first = await sync(OWNER, [{ threadId: GROUP, name: 'Equipe' }], [issue()])
		const token = first.groups[0]?.token ?? ''
		expect(token.length).toBeGreaterThanOrEqual(40)
		expect(await tokenOf(OWNER, GROUP, 'Equipe renomeada')).toBe(token)

		const board = await testBed.resolve(GetPanelBoard).execute({ token })
		expect(board.group.name).toBe('Equipe renomeada')
		expect(board.issues.map(row => row.key)).toEqual(['APP-1'])
		expect(board.daemonLastSeenAt).toBeDefined()

		const detail = await testBed.resolve(GetPanelIssue).execute({ token, issueId: ISSUE })
		expect(detail.timeline.map(item => item.kind)).toEqual([IssueTimelineItemKind.TURN_STARTED])
	})

	it("another group's issue and an unknown token answer the same PANEL_NOT_FOUND", async () => {
		await sync(
			OWNER,
			[
				{ threadId: GROUP, name: 'A' },
				{ threadId: OTHER_GROUP, name: 'B' },
			],
			[issue(), issue({ issueId: OTHER_ISSUE, threadId: OTHER_GROUP })],
		)
		const token = await tokenOf(OWNER, GROUP)

		const crossGroup = await notFound(testBed.resolve(GetPanelIssue).execute({ token, issueId: OTHER_ISSUE }))
		const unknown = await notFound(testBed.resolve(GetPanelBoard).execute({ token: 'x'.repeat(43) }))
		expect(crossGroup).toEqual(expect.objectContaining({ name: 'PANEL_NOT_FOUND' }))
		expect(unknown).toEqual(expect.objectContaining({ name: 'PANEL_NOT_FOUND' }))
		expect((await testBed.resolve(GetPanelBoard).execute({ token })).issues.map(row => row.issueId)).toEqual([ISSUE])
	})

	it('fase 4 (pg 0008) — a WAITING_BUDGET issue and the new timeline kinds are accepted and read back', async () => {
		const timeline: IssueTimelineItem[] = [
			TURN,
			{ kind: IssueTimelineItemKind.BATCH_LINKED, id: 'b-1:2', at: '2026-11-13T10:01:00.000Z', batchCode: 'L-3', n: 2 },
			{
				kind: IssueTimelineItemKind.PUBLISH_RAN,
				id: 'evt-2',
				at: '2026-11-13T10:02:00.000Z',
				outcome: PublishRunOutcome.SUCCEEDED,
				exitCode: 0,
				durationMs: 4200,
			},
		]
		await sync(OWNER, [{ threadId: GROUP, name: 'A' }], [issue({ lifeState: IssueLifeState.WAITING_BUDGET, timeline })])
		const token = await tokenOf(OWNER, GROUP)
		expect((await testBed.resolve(GetPanelBoard).execute({ token })).issues[0]?.lifeState).toBe(IssueLifeState.WAITING_BUDGET)
		const detail = await testBed.resolve(GetPanelIssue).execute({ token, issueId: ISSUE })
		expect(detail.timeline).toEqual(timeline)
	})

	it('fase 5 (pg 0009) — a WAITING_RETRY issue with its retry time, the escalation and the three new moments read back', async () => {
		const timeline: IssueTimelineItem[] = [
			TURN,
			{
				kind: IssueTimelineItemKind.NUDGED,
				id: 'n-1',
				at: '2026-11-13T10:01:00.000Z',
				ordinal: 1,
				source: NudgeSource.RECONCILER,
				outOf: 2,
			},
			{
				kind: IssueTimelineItemKind.RETRY_SCHEDULED,
				id: 'r-1',
				at: '2026-11-13T10:02:00.000Z',
				attempt: 2,
				maxAttempts: 5,
				retryAt: '2026-11-13T10:06:00.000Z',
			},
			{
				kind: IssueTimelineItemKind.SUPERVISOR_REVIEWED,
				id: 's-1',
				at: '2026-11-13T10:40:00.000Z',
				reason: SuspicionReason.STALLED_OPEN,
				verdict: SupervisorVerdict.ESCALATE,
			},
		]
		const retryingAt = '2026-11-13T10:06:00.000Z'
		const escalatedAt = '2026-11-13T10:40:00.000Z'
		await sync(
			OWNER,
			[{ threadId: GROUP, name: 'A' }],
			[issue({ lifeState: IssueLifeState.WAITING_RETRY, retryingAt, escalatedAt, timeline })],
		)
		const token = await tokenOf(OWNER, GROUP)
		const [card] = (await testBed.resolve(GetPanelBoard).execute({ token })).issues
		expect(card).toMatchObject({ lifeState: IssueLifeState.WAITING_RETRY, retryingAt, escalatedAt })
		const detail = await testBed.resolve(GetPanelIssue).execute({ token, issueId: ISSUE })
		expect(detail.issue).toMatchObject({ retryingAt, escalatedAt })
		expect(detail.timeline).toEqual(timeline)
	})

	it('a card counts the artifacts its timeline lists, and has no open asks without a roster', async () => {
		const artifact = (id: string): IssueTimelineItem => ({
			kind: IssueTimelineItemKind.ARTIFACT,
			id,
			at: '2026-11-13T10:01:00.000Z',
			artifactId: `019e4d24-6524-7041-9e1c-8108180cde4${id.slice(-1)}`,
			artifactKind: ArtifactKind.LINK,
			name: 'Prévia',
		})
		const token = await tokenOf(OWNER, GROUP)
		await sync(OWNER, [{ threadId: GROUP, name: 'Grupo' }], [issue({ timeline: [TURN, artifact('art-1'), artifact('art-2')] })])
		const [card] = (await testBed.resolve(GetPanelBoard).execute({ token })).issues
		expect(card?.artifactCount).toBe(2)
		expect(card?.openAsks).toEqual([])
	})

	it('a late retry never overwrites a newer snapshot', async () => {
		await sync(OWNER, [{ threadId: GROUP, name: 'A' }], [issue({ lifeState: IssueLifeState.DONE, updatedAt: '2026-11-13T11:00:00.000Z' })])
		await sync(
			OWNER,
			[{ threadId: GROUP, name: 'A' }],
			[issue({ lifeState: IssueLifeState.RUNNING, updatedAt: '2026-11-13T10:00:00.000Z' })],
		)
		const board = await testBed.resolve(GetPanelBoard).execute({ token: await tokenOf(OWNER, GROUP) })
		expect(board.issues[0]?.lifeState).toBe(IssueLifeState.DONE)
	})

	it('another owner cannot take a group over or publish into it', async () => {
		const token = await tokenOf(OWNER, GROUP, 'Nossa')
		const hijack = await sync(
			OTHER_OWNER,
			[{ threadId: GROUP, name: 'Deles' }],
			[issue({ key: 'X-1', updatedAt: '2026-11-14T00:00:00.000Z' })],
		)
		expect(hijack.groups).toEqual([])

		const board = await testBed.resolve(GetPanelBoard).execute({ token })
		expect(board.group.name).toBe('Nossa')
		expect(board.issues).toEqual([])
	})

	it('rotating the link kills the old one', async () => {
		const old = await tokenOf(OWNER, GROUP)
		const { token } = await testBed.resolve(RotatePanelLink).execute({ ownerId: OWNER, threadId: GROUP })
		expect(token).not.toBe(old)
		expect(await notFound(testBed.resolve(GetPanelBoard).execute({ token: old }))).toEqual(
			expect.objectContaining({ name: 'PANEL_NOT_FOUND' }),
		)
		expect((await testBed.resolve(GetPanelBoard).execute({ token })).group.name).toBe('Grupo')
		expect(await notFound(testBed.resolve(RotatePanelLink).execute({ ownerId: OTHER_OWNER, threadId: GROUP }))).toEqual(
			expect.objectContaining({ name: 'PANEL_NOT_FOUND' }),
		)
	})

	it('fase 4 (pg 0008) — the health badge and the group’s batches ride the sync; another group’s batch stays out', async () => {
		const health: PanelHealth = {
			state: QuotaState.NEAR,
			windowPercent: 42,
			weekPercent: 71,
			slots: { inUse: 3, effective: 4 },
			queuePending: 2,
			daemonSeenAt: '2026-11-19T10:00:00.000Z',
		}
		const batch = (code: string): Batch => ({
			code,
			status: BatchStatus.RECORDED,
			sourceEntryId: '019e4d24-6524-7041-9e1c-8108180cde40',
			items: [{ n: 1, excerpt: 'pedido 1', destination: { kind: BatchItemDestinationKind.DECLINED, reason: 'fora do escopo' } }],
		})
		await testBed.resolve(SyncPanel).execute({
			ownerId: OWNER,
			groups: [
				{ threadId: GROUP, name: 'A' },
				{ threadId: OTHER_GROUP, name: 'B' },
			],
			issues: [],
			batches: [
				{ threadId: GROUP, batch: batch('L-31') },
				{ threadId: OTHER_GROUP, batch: batch('L-7') },
			],
			health,
		})
		const token = await tokenOf(OWNER, GROUP)
		const board = await testBed.resolve(GetPanelBoard).execute({ token })
		expect(board.health).toEqual(health)
		expect(board.batches).toEqual([batch('L-31')])

		// A daemon that sends no health (older, or before its first loop) keeps the last one.
		await sync(OWNER, [{ threadId: GROUP, name: 'A' }], [])
		expect((await testBed.resolve(GetPanelBoard).execute({ token })).health).toEqual(health)
	})
})
