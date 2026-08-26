import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { BaseError, DomainEventRepository } from '@codm/core-typescript'
import { WorkspaceBadge } from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { ABSOLUTE_PATH_PATTERN, AddWorkspace, AddWorkspaceInputSchema } from './AddWorkspace'
import { WorkspaceRepository } from '../repositories/WorkspaceRepository'
import { WorkspaceDetector } from '../services/WorkspaceDetector'
import { WorkspaceAddedEvent } from '../events/WorkspaceAddedEvent'

/**
 * O schema de entrada é a ÚNICA regra de forma do caminho — e atravessa o fio (OpenAPI `pattern` →
 * Kubb `addWorkspaceMutationRequestSchema` → progenitor `AddWorkspaceBodyPath`). Estes casos são
 * puros (sem TestBed) e cobrem uma família de caminho por linha; `.startsWith('/')` rejeitava TODO
 * caminho do Windows antes de o detector sequer olhar o disco.
 */
describe('AddWorkspaceInputSchema — caminho absoluto em qualquer SO', () => {
	const accepts = (path: string) => AddWorkspaceInputSchema.safeParse({ ownerId: MOCK_CLOUD_OWNER_ID, path }).success

	it.each([
		['POSIX', '/Users/dev/acme-api'],
		['Windows, letra de unidade e barra invertida', 'C:\\Users\\dev\\acme-api'],
		['Windows, letra de unidade e barra normal', 'D:/projects/acme'],
		['Windows, letra de unidade minúscula', 'c:\\work\\acme'],
		['UNC', '\\\\fileserver\\share\\acme'],
		['UNC estendido', '\\\\?\\C:\\work\\acme'],
	])('aceita %s', (_label, path) => {
		expect(accepts(path)).toBe(true)
	})

	it.each([
		['relativo POSIX', 'projects/acme'],
		['relativo à unidade (sem separador após o `:`)', 'C:acme'],
		['com til (o picker nativo nunca devolve `~`)', '~/dev/acme'],
		['vazio', ''],
		['só espaços', '   '],
	])('rejeita %s', (_label, path) => {
		expect(accepts(path)).toBe(false)
	})

	it('a regex que o OpenAPI/Kubb/progenitor re-emitem é exatamente esta — mudar é decisão de contrato', () => {
		// O String.raw abaixo contém LITERALMENTE o texto entre as barras do literal da implementação
		// (uma barra invertida antes do primeiro `/`; classe com duas barras invertidas + `/`; quatro
		// barras invertidas na alternativa UNC) — é o que `.source` devolve.
		expect(ABSOLUTE_PATH_PATTERN.source).toBe(String.raw`^(?:\/|[A-Za-z]:[\\/]|\\\\)`)
	})
})

describe('AddWorkspace use case', () => {
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

	it('happy path: persists the workspace with detected badges + emits workspace.added', async () => {
		const useCase = testBed.resolve(AddWorkspace)
		const out = await useCase.execute({ ownerId: MOCK_CLOUD_OWNER_ID, path: '/Users/dev/acme-api' })

		expect(out.workspaceId).toBeDefined()
		expect(out.badges).toEqual([WorkspaceBadge.GIT]) // MockWorkspaceDetector default

		const repo = testBed.resolve(WorkspaceRepository)
		const saved = await repo.findById(out.workspaceId)
		expect(saved?.path).toBe('/Users/dev/acme-api')

		const events = await testBed.resolve(DomainEventRepository).findByType(WorkspaceAddedEvent)
		expect(events).toHaveLength(1)
		expect(events[0]!.payload.workspaceId).toBe(out.workspaceId)
	})

	it('persiste um caminho do Windows tal como veio do picker (sem normalizar separadores)', async () => {
		const useCase = testBed.resolve(AddWorkspace)
		const out = await useCase.execute({ ownerId: MOCK_CLOUD_OWNER_ID, path: 'C:\\Users\\dev\\acme-api' })

		const saved = await testBed.resolve(WorkspaceRepository).findById(out.workspaceId)
		expect(saved?.path).toBe('C:\\Users\\dev\\acme-api')
	})

	it('dedupes by absolute path (WORKSPACE_ALREADY_REGISTERED)', async () => {
		const useCase = testBed.resolve(AddWorkspace)
		await useCase.execute({ ownerId: MOCK_CLOUD_OWNER_ID, path: '/Users/dev/dup' })
		await expect(useCase.execute({ ownerId: MOCK_CLOUD_OWNER_ID, path: '/Users/dev/dup' })).rejects.toThrow(BaseError)
	})

	it('rejects a missing path (PATH_NOT_FOUND)', async () => {
		testBed.override(WorkspaceDetector, {
			inspect: async () => ({ exists: false, isDirectory: false, badges: [] }),
		} as WorkspaceDetector)
		const useCase = testBed.resolve(AddWorkspace)
		await expect(useCase.execute({ ownerId: MOCK_CLOUD_OWNER_ID, path: '/no/such/path' })).rejects.toThrow(BaseError)
	})

	it('rejects a file path (PATH_NOT_A_DIRECTORY)', async () => {
		testBed.override(WorkspaceDetector, {
			inspect: async () => ({ exists: true, isDirectory: false, badges: [] }),
		} as WorkspaceDetector)
		const useCase = testBed.resolve(AddWorkspace)
		await expect(useCase.execute({ ownerId: MOCK_CLOUD_OWNER_ID, path: '/Users/dev/file.txt' })).rejects.toThrow(BaseError)
	})
})
