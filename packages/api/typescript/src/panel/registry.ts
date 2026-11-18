import './errors' // Side-effect: registers context error codes with the framework runtime registry.

import { type InstanceRegistry, expandBindings } from '@codm/core-typescript'
import { PanelStore, PgPanelStore, MockPanelStore } from './services/PanelStore'
import { PanelIdentityStore, PgPanelIdentityStore, MockPanelIdentityStore } from './services/PanelIdentityStore'
import { PanelActionStore, PgPanelActionStore, MockPanelActionStore } from './services/PanelActionStore'

export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
	{ token: PanelStore, mock: MockPanelStore, real: PgPanelStore },
	// Who a panel visitor is (fase 2, item 6a): roster, code requests, device sessions.
	{ token: PanelIdentityStore, mock: MockPanelIdentityStore, real: PgPanelIdentityStore },
	// What identified people ask for on the panel (fase 2, item 6b): stored, handed to the daemon, answered.
	{ token: PanelActionStore, mock: MockPanelActionStore, real: PgPanelActionStore },
])
