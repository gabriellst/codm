// Workspace given helper — sets up a Workspace via the repository directly (never the use case).
import type { TestBedLike } from './types'
import { WorkspaceBadge } from '@codm/contracts-typescript/wire/enums'
import { Workspace } from '@workspace/entities/Workspace'
import { WorkspaceRepository } from '@workspace/repositories/WorkspaceRepository'
import { uniqueId } from './sequence'

type WorkspaceOverrides = Partial<{
	ownerId: string
	path: string
	badges: WorkspaceBadge[]
}>

export async function givenWorkspace(testBed: TestBedLike, overrides: WorkspaceOverrides = {}): Promise<Workspace> {
	const repo = testBed.resolve(WorkspaceRepository)
	const workspace = Workspace.create({
		ownerId: overrides.ownerId ?? testBed.ownerId,
		path: overrides.path ?? `/Users/dev/project-${uniqueId()}`,
		badges: overrides.badges ?? [WorkspaceBadge.GIT],
	})
	await repo.save(workspace)
	return workspace
}
