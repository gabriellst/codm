import { Repository } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { Workspace } from '../../entities'

export abstract class WorkspaceRepository extends Repository<Workspace> {
	abstract findById(id: string, tx?: Transaction): Promise<Workspace | undefined>
}
