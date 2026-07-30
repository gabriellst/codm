// Per-env DI bindings for the external (reverse-proxy) BC.
import './errors' // Side-effect: registers context error codes with the framework runtime registry.

import { type InstanceRegistry, expandBindings } from '@codm/core-typescript'

// The proxy context owns no ports — ChannelProxy is a pure passthrough (fetch + Config), no
// repositories, no services. The registry exists for the CONTEXT_REGISTRIES completeness check
// (satisfies Record<ContextModule, InstanceRegistry>) and to load the error registration above.
export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([])
