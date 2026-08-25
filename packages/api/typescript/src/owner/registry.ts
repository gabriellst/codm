// Per-env DI bindings for Owner BC.
import './errors' // Side-effect: registers context error codes with the framework runtime registry.

import { type InstanceRegistry, expandBindings } from '@codm/core-typescript'
import { OwnerDirectory, MockOwnerDirectory } from '@shared/services/OwnerDirectory'
import { OwnerRepository, PgOwnerRepository, MockOwnerRepository } from './repositories/OwnerRepository'
import { PgOwnerDirectory } from './services/PgOwnerDirectory'

export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
	{ token: OwnerRepository, mock: MockOwnerRepository, real: PgOwnerRepository },
	{ token: OwnerDirectory, mock: MockOwnerDirectory, real: PgOwnerDirectory },
])
