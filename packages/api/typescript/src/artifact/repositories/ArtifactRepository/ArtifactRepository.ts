import { Repository } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { Artifact } from '../../entities/Artifact'

export abstract class ArtifactRepository extends Repository<Artifact> {
	abstract findById(id: string, tx?: Transaction): Promise<Artifact | undefined>
	abstract listByThread(threadId: string, tx?: Transaction): Promise<Artifact[]>
}
