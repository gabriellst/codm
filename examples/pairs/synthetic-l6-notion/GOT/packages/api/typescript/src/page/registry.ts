import './errors'
import type { InstanceRegistry } from '@template/core-typescript'
import { PageRepository, DrizzlePageRepository, MockPageRepository } from './repositories/PageRepository'
import {
	PageViewProjectionRepository,
	DrizzlePageViewProjectionRepository,
	MockPageViewProjectionRepository,
} from './projections/PageViewProjectionRepository'

export const INSTANCE_REGISTRY: InstanceRegistry = {
	mock: [
		{ token: PageRepository, instance: MockPageRepository },
		{ token: PageViewProjectionRepository, instance: MockPageViewProjectionRepository },
	],
	integration: [
		{ token: PageRepository, instance: DrizzlePageRepository },
		{ token: PageViewProjectionRepository, instance: DrizzlePageViewProjectionRepository },
	],
	real: [
		{ token: PageRepository, instance: DrizzlePageRepository },
		{ token: PageViewProjectionRepository, instance: DrizzlePageViewProjectionRepository },
	],
}
