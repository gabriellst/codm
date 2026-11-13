// Per-env DI bindings for the issue (BC5 Issue Execution) context.
import './errors' // Side-effect: registers this context's error codes with the framework runtime registry.

import { type InstanceRegistry, expandBindings } from '@codm/core-typescript'
import { IssueRepository, LibSqlIssueRepository, MockIssueRepository } from './repositories/IssueRepository'
import { TerminalLineRepository, LibSqlTerminalLineRepository, MockTerminalLineRepository } from './repositories/TerminalLineRepository'
import { PanelPublisher, CloudPanelPublisher, MockPanelPublisher } from './services/PanelPublisher'

export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
	{ token: IssueRepository, mock: MockIssueRepository, real: LibSqlIssueRepository },
	{ token: TerminalLineRepository, mock: MockTerminalLineRepository, real: LibSqlTerminalLineRepository },
	// The cloud panel push (fase 1): tests never open a socket — integration records batches like mock.
	{ token: PanelPublisher, mock: MockPanelPublisher, integration: MockPanelPublisher, real: CloudPanelPublisher },
])
