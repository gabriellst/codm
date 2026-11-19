import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenWorkspace } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { WorkspaceRepository } from '../repositories/WorkspaceRepository'
import { ListWorkspaces } from './ListWorkspaces'
import { SetWorkspacePublishCommand } from './SetWorkspacePublishCommand'

/** A credential-shaped argument: wherever it shows up besides the console's own read, the command leaked. */
const SENTINEL = 'sentinel-token-7f3a'

/**
 * THE PUBLISH COMMAND'S DOORS (fase 4, item 6c): the console declares, reads and removes it — an argument list,
 * persisted as given — and no other read of the workspace carries it.
 *
 * Falsifier: drop `publishCommand` from the repository's upsert and the read-back is null; select the whole row in
 * `ListWorkspaces` and the sentinel appears in its output.
 */
describe('SetWorkspacePublishCommand', () => {
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

	const set = (workspaceId: string, command: { argv: string[] } | null, ownerId = MOCK_CLOUD_OWNER_ID) =>
		testBed.resolve(SetWorkspacePublishCommand).execute({ ownerId, workspaceId, command })
	const get = async (workspaceId: string) => ({
		command: (await testBed.resolve(WorkspaceRepository).findById(workspaceId))?.publishCommand ?? null,
	})

	it('declares the argument list as given — a `;` or `$()` is an argument, never shell', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		expect(await get(workspace.id.value)).toEqual({ command: null })

		const argv = ['bun', 'run', 'deploy', '--note', 'a; rm -rf $(pwd)', `--token=${SENTINEL}`]
		await set(workspace.id.value, { argv })

		expect(await get(workspace.id.value)).toEqual({ command: { argv } })
		expect((await testBed.resolve(WorkspaceRepository).findById(workspace.id.value))?.publishCommand).toEqual({ argv })
	})

	it('null removes it — the workspace goes back to waking the session', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		await set(workspace.id.value, { argv: ['make', 'publish'] })
		await set(workspace.id.value, null)
		expect(await get(workspace.id.value)).toEqual({ command: null })
	})

	it('an empty argument list, or an empty argument, is refused', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		await expect(set(workspace.id.value, { argv: [] })).rejects.toThrow()
		await expect(set(workspace.id.value, { argv: ['make', ''] })).rejects.toThrow()
		expect(await get(workspace.id.value)).toEqual({ command: null })
	})

	it('another owner’s workspace is not found', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const stranger = '00000000-0000-4000-8000-0000000000aa'
		await expect(set(workspace.id.value, { argv: ['make'] }, stranger)).rejects.toThrow(
			expect.objectContaining({ name: 'WORKSPACE_NOT_FOUND' }),
		)
	})

	it('the list of workspaces (an MCP tool) never carries the command — by value, not only by key', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		await set(workspace.id.value, { argv: ['deploy', `--token=${SENTINEL}`] })
		const listed = await testBed.resolve(ListWorkspaces).execute({ ownerId: MOCK_CLOUD_OWNER_ID })
		expect(listed.workspaces).toHaveLength(1)
		expect(JSON.stringify(listed)).not.toContain(SENTINEL)
		expect(JSON.stringify(listed)).not.toContain('publishCommand')
	})
})
