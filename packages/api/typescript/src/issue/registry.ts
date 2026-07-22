// Per-env DI bindings for the issue (BC5 Issue Execution) context.
import './errors' // Side-effect: registers this context's error codes with the framework runtime registry.

import { type InstanceRegistry, expandBindings } from '@template/core-typescript'
import { IssueRepository, DrizzleIssueRepository, MockIssueRepository } from './repositories/IssueRepository'
import { StopRepository, DrizzleStopRepository, MockStopRepository } from './repositories/StopRepository'
import {
	StopPolicyConfigRepository,
	DrizzleStopPolicyConfigRepository,
	MockStopPolicyConfigRepository,
} from './repositories/StopPolicyConfigRepository'
import { TerminalLineRepository, DrizzleTerminalLineRepository, MockTerminalLineRepository } from './repositories/TerminalLineRepository'

export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
	{ token: IssueRepository, mock: MockIssueRepository, real: DrizzleIssueRepository },
	{ token: StopRepository, mock: MockStopRepository, real: DrizzleStopRepository },
	{ token: StopPolicyConfigRepository, mock: MockStopPolicyConfigRepository, real: DrizzleStopPolicyConfigRepository },
	{ token: TerminalLineRepository, mock: MockTerminalLineRepository, real: DrizzleTerminalLineRepository },
])
