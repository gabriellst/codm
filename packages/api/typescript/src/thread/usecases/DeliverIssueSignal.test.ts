import { uuidv7 } from 'uuidv7'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { GroupOutputMode, IssueSignalLevel, Language, OutputRouting } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenArtifact, givenIssue, givenThread } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { PanelPublisher } from '@issue/services/PanelPublisher'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { DeliverIssueSignal } from './DeliverIssueSignal'
import { derivedId } from '../utils/derivedId'
import { ARTIFACTS_SHOWN_MAX } from '../utils/OutputPolicy'

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
	const previews = () => testBed.probe().count('scheduledCommands', { name: 'deliver_issue_preview' })

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
	/**
	 * THE PRINTS COME BACK (voz do grupo, 25/11): every artifact a preview, a step or a closing cites goes to the group,
	 * each as its own print with its own entry — even when the step's text stays on the panel — up to
	 * `ARTIFACTS_SHOWN_MAX`. Falsifier: drop the prints from `DeliverIssueSignal` and only the main one goes.
	 */
	describe('the prints a signal cites', () => {
		const prints = async (threadId: string) =>
			(await testBed.resolve(ThreadRepository).listEntries(threadId)).filter(e => e.artifactId && e.routing === OutputRouting.GROUP)

		it('a preview shows its main print with the text and each other print on its own, named; a redelivery adds none', async () => {
			const { thread, issue } = await setUp(GroupOutputMode.DECISIONS_AND_LIVE)
			const main = await givenArtifact(testBed, thread.id.value, { issueId: issue.id.value, name: 'principal.png' })
			const pc = await givenArtifact(testBed, thread.id.value, { issueId: issue.id.value, name: 'Prévia no PC' })
			const phone = await givenArtifact(testBed, thread.id.value, { issueId: issue.id.value, name: 'Prévia no celular' })
			const signalId = uuidv7()
			const say = () =>
				testBed.resolve(DeliverIssueSignal).execute({
					signalId,
					threadId: thread.id.value,
					issueId: issue.id.value,
					level: IssueSignalLevel.FEEDBACK,
					text: 'prévia pronta',
					mainArtifactId: main.id.value,
					artifactIds: [main.id.value, pc.id.value, phone.id.value],
				})

			await say()
			await say()

			const shown = await prints(thread.id.value)
			expect(shown.map(e => e.text)).toEqual(['👀 APP-12 — prévia pronta', '🖼️ APP-12 — Prévia no PC', '🖼️ APP-12 — Prévia no celular'])
			expect(shown.every(e => e.issueId === issue.id.value)).toBe(true)
			expect(shown[1]?.entryId).toBe(derivedId(signalId, pc.id.value))
			expect(await previews()).toBe(3)
		})

		it("a step's prints go to the group in the default mode, its text stays on the panel", async () => {
			const { thread, issue } = await setUp(GroupOutputMode.DECISIONS_AND_LIVE)
			const shot = await givenArtifact(testBed, thread.id.value, { issueId: issue.id.value, name: 'Teste no navegador' })

			const out = await testBed.resolve(DeliverIssueSignal).execute({
				signalId: uuidv7(),
				threadId: thread.id.value,
				issueId: issue.id.value,
				level: IssueSignalLevel.PROGRESS,
				text: 'conferi no navegador',
				artifactIds: [shot.id.value],
			})

			expect(out.routing).toBe(OutputRouting.PANEL)
			expect((await prints(thread.id.value)).map(e => e.text)).toEqual(['🖼️ APP-12 — Teste no navegador'])
			expect(await deliveries()).toBe(0)
			expect(await previews()).toBe(1)
		})

		it("at most ARTIFACTS_SHOWN_MAX prints; DECISIONS_ONLY shows none; another issue's artifact is never shown", async () => {
			const { thread, issue } = await setUp(GroupOutputMode.DECISIONS_AND_LIVE)
			const other = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, key: 'APP-13' })
			const many = []
			for (let i = 0; i < ARTIFACTS_SHOWN_MAX + 2; i++)
				many.push(await givenArtifact(testBed, thread.id.value, { issueId: issue.id.value, name: `print ${i}` }))
			const foreign = await givenArtifact(testBed, thread.id.value, { issueId: other.id.value, name: 'alheio' })
			await testBed.resolve(DeliverIssueSignal).execute({
				signalId: uuidv7(),
				threadId: thread.id.value,
				issueId: issue.id.value,
				level: IssueSignalLevel.PROGRESS,
				text: 'vários prints',
				artifactIds: [foreign.id.value, ...many.map(a => a.id.value)],
			})
			const shown = await prints(thread.id.value)
			expect(shown.length).toBeGreaterThan(0)
			expect(shown.length).toBeLessThanOrEqual(ARTIFACTS_SHOWN_MAX)
			expect(shown.some(e => e.text.includes('alheio'))).toBe(false)

			const quiet = await setUp(GroupOutputMode.DECISIONS_ONLY)
			const shot = await givenArtifact(testBed, quiet.thread.id.value, { issueId: quiet.issue.id.value })
			await testBed.resolve(DeliverIssueSignal).execute({
				signalId: uuidv7(),
				threadId: quiet.thread.id.value,
				issueId: quiet.issue.id.value,
				level: IssueSignalLevel.PROGRESS,
				text: 'quieto',
				artifactIds: [shot.id.value],
			})
			expect(await prints(quiet.thread.id.value)).toEqual([])
		})
	})
})
