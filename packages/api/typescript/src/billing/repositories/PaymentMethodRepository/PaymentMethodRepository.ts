import type { Transaction } from '@template/core-typescript'
import { PaymentMethod } from '../../entities'

/**
 * Read/write surface for the vaulted payment-method wallet (`billing_payment_methods`). A wallet
 * holds many stored instruments per owner with exactly one ACTIVE default (renewals charge it).
 */
export abstract class PaymentMethodRepository {
	abstract save(entity: PaymentMethod, transaction?: Transaction): Promise<PaymentMethod>
	abstract delete(id: string, transaction?: Transaction): Promise<void>
	abstract findById(id: string, transaction?: Transaction): Promise<PaymentMethod | undefined>
	abstract findActiveByOwnerId(ownerId: string, transaction?: Transaction): Promise<PaymentMethod | undefined>
	abstract findDefaultByOwnerId(ownerId: string, transaction?: Transaction): Promise<PaymentMethod | null>
	abstract clearDefault(ownerId: string, transaction?: Transaction): Promise<void>
	/** ACTIVE + EXPIRED (display) — default first, then newest. */
	abstract findAllByOwnerId(ownerId: string, transaction?: Transaction): Promise<PaymentMethod[]>
	/** Atomically move the default flag to `id` (demote current, promote target). */
	abstract setDefault(id: string, ownerId: string, transaction?: Transaction): Promise<void>
}
