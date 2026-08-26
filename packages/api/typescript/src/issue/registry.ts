// Per-env DI bindings for the issue (BC5 Issue Execution) context.
import './errors' // Side-effect: registers this context's error codes with the framework runtime registry.

import { type InstanceRegistry, expandBindings } from '@codm/core-typescript'
import { IssueRepository, LibSqlIssueRepository, MockIssueRepository } from './repositories/IssueRepository'
import { TerminalLineRepository, LibSqlTerminalLineRepository, MockTerminalLineRepository } from './repositories/TerminalLineRepository'

export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
	{ token: IssueRepository, mock: MockIssueRepository, real: LibSqlIssueRepository },
	{ token: TerminalLineRepository, mock: MockTerminalLineRepository, real: LibSqlTerminalLineRepository },
])
