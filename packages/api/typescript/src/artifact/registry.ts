// Per-env DI bindings for the artifact (BC6 Artifact Registry) context.
import './errors' // Side-effect: registers this context's error codes with the framework runtime registry.

import { type InstanceRegistry, expandBindings } from '@codm/core-typescript'
import { ArtifactRepository, LibSqlArtifactRepository, MockArtifactRepository } from './repositories/ArtifactRepository'

export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
	{ token: ArtifactRepository, mock: MockArtifactRepository, real: LibSqlArtifactRepository },
	// `MediaStore` (staging bytes under `CODM_DATA_DIR/media`) moved to `shared` in fase 3 — see its binding there.
])
