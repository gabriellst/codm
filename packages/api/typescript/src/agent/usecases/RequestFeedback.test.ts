import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TestBed, givenArtifact, givenIssue, givenThread } from '@test/support'
import { DomainEventRepository } from '@codm/core-typescript'
import { ArtifactKind, IssueSignalLevel } from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { RequestFeedback } from './RequestFeedback'
import { ReportProgress } from './ReportProgress'
import { AgentRunStopRaisedEvent } from '../events/AgentRunStopRaisedEvent'
import { IssueSpokeEvent } from '../events/IssueSpokeEvent'

/**
 * `RequestFeedback` / `ReportProgress` (fase 3, item 1) — what an issue SAYS that is not a stop. The
 * feedback's refusals are synchronous (the checks `SendArtifact` makes), and neither holds the issue.
 */
describe('RequestFeedback / ReportProgress', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let scratch: string

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		scratch = mkdtempSync(join(tmpdir(), 'request-feedback-'))
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
		rmSync(scratch, { recursive: true, force: true })
	})

	async function givenIssueOnThread() {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })
		return { threadId: thread.id.value, issueId: issue.id.value }
	}

	function screenshot(): string {
		const path = join(scratch, `${crypto.randomUUID()}.png`)
		writeFileSync(path, 'png')
		return path
	}

	const spoken = () => testBed.resolve(DomainEventRepository).findByType(IssueSpokeEvent)

	it('saves a FEEDBACK fact citing the main artifact — and raises NO stop (it does not hold the issue)', async () => {
		const { threadId, issueId } = await givenIssueOnThread()
		const main = await givenArtifact(testBed, threadId, { issueId, ref: screenshot() })
		const other = await givenArtifact(testBed, threadId, { issueId, kind: ArtifactKind.LINK, ref: 'https://preview.example.test' })

		await testBed.resolve(RequestFeedback).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId,
			issueId,
			text: 'Prévia da página nova',
			mainArtifactId: main.id.value,
			artifactIds: [other.id.value],
		})

		const [fact] = await spoken()
		expect(fact?.payload).toEqual({
			issueId,
			threadId,
			level: IssueSignalLevel.FEEDBACK,
			text: 'Prévia da página nova',
			// The main one is cited too, even when the caller left it out.
			artifactIds: [main.id.value, other.id.value],
			mainArtifactId: main.id.value,
		})
		expect(await testBed.resolve(DomainEventRepository).findByType(AgentRunStopRaisedEvent)).toHaveLength(0)
	})

	it("FALSEADOR — another issue's artifact is not this feedback's to cite: ARTIFACT_NOT_FOUND, nothing saved", async () => {
		const { threadId, issueId } = await givenIssueOnThread()
		const otherIssue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId, key: 'APP-99' })
		const foreign = await givenArtifact(testBed, threadId, { issueId: otherIssue.id.value, ref: screenshot() })

		const failure = await testBed
			.resolve(RequestFeedback)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId, issueId, text: 'Prévia', mainArtifactId: foreign.id.value, artifactIds: [] })
			.then(
				() => undefined,
				(error: unknown) => error,
			)

		expect(failure).toEqual(expect.objectContaining({ name: 'ARTIFACT_NOT_FOUND' }))
		expect(await spoken()).toHaveLength(0)
	})

	it('FALSEADOR — a main preview whose file is gone is refused on the call (ARTIFACT_FILE_MISSING), not by a failed delivery', async () => {
		const { threadId, issueId } = await givenIssueOnThread()
		const gone = await givenArtifact(testBed, threadId, { issueId, ref: join(scratch, 'never-written.png') })

		const failure = await testBed
			.resolve(RequestFeedback)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId, issueId, text: 'Prévia', mainArtifactId: gone.id.value, artifactIds: [] })
			.then(
				() => undefined,
				(error: unknown) => error,
			)

		expect(failure).toEqual(expect.objectContaining({ name: 'ARTIFACT_FILE_MISSING' }))
		expect(await spoken()).toHaveLength(0)
	})

	it('ReportProgress saves a PROGRESS fact with the text and no artifact', async () => {
		const { threadId, issueId } = await givenIssueOnThread()

		await testBed.resolve(ReportProgress).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId, issueId, text: 'Rodei os testes.' })

		const [fact] = await spoken()
		expect(fact?.payload).toEqual({ issueId, threadId, level: IssueSignalLevel.PROGRESS, text: 'Rodei os testes.', artifactIds: [] })
	})
	// Voz do grupo (25/11): a step may cite its prints — this issue's only — and they ride the fact to the group.
	it("PROGRESS carries the prints it cites, and refuses an artifact that is not this issue's", async () => {
		const { threadId, issueId } = await givenIssueOnThread()
		const other = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId, key: 'outra-tarefa-2' })
		const mine = await givenArtifact(testBed, threadId, { issueId, ref: screenshot() })
		const theirs = await givenArtifact(testBed, threadId, { issueId: other.id.value, ref: screenshot() })
		const report = (artifactIds: string[]) =>
			testBed
				.resolve(ReportProgress)
				.execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId, issueId, text: 'conferi no navegador', artifactIds })

		await expect(report([theirs.id.value])).rejects.toMatchObject({ name: 'ARTIFACT_NOT_FOUND' })
		await report([mine.id.value, mine.id.value])

		const facts = (await spoken()).filter(fact => fact.payload.level === IssueSignalLevel.PROGRESS)
		expect(facts.map(fact => fact.payload.artifactIds)).toEqual([[mine.id.value]])
	})
})
