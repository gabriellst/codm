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
 * Checked when the issue declares it, like `RequestFeedback`'s preview — but a refusal never refuses the
 * completion: the closing goes without the artifact, and the refusal is recorded on the fact.
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

	// It used to refuse the whole declaration (and write nothing): the issue stayed WORKING with nothing in
	// flight — a finished task stuck until the stall sweep, for a print that could not travel. The completion
	// is what matters; the artifact is dropped and the refusal recorded on the fact.
	it('an artifact another issue recorded does not stop the completion — it closes without it, the refusal recorded', async () => {
		const { threadId, issueId, path } = await setUp()
		const other = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId, key: 'APP-13' })
		const foreign = await givenArtifact(testBed, threadId, { issueId: other.id.value, ref: path })

		const out = await testBed.resolve(DeclareIssueComplete).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId,
			issueId,
			status: IssueStatus.COMPLETED,
			summary: 'Página no ar.',
			key: 'APP-12',
			finalArtifactId: foreign.id.value,
		})

		expect(out).toEqual({ issueId, status: IssueStatus.COMPLETED })
		const facts = await testBed.resolve(DomainEventRepository).findByType(AgentRunCompletedEvent)
		expect(facts).toHaveLength(1)
		expect(facts[0]?.payload.finalArtifactId).toBeUndefined()
		expect(facts[0]?.payload).toMatchObject({ summary: 'Página no ar.', finalArtifactRefusal: 'ARTIFACT_NOT_FOUND' })
	})

	it('an artifact whose file is gone does not stop the completion either', async () => {
		const { threadId, issueId } = await setUp()
		const gone = await givenArtifact(testBed, threadId, { issueId, ref: join(scratch, 'nao-existe.png') })

		await testBed.resolve(DeclareIssueComplete).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId,
			issueId,
			status: IssueStatus.COMPLETED,
			summary: '',
			key: 'APP-12',
			finalArtifactId: gone.id.value,
		})

		const [fact] = await testBed.resolve(DomainEventRepository).findByType(AgentRunCompletedEvent)
		expect(fact?.payload.finalArtifactId).toBeUndefined()
		expect(fact?.payload.finalArtifactRefusal).toBe('ARTIFACT_FILE_MISSING')
	})
})
