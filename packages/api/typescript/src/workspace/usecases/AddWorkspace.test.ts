import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { BaseError, DomainEventRepository } from '@codedm/core-typescript'
import { WorkspaceBadge } from '@codedm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { AddWorkspace } from './AddWorkspace'
import { WorkspaceRepository } from '../repositories/WorkspaceRepository'
import { WorkspaceDetector } from '../services/WorkspaceDetector'
import { WorkspaceAddedEvent } from '../events'

describe('AddWorkspace use case', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('happy path: persists the workspace with detected badges + emits workspace.added', async () => {
		const useCase = testBed.resolve(AddWorkspace)
		const out = await useCase.execute({ ownerId: OPERATOR_ID, path: '/Users/dev/acme-api' })

		expect(out.workspaceId).toBeDefined()
		expect(out.badges).toEqual([WorkspaceBadge.GIT]) // MockWorkspaceDetector default

		const repo = testBed.resolve(WorkspaceRepository)
		const saved = await repo.findById(out.workspaceId)
		expect(saved?.path).toBe('/Users/dev/acme-api')

		const events = await testBed.resolve(DomainEventRepository).findByType(WorkspaceAddedEvent)
		expect(events).toHaveLength(1)
		expect(events[0]!.payload.workspaceId).toBe(out.workspaceId)
	})

	it('dedupes by absolute path (WORKSPACE_ALREADY_REGISTERED)', async () => {
		const useCase = testBed.resolve(AddWorkspace)
		await useCase.execute({ ownerId: OPERATOR_ID, path: '/Users/dev/dup' })
		await expect(useCase.execute({ ownerId: OPERATOR_ID, path: '/Users/dev/dup' })).rejects.toThrow(BaseError)
	})

	it('rejects a missing path (PATH_NOT_FOUND)', async () => {
		testBed.override(WorkspaceDetector, {
			inspect: async () => ({ exists: false, isDirectory: false, badges: [] }),
		} as WorkspaceDetector)
		const useCase = testBed.resolve(AddWorkspace)
		await expect(useCase.execute({ ownerId: OPERATOR_ID, path: '/no/such/path' })).rejects.toThrow(BaseError)
	})

	it('rejects a file path (PATH_NOT_A_DIRECTORY)', async () => {
		testBed.override(WorkspaceDetector, {
			inspect: async () => ({ exists: true, isDirectory: false, badges: [] }),
		} as WorkspaceDetector)
		const useCase = testBed.resolve(AddWorkspace)
		await expect(useCase.execute({ ownerId: OPERATOR_ID, path: '/Users/dev/file.txt' })).rejects.toThrow(BaseError)
	})
})
