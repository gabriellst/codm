import './errors' // Side-effect: registers context error codes with the framework runtime registry.

import { type InstanceRegistry, expandBindings } from '@codm/core-typescript'
import { PanelStore, PgPanelStore, MockPanelStore } from './services/PanelStore'

export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([{ token: PanelStore, mock: MockPanelStore, real: PgPanelStore }])
