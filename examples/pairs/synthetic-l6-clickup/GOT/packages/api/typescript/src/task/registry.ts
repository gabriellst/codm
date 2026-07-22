import './errors' // Side-effect: registers this context's error codes with the framework runtime registry.
import type { InstanceRegistry } from '@codedm/core-typescript'
import { TaskRepository } from './repositories/TaskRepository/TaskRepository'
import { DrizzleTaskRepository } from './repositories/TaskRepository/DrizzleTaskRepository'
import { MockTaskRepository } from './repositories/TaskRepository/MockTaskRepository'
import { ListViewProjectionRepository, DrizzleListViewProjectionRepository, MockListViewProjectionRepository } from './projections/ListViewProjectionRepository'
import { BoardViewProjectionRepository, DrizzleBoardViewProjectionRepository, MockBoardViewProjectionRepository } from './projections/BoardViewProjectionRepository'

export const INSTANCE_REGISTRY: InstanceRegistry = {
	mock: [
		{ token: TaskRepository, instance: MockTaskRepository },
		{ token: ListViewProjectionRepository, instance: MockListViewProjectionRepository },
		{ token: BoardViewProjectionRepository, instance: MockBoardViewProjectionRepository },
	],
	integration: [
		{ token: TaskRepository, instance: DrizzleTaskRepository },
		{ token: ListViewProjectionRepository, instance: DrizzleListViewProjectionRepository },
		{ token: BoardViewProjectionRepository, instance: DrizzleBoardViewProjectionRepository },
	],
	real: [
		{ token: TaskRepository, instance: DrizzleTaskRepository },
		{ token: ListViewProjectionRepository, instance: DrizzleListViewProjectionRepository },
		{ token: BoardViewProjectionRepository, instance: DrizzleBoardViewProjectionRepository },
	],
}
