// Per-env DI bindings for the artifact (BC6 Artifact Registry) context.
import './errors' // Side-effect: registers this context's error codes with the framework runtime registry.

import { type InstanceRegistry, expandBindings } from '@codm/core-typescript'
import { ArtifactRepository, LibSqlArtifactRepository, MockArtifactRepository } from './repositories/ArtifactRepository'
import { MediaStore, DiskMediaStore, MockMediaStore } from './services/MediaStore'

export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
	{ token: ArtifactRepository, mock: MockArtifactRepository, real: LibSqlArtifactRepository },
	// `SendArtifact` stages bytes under `CODM_DATA_DIR/media` before enqueueing delivery — real disk
	// I/O in `real` only, same posture as `ContactAvatarStore` (the directory defaults to the
	// operator's actual home, so no test may touch it).
	{ token: MediaStore, mock: MockMediaStore, integration: MockMediaStore, real: DiskMediaStore },
])
