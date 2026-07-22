import './errors'
import type { InstanceRegistry } from '@codedm/core-typescript'
import { WorkspaceRepository, MockWorkspaceRepository, DrizzleWorkspaceRepository } from './repositories/WorkspaceRepository'

export const INSTANCE_REGISTRY: InstanceRegistry = {
	mock: [{ token: WorkspaceRepository, instance: MockWorkspaceRepository }],
	integration: [{ token: WorkspaceRepository, instance: DrizzleWorkspaceRepository }],
	real: [{ token: WorkspaceRepository, instance: DrizzleWorkspaceRepository }],
}
