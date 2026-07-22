// Per-env DI bindings for Owner BC.
import './errors' // Side-effect: registers context error codes with the framework runtime registry.

import { type InstanceRegistry, expandBindings } from '@codedm/core-typescript'
import { OwnerDirectory, MockOwnerDirectory } from '@shared/services'
import { OwnerRepository, DrizzleOwnerRepository, MockOwnerRepository } from './repositories/OwnerRepository'
import { DrizzleOwnerDirectory } from './services'

export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
	{ token: OwnerRepository, mock: MockOwnerRepository, real: DrizzleOwnerRepository },
	{ token: OwnerDirectory, mock: MockOwnerDirectory, real: DrizzleOwnerDirectory },
])
