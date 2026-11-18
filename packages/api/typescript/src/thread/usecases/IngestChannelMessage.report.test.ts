import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { DomainEventRepository } from '@codm/core-typescript'
import {
	AskAnswerKind,
	IssueStatus,
	Language,
	MailboxItemKind,
	MailboxTargetKind,
	PermissionPosture,
	StopKind,
	TranscriptKind,
} from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenIssue, givenStop, givenThread, GIVEN_MENTION_TAG } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import { PanelPublisher } from '@issue/services/PanelPublisher'
import { IssueBoardReader } from '@issue/services/IssueBoardReader'
import type { Participant } from '../entities/Thread'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { BulletinSentEvent } from '../events/BulletinSentEvent'
import { BULLETIN_SECTION_MAX } from '../services/BoardBulletin'
import { IngestChannelMessage } from './IngestChannelMessage'

/**
 * RELATÓRIO COMO CONSULTA (fase 3, item 4) — `relatorio` (the whole message) is answered with the group's
 * bulletin by rule: NO orchestrator turn (no THREAD item), sections from the board, the panel link only with a
 * cloud login, and `thread.bulletin_sent` to count it. A sentence that mentions a report is not the command.
 *
 * Falsifier: drop the command dispatch from `IngestChannelMessage` and every test here finds a THREAD item
 * queued and no bulletin.
 */
