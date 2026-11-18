import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DomainEventRepository } from '@codm/core-typescript'
import { IssueStatus } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenArtifact, givenIssue, givenThread } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { DeclareIssueComplete } from './DeclareIssueComplete'
import { AgentRunCompletedEvent } from '../events/AgentRunCompletedEvent'

/**
 * The final artifact of a declared completion (fase 3, item 5) — the closing line carries it to the group.
 * Checked when the issue declares it, like `RequestFeedback`'s preview: a refusal reaches the session, and
 * nothing is written.
 */
describe('DeclareIssueComplete — the final artifact', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let scratch: string

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		scratch = mkdtempSync(join(tmpdir(), 'declare-complete-'))
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
		rmSync(scratch, { recursive: true, force: true })
	})

	async function setUp() {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, key: 'APP-12' })
		const path = join(scratch, 'final.png')
		writeFileSync(path, 'png')
		return { threadId: thread.id.value, issueId: issue.id.value, path }
	}

	it('rides the completion fact, with the summary unchanged', async () => {
		const { threadId, issueId, path } = await setUp()
		const final = await givenArtifact(testBed, threadId, { issueId, ref: path })

		await testBed.resolve(DeclareIssueComplete).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId,
			issueId,
			status: IssueStatus.COMPLETED,
			summary: 'Página no ar.',
			key: 'APP-12',
			finalArtifactId: final.id.value,
		})

		const [fact] = await testBed.resolve(DomainEventRepository).findByType(AgentRunCompletedEvent)
		expect(fact?.payload).toMatchObject({ summary: 'Página no ar.', finalArtifactId: final.id.value })
	})

	it('an artifact another issue recorded is refused, and no completion is written', async () => {
		const { threadId, issueId, path } = await setUp()
		const other = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId, key: 'APP-13' })
		const foreign = await givenArtifact(testBed, threadId, { issueId: other.id.value, ref: path })

		await expect(
			testBed.resolve(DeclareIssueComplete).execute({
				ownerId: MOCK_CLOUD_OWNER_ID,
				threadId,
				issueId,
				status: IssueStatus.COMPLETED,
				summary: '',
				key: 'APP-12',
				finalArtifactId: foreign.id.value,
			}),
		).rejects.toMatchObject({ name: 'ARTIFACT_NOT_FOUND' })
		expect(await testBed.resolve(DomainEventRepository).findByType(AgentRunCompletedEvent)).toHaveLength(0)
	})
})
