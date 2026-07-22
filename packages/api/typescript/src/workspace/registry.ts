// Per-env DI bindings for the workspace (BC2 Workspace Registry) context.
import './errors' // Side-effect: registers this context's error codes with the framework runtime registry.

import { type InstanceRegistry, expandBindings } from '@codedm/core-typescript'
import { WorkspaceRepository, DrizzleWorkspaceRepository, MockWorkspaceRepository } from './repositories/WorkspaceRepository'
import { WorkspaceDetector, SystemWorkspaceDetector, MockWorkspaceDetector } from './services/WorkspaceDetector'
import { WorkspaceUsageQuery, DrizzleWorkspaceUsageQuery, MockWorkspaceUsageQuery } from './services/WorkspaceUsageQuery'

export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
	{ token: WorkspaceRepository, mock: MockWorkspaceRepository, real: DrizzleWorkspaceRepository },
	// FS/git probing: canned in tests, real OS probing in `real`.
	{ token: WorkspaceDetector, mock: MockWorkspaceDetector, integration: MockWorkspaceDetector, real: SystemWorkspaceDetector },
	// In-use check reads the issue/thread tables directly — real query in `real`+`integration`, no-op in mock.
	{ token: WorkspaceUsageQuery, mock: MockWorkspaceUsageQuery, integration: DrizzleWorkspaceUsageQuery, real: DrizzleWorkspaceUsageQuery },
])
