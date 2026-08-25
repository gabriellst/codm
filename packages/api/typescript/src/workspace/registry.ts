// Per-env DI bindings for the workspace (BC2 Workspace Registry) context.
import './errors' // Side-effect: registers this context's error codes with the framework runtime registry.

import { type InstanceRegistry, expandBindings } from '@codm/core-typescript'
import { WorkspaceRepository, LibSqlWorkspaceRepository, MockWorkspaceRepository } from './repositories/WorkspaceRepository'
import { WorkspaceDetector, SystemWorkspaceDetector, MockWorkspaceDetector } from './services/WorkspaceDetector'
import { WorkspaceUsageQuery, LibSqlWorkspaceUsageQuery, MockWorkspaceUsageQuery } from './services/WorkspaceUsageQuery'

export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
	{ token: WorkspaceRepository, mock: MockWorkspaceRepository, real: LibSqlWorkspaceRepository },
	// FS/git probing: canned in tests, real OS probing in `real`. `e2e` INHERITS the canned detector ON
	// PURPOSE (no declaration needed) — a Playwright spec must not depend on a path existing (or being
	// a git checkout) on the host that runs it, which is the same rule the mock/integration columns
	// encode. The pre-front raw-flag world probed the real filesystem here only because the flag never
	// touched this token.
	{ token: WorkspaceDetector, mock: MockWorkspaceDetector, integration: MockWorkspaceDetector, real: SystemWorkspaceDetector },
	// In-use check reads the issue/thread tables directly — real query in `real`+`integration`, no-op in mock.
	{ token: WorkspaceUsageQuery, mock: MockWorkspaceUsageQuery, integration: LibSqlWorkspaceUsageQuery, real: LibSqlWorkspaceUsageQuery },
])
