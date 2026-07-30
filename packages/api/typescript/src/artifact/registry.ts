// Per-env DI bindings for the artifact (BC6 Artifact Registry) context.
import './errors' // Side-effect: registers this context's error codes with the framework runtime registry.

import { type InstanceRegistry, expandBindings } from '@codm/core-typescript'
import { ArtifactRepository, DrizzleArtifactRepository, MockArtifactRepository } from './repositories/ArtifactRepository'

export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
	{ token: ArtifactRepository, mock: MockArtifactRepository, real: DrizzleArtifactRepository },
])
