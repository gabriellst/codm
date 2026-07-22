import './errors'
import { type InstanceRegistry, expandBindings } from '@template/core-typescript'
import { NotificationRepository, MockNotificationRepository, DrizzleNotificationRepository } from './repositories/NotificationRepository'
import {
	NotificationDeliveryRepository,
	MockNotificationDeliveryRepository,
	DrizzleNotificationDeliveryRepository,
} from './repositories/NotificationDeliveryRepository'

export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
	{ token: NotificationRepository, mock: MockNotificationRepository, real: DrizzleNotificationRepository },
	{ token: NotificationDeliveryRepository, mock: MockNotificationDeliveryRepository, real: DrizzleNotificationDeliveryRepository },
])