describe('IngestChannelMessage — "relatorio" answered by the board, no model turn', () => {
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

	const MEMBER = 'member-a'
	const MUTED = 'member-muted'
	const roster: Participant[] = [
		{ participantId: 'operator', name: 'Operator', source: 'Operator on this machine', canInvoke: true, canElevate: true },
		{ participantId: MEMBER, name: 'Member A', source: 'Group member', canInvoke: true, canElevate: false },
		{ participantId: MUTED, name: 'Member M', source: 'Group member', canInvoke: false, canElevate: false },
	]

	let threadId = ''
	const scene = async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, participants: roster })
		thread.configureLanguage(Language.PT_BR)
		await testBed.resolve(ThreadRepository).save(thread)
		threadId = thread.id.value
		return thread
	}
	/** Addressed to the agent (the group has the mention gate on), unless `unaddressed`. */
	const say = (text: string, from = MEMBER, unaddressed = false) =>
		testBed.resolve(IngestChannelMessage).execute({
			threadId,
			senderExternalId: from,
			text: unaddressed ? text : `${GIVEN_MENTION_TAG} ${text}`,
			receivedAt: new Date(),
			platformMessageId: `platform-${Math.random()}`,
		})
	const threadTurn = () => testBed.resolve(MailboxRepository).hasPending(MailboxTargetKind.THREAD, threadId)
	const bulletins = async () =>
		(await testBed.resolve(ThreadRepository).listEntries(threadId)).filter(e => e.kind === TranscriptKind.SYSTEM).map(e => e.text)
	const deliveries = () => testBed.probe().count('scheduledCommands', { name: 'deliver_channel_message' })

	it('answers with the board — waiting (with the code and who decides), stopped, doing, done — and starts no turn', async () => {
		await scene()
		const waiting = await givenIssue(testBed, { threadId, key: 'APP-12', title: 'Página nova', status: IssueStatus.NEEDS_INPUT })
		await givenStop(testBed, {
			threadId,
			issueId: waiting.id.value,
			ask: {
				question: 'Publico?',
				options: [
					{ id: 'yes', label: 'Sim' },
					{ id: 'no', label: 'Não' },
				],
				effects: [],
				addresseeId: MEMBER,
				requested: StopKind.DECISION_REQUESTED,
			},
		})
		await givenIssue(testBed, { threadId, key: 'APP-13', title: 'Banner' })
		await givenIssue(testBed, { threadId, key: 'APP-14', title: 'Rodapé', paused: true })
		const doing = await givenIssue(testBed, { threadId, key: 'APP-15', title: 'Checkout' })
		await testBed.resolve(MailboxRepository).enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: doing.id.value,
			kind: MailboxItemKind.WORK,
			posture: PermissionPosture.AUTO,
			payload: { threadId, key: 'APP-15', title: 'Checkout' },
			dedupKey: 'work:app-15',
		})
		await givenIssue(testBed, { threadId, key: 'APP-16', title: 'Logo', status: IssueStatus.COMPLETED })
		await givenIssue(testBed, { threadId, key: 'APP-9', title: 'Antiga', completedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) })

		const out = await say('Relatório?')

		expect(out.invocable).toBe(false)
		expect(await threadTurn()).toBe(false)
		const [text] = await bulletins()
		expect(text).toContain('📋 Relatório')
		expect(text).toContain('*Esperando decisão* (1)')
		expect(text).toContain('• APP-12 · Página nova — APP-12 · D1 · decide: Member A')
		expect(text).toContain('*Paradas* (2)')
		expect(text).toContain('• APP-13 · Banner — parou sem dizer o que falta')
		expect(text).toContain('• APP-14 · Rodapé — pausada')
		expect(text).toContain('*Fazendo* (1)')
		expect(text).toContain('• APP-15 · Checkout — na fila')
		expect(text).toContain('*Concluídas nas últimas 24 h* (1)')
		expect(text).toContain('• APP-16 · Logo')
		expect(text).not.toContain('APP-9')
		// The order of the sections is the declared one.
		expect(text?.indexOf('Esperando decisão')).toBeLessThan(text?.indexOf('Paradas') ?? 0)
		expect(text?.indexOf('Fazendo')).toBeLessThan(text?.indexOf('Concluídas') ?? 0)
		expect(await deliveries()).toBe(1)
		const [fact] = await testBed.resolve(DomainEventRepository).findByType(BulletinSentEvent)
		expect(fact?.payload).toMatchObject({ threadId, entryId: out.entryId })
	})

	it('no cloud login → no link; with one → the group panel link closes the bulletin', async () => {
		await scene()
		await say('relatorio')
		expect((await bulletins())[0]).not.toContain('/panel/')

		await testBed.resolve(PanelPublisher).rotate(threadId)
		await say('relatorio')
		expect((await bulletins())[1]).toContain(`/panel/g/rotated-${threadId}`)
	})

	it('an empty board says so', async () => {
		await scene()
		await say('boletim')
		expect((await bulletins())[0]).toContain('Nada em andamento.')
	})

	it(`a section lists at most ${BULLETIN_SECTION_MAX} — the rest is counted`, async () => {
		await scene()
		for (let i = 1; i <= BULLETIN_SECTION_MAX + 2; i += 1) await givenIssue(testBed, { threadId, key: `APP-${i}`, title: `T${i}` })

		await say('relatorio')

		const text = (await bulletins())[0] ?? ''
		expect(text).toContain(`*Paradas* (${BULLETIN_SECTION_MAX + 2})`)
		expect(text).toContain('+2')
		expect(text.match(/^• /gmu)).toHaveLength(BULLETIN_SECTION_MAX)
	})

	it('a sentence that mentions a report is not the command — it goes to the orchestrator', async () => {
		await scene()

		const out = await say('relatório do que fizeram ontem')

		expect(out.invocable).toBe(true)
		expect(await threadTurn()).toBe(true)
		expect(await bulletins()).toHaveLength(0)
		expect(await testBed.resolve(DomainEventRepository).findByType(BulletinSentEvent)).toHaveLength(0)
	})

	it('someone who may not command the agent gets no bulletin', async () => {
		await scene()

		await say('relatorio', MUTED)

		expect(await bulletins()).toHaveLength(0)
		expect(await deliveries()).toBe(0)
	})

	it('an unaddressed "relatorio" in a gated group is conversation, not the command', async () => {
		await scene()

		await say('relatorio', MEMBER, true)

		expect(await bulletins()).toHaveLength(0)
	})

	/**
	 * Any open stop reads `WAITING_PERSON` as a life state, so the section comes from the open stops first: a
	 * task the sweep raised as STALLED is a stop (Paradas), not a decision; an open question on a queued task is
	 * still waiting for the group, with its code.
	 */
	it('the section comes from the open stops: STALLED is "Paradas", an ask on queued work keeps its code', async () => {
		await scene()
		const stalled = await givenIssue(testBed, { threadId, key: 'APP-20', title: 'Parada' })
		await givenStop(testBed, { threadId, issueId: stalled.id.value, kind: StopKind.STALLED })
		const queued = await givenIssue(testBed, { threadId, key: 'APP-21', title: 'Na fila' })
		await givenStop(testBed, {
			threadId,
			issueId: queued.id.value,
			ask: {
				question: 'Tema claro?',
				options: [
					{ id: 'yes', label: 'Sim' },
					{ id: 'no', label: 'Não' },
				],
				default: { kind: AskAnswerKind.OPTION, optionId: 'yes' },
				effects: [],
				requested: StopKind.QUESTION_ASKED,
			},
		})
		await testBed.resolve(MailboxRepository).enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: queued.id.value,
			kind: MailboxItemKind.WORK,
			posture: PermissionPosture.AUTO,
			payload: { threadId, key: 'APP-21', title: 'Na fila' },
			dedupKey: 'work:app-21',
		})

		await say('relatorio')

		const text = (await bulletins())[0] ?? ''
		expect(text).toContain('*Esperando decisão* (1)')
		expect(text).toContain('• APP-21 · Na fila — APP-21 · D1 · na fila')
		expect(text).toContain('*Paradas* (1)')
		expect(text).toContain('• APP-20 · Parada — parou sem dizer o que falta')
	})

	/** A board that cannot be read never loses the message: it is not a command then, and the orchestrator answers. */
	it('a bulletin that cannot be composed leaves the message on the usual path', async () => {
		await scene()
		testBed.override(
			IssueBoardReader,
			new (class extends IssueBoardReader {
				async boardOf(): Promise<never> {
					throw new Error('board unavailable')
				}
			})(),
		)

		const out = await say('relatorio')

		expect(out.invocable).toBe(true)
		expect(await threadTurn()).toBe(true)
		expect(await bulletins()).toHaveLength(0)
	})
})
