import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { givenWorkspace } from '@test/support'
import { BaseError } from '@codm/core-typescript'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { RemoveWorkspace } from './RemoveWorkspace'
import { WorkspaceRepository } from '../repositories/WorkspaceRepository'
import { WorkspaceUsageQuery } from '../services/WorkspaceUsageQuery'

describe('RemoveWorkspace use case', () => {
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

	it('removes a workspace with no working issues', async () => {
		const w = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const useCase = testBed.resolve(RemoveWorkspace)
		await useCase.execute({ ownerId: MOCK_CLOUD_OWNER_ID, workspaceId: w.id.value })

		const repo = testBed.resolve(WorkspaceRepository)
		expect(await repo.findById(w.id.value)).toBeUndefined()
	})

	it('rejects an unknown workspace (WORKSPACE_NOT_FOUND)', async () => {
		const useCase = testBed.resolve(RemoveWorkspace)
		await expect(useCase.execute({ ownerId: MOCK_CLOUD_OWNER_ID, workspaceId: '00000000-0000-4000-8000-0000000000ff' })).rejects.toThrow(
			BaseError,
		)
	})

	it('refuses removal while an issue is WORKING on it (WORKSPACE_IN_USE)', async () => {
		const w = await givenWorkspace(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		testBed.override(WorkspaceUsageQuery, { hasWorkingIssues: async () => true } as WorkspaceUsageQuery)
		const useCase = testBed.resolve(RemoveWorkspace)
		await expect(useCase.execute({ ownerId: MOCK_CLOUD_OWNER_ID, workspaceId: w.id.value })).rejects.toThrow(BaseError)
	})
})
