import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenIssue, givenWorkspace } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { TerminalLineRepository } from '@issue/repositories/TerminalLineRepository'
import { SetWorkspacePublishCommand } from '@workspace/usecases/SetWorkspacePublishCommand'
import { GetPublishRunOutput } from './GetPublishRunOutput'
import { GetWorkspacePublishCommand } from './GetWorkspacePublishCommand'

const STRANGER = '00000000-0000-4000-8000-0000000000aa'

/**
 * THE CONSOLE'S PUBLISH READS (fase 4, item 6c) — the declared command for the form, and what ONE run printed, by the
 * run's timeline item. Both console-only (no `mcpScopes`, pinned in `agent/mcp/exposure.test.ts`).
 *
 * Falsifier: read the output by issue alone and the other run's line shows; drop the owner predicate and a stranger
 * reads the command.
 */
describe('GetWorkspacePublishCommand / GetPublishRunOutput', () => {
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

	it('the form reads the declared command, null without one, and a stranger finds no workspace', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const read = (ownerId = MOCK_CLOUD_OWNER_ID) =>
			testBed.resolve(GetWorkspacePublishCommand).execute({ ownerId, workspaceId: workspace.id.value })
		expect(await read()).toEqual({ command: null })
		await testBed
			.resolve(SetWorkspacePublishCommand)
			.execute({ ownerId: MOCK_CLOUD_OWNER_ID, workspaceId: workspace.id.value, command: { argv: ['make', 'publish'] } })
		expect(await read()).toEqual({ command: { argv: ['make', 'publish'] } })
		await expect(read(STRANGER)).rejects.toThrow(expect.objectContaining({ name: 'WORKSPACE_NOT_FOUND' }))
	})

	it('a run’s output is its own lines, by the timeline item — never another run’s, never the plain log', async () => {
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const lines = testBed.resolve(TerminalLineRepository)
		const first = crypto.randomUUID()
		const second = crypto.randomUUID()
		await lines.append(issue.id.value, MOCK_CLOUD_OWNER_ID, 'steer: something')
		await lines.appendOfTimelineItem(issue.id.value, MOCK_CLOUD_OWNER_ID, first, ['one', 'two'])
		await lines.appendOfTimelineItem(issue.id.value, MOCK_CLOUD_OWNER_ID, second, ['three'])

		const read = (timelineItemId: string, ownerId = MOCK_CLOUD_OWNER_ID) =>
			testBed.resolve(GetPublishRunOutput).execute({ ownerId, issueId: issue.id.value, timelineItemId })
		expect((await read(first)).lines.map(line => line.line)).toEqual(['one', 'two'])
		expect((await read(second)).lines.map(line => line.line)).toEqual(['three'])
		await expect(read(first, STRANGER)).rejects.toThrow(expect.objectContaining({ name: 'ISSUE_NOT_FOUND' }))
	})
})
