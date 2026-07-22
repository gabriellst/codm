// Per-env DI bindings for UI (BFF) BC.
import './errors' // Side-effect: registers context error codes with the framework runtime registry.

import { type InstanceRegistry, expandBindings } from '@codedm/core-typescript'

// The BFF context owns no ports today — query use cases resolve shared kernel services only.
export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([])
