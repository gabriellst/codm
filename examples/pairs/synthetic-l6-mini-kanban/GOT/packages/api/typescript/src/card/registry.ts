import './errors'
import type { InstanceRegistry } from '@codedm/core-typescript'
import { CardRepository } from './repositories/CardRepository'
import { MockCardRepository } from './repositories/MockCardRepository'
import { DrizzleCardRepository } from './repositories/DrizzleCardRepository'

export const INSTANCE_REGISTRY: InstanceRegistry = {
	mock: [{ token: CardRepository, instance: MockCardRepository }],
	integration: [{ token: CardRepository, instance: DrizzleCardRepository }],
	real: [{ token: CardRepository, instance: DrizzleCardRepository }],
}
