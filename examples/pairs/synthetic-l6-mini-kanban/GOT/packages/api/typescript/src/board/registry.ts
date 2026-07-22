import './errors'
import type { InstanceRegistry } from '@template/core-typescript'
import { BoardRepository } from './repositories/BoardRepository'
import { MockBoardRepository } from './repositories/MockBoardRepository'
import { DrizzleBoardRepository } from './repositories/DrizzleBoardRepository'

export const INSTANCE_REGISTRY: InstanceRegistry = {
	mock: [{ token: BoardRepository, instance: MockBoardRepository }],
	integration: [{ token: BoardRepository, instance: DrizzleBoardRepository }],
	real: [{ token: BoardRepository, instance: DrizzleBoardRepository }],
}
