import { Repository } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { Space } from '../../entities'

export abstract class SpaceRepository extends Repository<Space> {
	abstract findById(id: string, tx?: Transaction): Promise<Space | undefined>
}
