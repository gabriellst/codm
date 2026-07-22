import './errors' // Side-effect: registers this context's error codes with the framework runtime registry.
import type { InstanceRegistry } from '@template/core-typescript'
import { WorkspaceRepository } from './repositories/WorkspaceRepository/WorkspaceRepository'
import { DrizzleWorkspaceRepository } from './repositories/WorkspaceRepository/DrizzleWorkspaceRepository'
import { MockWorkspaceRepository } from './repositories/WorkspaceRepository/MockWorkspaceRepository'
import { SpaceRepository } from './repositories/SpaceRepository/SpaceRepository'
import { DrizzleSpaceRepository } from './repositories/SpaceRepository/DrizzleSpaceRepository'
import { MockSpaceRepository } from './repositories/SpaceRepository/MockSpaceRepository'

export const INSTANCE_REGISTRY: InstanceRegistry = {
	mock: [
		{ token: WorkspaceRepository, instance: MockWorkspaceRepository },
		{ token: SpaceRepository, instance: MockSpaceRepository },
	],
	integration: [
		{ token: WorkspaceRepository, instance: DrizzleWorkspaceRepository },
		{ token: SpaceRepository, instance: DrizzleSpaceRepository },
	],
	real: [
		{ token: WorkspaceRepository, instance: DrizzleWorkspaceRepository },
		{ token: SpaceRepository, instance: DrizzleSpaceRepository },
	],
}
