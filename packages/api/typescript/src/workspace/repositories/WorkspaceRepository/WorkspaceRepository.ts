import { Repository } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { Workspace } from '../../entities/Workspace'

export abstract class WorkspaceRepository extends Repository<Workspace> {
	abstract findById(id: string, tx?: Transaction): Promise<Workspace | undefined>
	// Absolute-path dedupe lookup (AddWorkspace guard). Scoped to the owner.
	abstract findByOwnerAndPath(ownerId: string, path: string, tx?: Transaction): Promise<Workspace | undefined>
	abstract listByOwner(ownerId: string, tx?: Transaction): Promise<Workspace[]>
}
