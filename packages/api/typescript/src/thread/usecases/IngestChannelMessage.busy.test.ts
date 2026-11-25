import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import {
	Language,
	MailboxClaimClass,
	MailboxItemKind,
	MailboxTargetKind,
	PermissionPosture,
	TranscriptKind,
} from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenIssue, givenThread, GIVEN_MENTION_TAG } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { IngestChannelMessage } from './IngestChannelMessage'

/**
 * "ESTOU RESPONDENDO OUTRA" (voz do grupo, 25/11) — a message that lands while a turn is still answering another for
 * the same target stays in the queue, and the person is told so, quoting their message: once per running turn.
 * A task in a step says it reads the message when the step ends; an "agora" cuts the step and says nothing.
 *
 * Falsifier: drop `noticeBusy` and no notice is ever recorded; drop the derived id and the second message of the same
 * turn gets a second notice.
 */
describe('IngestChannelMessage — a message while another is being answered', () => {
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

	let threadId = ''
	const scene = async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		thread.configureLanguage(Language.PT_BR)
		await testBed.resolve(ThreadRepository).save(thread)
		threadId = thread.id.value
	}
	const say = (text: string) =>
		testBed.resolve(IngestChannelMessage).execute({
			threadId,
			senderExternalId: 'member-a',
			text: `${GIVEN_MENTION_TAG} ${text}`,
			receivedAt: new Date(),
			platformMessageId: `platform-${Math.random()}`,
		})
	/** A turn running for the target: an item enqueued and claimed, as the dispatcher would. */
	const running = async (targetKind: MailboxTargetKind, targetId: string) => {
		const mailbox = testBed.resolve(MailboxRepository)
		await mailbox.enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind,
			targetId,
			kind: targetKind === MailboxTargetKind.THREAD ? MailboxItemKind.OPERATOR_MESSAGE : MailboxItemKind.WORK,
			claimClass: targetKind === MailboxTargetKind.THREAD ? MailboxClaimClass.OPERATOR : MailboxClaimClass.WORK,
			posture: PermissionPosture.AUTO,
			payload: { kind: MailboxItemKind.OPERATOR_MESSAGE, entryId: crypto.randomUUID(), speaker: 'x', text: 'x' },
			dedupKey: `running-${targetId}`,
		})
		const claimed = await mailbox.claimNext('busy-test', 60_000)
		return claimed
	}
	const notices = async () =>
		(await testBed.resolve(ThreadRepository).listEntries(threadId)).filter(
			e => e.kind === TranscriptKind.SYSTEM && (e.text.startsWith('Ainda estou') || e.text.startsWith('Recebi')),
		)

	it('the orchestrator answering another message → ONE notice per turn, quoting the message; none once it is done', async () => {
		await scene()
		const turn = await running(MailboxTargetKind.THREAD, threadId)
		expect(turn?.targetId).toBe(threadId)

		const first = await say('e o rodapé?')
		await say('e o cabeçalho?')

		const said = await notices()
		expect(said.map(e => e.text)).toEqual([
			'Ainda estou respondendo a mensagem anterior — respondo uma de cada vez. A sua ficou na fila e já vem.',
		])
		expect(said[0]?.quotedEntryId).toBe(first.entryId)
		// The messages are still queued for their own turns.
		expect(await testBed.resolve(MailboxRepository).hasPending(MailboxTargetKind.THREAD, threadId)).toBe(true)

		if (turn) await testBed.resolve(MailboxRepository).complete([turn.id])
		await testBed.reset()
		await scene()
		await say('mais uma')
		expect(await notices()).toEqual([])
	})

	// The first message may still be in the triage (no turn yet) when the second lands — it waits behind it all the same.
	it('two messages in a row with no turn running yet → the second is told it waits; the first is not', async () => {
		await scene()

		const first = await say('muda a cor do botão')
		const second = await say('e o texto também')

		const said = await notices()
		expect(said).toHaveLength(1)
		expect(said[0]?.quotedEntryId).toBe(second.entryId)
		expect(said[0]?.quotedEntryId).not.toBe(first.entryId)
	})

	it('a task in the middle of a step → "Recebi — <chave> …"; an "agora" cuts the step and says nothing', async () => {
		await scene()
		const issue = await givenIssue(testBed, { threadId, key: 'video-na-landing-19' })
		expect((await running(MailboxTargetKind.ISSUE, issue.id.value))?.targetId).toBe(issue.id.value)

		await say('video-na-landing-19 agora usa o azul')
		expect(await notices()).toEqual([])

		await say('video-na-landing-19 e o rodapé também')
		expect((await notices()).map(e => e.text)).toEqual([
			'Recebi — video-na-landing-19 está no meio de um passo e lê isso assim que terminar.',
		])
	})
})
