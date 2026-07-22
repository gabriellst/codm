import './errors'
import type { InstanceRegistry } from '@codedm/core-typescript'
import {
	PurchaseOrderRepository,
	MockPurchaseOrderRepository,
	DrizzlePurchaseOrderRepository,
} from './repositories/PurchaseOrderRepository'

export const INSTANCE_REGISTRY: InstanceRegistry = {
	mock: [{ token: PurchaseOrderRepository, instance: MockPurchaseOrderRepository }],
	integration: [{ token: PurchaseOrderRepository, instance: DrizzlePurchaseOrderRepository }],
	real: [{ token: PurchaseOrderRepository, instance: DrizzlePurchaseOrderRepository }],
}
