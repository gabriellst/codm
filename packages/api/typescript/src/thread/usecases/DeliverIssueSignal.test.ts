import { uuidv7 } from 'uuidv7'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { GroupOutputMode, IssueSignalLevel, Language, OutputRouting } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenIssue, givenThread } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { PanelPublisher } from '@issue/services/PanelPublisher'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { DeliverIssueSignal } from './DeliverIssueSignal'

describe('DeliverIssueSignal — what an issue says goes where the group mode sends it', () => {
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

	const deliveries = () => testBed.probe().count('scheduledCommands', { name: 'deliver_channel_message' })

	const setUp = async (mode: GroupOutputMode) => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		thread.configureOutputMode(mode)
		thread.configureLanguage(Language.PT_BR)
		await testBed.resolve(ThreadRepository).save(thread)
		const issue = await givenIssue(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			key: 'APP-12',
			title: 'Página nova',
		})
		return { thread, issue }
	}

	it('PROGRESS in the default mode is recorded for the panel and never sent', async () => {
		const { thread, issue } = await setUp(GroupOutputMode.DECISIONS_AND_LIVE)

		const out = await testBed.resolve(DeliverIssueSignal).execute({
			signalId: uuidv7(),
			threadId: thread.id.value,
			issueId: issue.id.value,
			level: IssueSignalLevel.PROGRESS,
			text: 'montei o layout',
		})

		expect(out.routing).toBe(OutputRouting.PANEL)
		const entry = await testBed.resolve(ThreadRepository).findEntry(out.entryId)
		expect(entry).toMatchObject({ issueId: issue.id.value, level: IssueSignalLevel.PROGRESS, routing: OutputRouting.PANEL })
		expect(await deliveries()).toBe(0)
	})

	it('PROGRESS in EVERYTHING goes to the group, with the issue key and its panel link', async () => {
		const { thread, issue } = await setUp(GroupOutputMode.EVERYTHING)
		// The group has a panel link once the cloud handed a token (here: a rotation on the mock).
		await testBed.resolve(PanelPublisher).rotate(thread.id.value)

		const out = await testBed.resolve(DeliverIssueSignal).execute({
			signalId: uuidv7(),
			threadId: thread.id.value,
			issueId: issue.id.value,
			level: IssueSignalLevel.PROGRESS,
			text: 'montei o layout',
		})

		expect(out.routing).toBe(OutputRouting.GROUP)
		const entry = await testBed.resolve(ThreadRepository).findEntry(out.entryId)
		// Voz do grupo (25/11): the key and the text — no panel link, even with one to give.
		expect(entry?.text).toBe('APP-12 — montei o layout')
		expect(await deliveries()).toBe(1)
	})

	it('FEEDBACK in DECISIONS_ONLY stays on the panel', async () => {
		const { thread, issue } = await setUp(GroupOutputMode.DECISIONS_ONLY)

		const out = await testBed.resolve(DeliverIssueSignal).execute({
			signalId: uuidv7(),
			threadId: thread.id.value,
			issueId: issue.id.value,
			level: IssueSignalLevel.FEEDBACK,
			text: 'prévia pronta',
		})

		expect(out.routing).toBe(OutputRouting.PANEL)
		expect(await deliveries()).toBe(0)
	})
})
