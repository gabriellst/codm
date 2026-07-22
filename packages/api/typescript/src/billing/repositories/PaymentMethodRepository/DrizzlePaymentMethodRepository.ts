import { injectable } from 'tsyringe-neo'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { DrizzleClient, saveWithOptimisticLock, tryCatchAsync } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { paymentMethod } from '@template/contracts/db'
import { PaymentMethodRepository } from './PaymentMethodRepository'
import { PaymentMethod } from '../../entities'

import { Mandate } from '../../objects/Mandate'
import type { CaptureOrigin, PaymentInstrument } from '../../objects/PaymentInstrument'
import { BillingPlatform, PaymentMethodStatus, PaymentMethodType } from '@template/contracts-typescript/wire/enums'

@injectable()
export class DrizzlePaymentMethodRepository extends PaymentMethodRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	private client(tx?: Transaction): DrizzleClient {
		return (tx as DrizzleClient | undefined) ?? this.db
	}

	async findById(id: string, transaction?: Transaction): Promise<PaymentMethod | undefined> {
		const dbClient = this.client(transaction)
		const result = await tryCatchAsync(async () => {
			const rows = await dbClient.select().from(paymentMethod).where(eq(paymentMethod.id, id)).limit(1)
			return rows[0]
		})
		if (!result.success) throw result.error
		if (!result.data) return undefined
		return this.toDomain(result.data)
	}

	async findActiveByOwnerId(ownerId: string, transaction?: Transaction): Promise<PaymentMethod | undefined> {
		const dbClient = this.client(transaction)
		const result = await tryCatchAsync(async () => {
			const rows = await dbClient
				.select()
				.from(paymentMethod)
				.where(and(eq(paymentMethod.ownerId, ownerId), eq(paymentMethod.status, PaymentMethodStatus.ACTIVE)))
				.orderBy(desc(paymentMethod.createdAt))
				.limit(1)
			return rows[0]
		})
		if (!result.success) throw result.error
		if (!result.data) return undefined
		return this.toDomain(result.data)
	}

	async findDefaultByOwnerId(ownerId: string, transaction?: Transaction): Promise<PaymentMethod | null> {
		const dbClient = this.client(transaction)
		const result = await tryCatchAsync(async () => {
			const rows = await dbClient
				.select()
				.from(paymentMethod)
				.where(
					and(eq(paymentMethod.ownerId, ownerId), eq(paymentMethod.isDefault, true), eq(paymentMethod.status, PaymentMethodStatus.ACTIVE)),
				)
				.limit(1)
			return rows[0] ?? null
		})
		if (!result.success) throw result.error
		if (!result.data) return null
		return this.toDomain(result.data)
	}

	async clearDefault(ownerId: string, transaction?: Transaction): Promise<void> {
		const result = await tryCatchAsync(async () => {
			const dbClient = this.client(transaction)
			// Wallet model: demote the FLAG only — the previous card stays stored (non-default).
			await dbClient
				.update(paymentMethod)
				.set({ isDefault: false, updatedAt: new Date() })
				.where(and(eq(paymentMethod.ownerId, ownerId), eq(paymentMethod.isDefault, true)))
		})
		if (!result.success) throw result.error
	}

	async findAllByOwnerId(ownerId: string, transaction?: Transaction): Promise<PaymentMethod[]> {
		const dbClient = this.client(transaction)
		const result = await tryCatchAsync(async () => {
			const rows = await dbClient
				.select()
				.from(paymentMethod)
				.where(
					and(eq(paymentMethod.ownerId, ownerId), inArray(paymentMethod.status, [PaymentMethodStatus.ACTIVE, PaymentMethodStatus.EXPIRED])),
				)
				.orderBy(desc(paymentMethod.isDefault), desc(paymentMethod.createdAt))
			return rows.map(row => this.toDomain(row))
		})
		if (!result.success) throw result.error
		return result.data
	}

	async setDefault(id: string, ownerId: string, transaction?: Transaction): Promise<void> {
		const result = await tryCatchAsync(async () => {
			const dbClient = this.client(transaction)
			await dbClient
				.update(paymentMethod)
				.set({ isDefault: false, updatedAt: new Date() })
				.where(and(eq(paymentMethod.ownerId, ownerId), eq(paymentMethod.isDefault, true)))
			await dbClient
				.update(paymentMethod)
				.set({ isDefault: true, updatedAt: new Date() })
				.where(and(eq(paymentMethod.id, id), eq(paymentMethod.ownerId, ownerId)))
		})
		if (!result.success) throw result.error
	}

	async save(entity: PaymentMethod, transaction?: Transaction): Promise<PaymentMethod> {
		const previousVersion = entity.version
		entity.incrementVersion()

		const result = await tryCatchAsync(async () => {
			const data = this.toPersistence(entity)
			const dbClient = this.client(transaction)

			await saveWithOptimisticLock({
				db: dbClient,
				table: paymentMethod,
				data,
				conflictTarget: paymentMethod.id,
				set: {
					ownerId: sql`excluded.owner_id`,
					platform: sql`excluded.platform`,
					type: sql`excluded.type`,
					pmRef: sql`excluded.pm_ref`,
					supportsOffSession: sql`excluded.supports_off_session`,
					brand: sql`excluded.brand`,
					last4: sql`excluded.last4`,
					expMonth: sql`excluded.exp_month`,
					expYear: sql`excluded.exp_year`,
					network: sql`excluded.network`,
					mandateAcceptedAt: sql`excluded.mandate_accepted_at`,
					mandateIp: sql`excluded.mandate_ip`,
					mandateUserAgent: sql`excluded.mandate_user_agent`,
					mandateConsentVersion: sql`excluded.mandate_consent_version`,
					status: sql`excluded.status`,
					isDefault: sql`excluded.is_default`,
					updatedAt: sql`excluded.updated_at`,
					version: sql`excluded.version`,
				},
				versionColumn: paymentMethod.version,
				previousVersion,
			})

			return entity
		})

		if (!result.success) throw result.error
		return result.data
	}

	async delete(id: string, transaction?: Transaction): Promise<void> {
		const result = await tryCatchAsync(async () => {
			const dbClient = this.client(transaction)
			await dbClient.delete(paymentMethod).where(eq(paymentMethod.id, id))
		})
		if (!result.success) throw result.error
	}

	private toDomain(row: typeof paymentMethod.$inferSelect): PaymentMethod {
		return new PaymentMethod({
			id: row.id,
			ownerId: row.ownerId,
			platform: row.platform as BillingPlatform,
			mandate: new Mandate({
				acceptedAt: row.mandateAcceptedAt,
				ip: row.mandateIp,
				userAgent: row.mandateUserAgent,
				consentVersion: row.mandateConsentVersion,
			}),
			status: row.status as PaymentMethodStatus,
			isDefault: row.isDefault,
			instrument: this.toInstrument(row),
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			version: row.version,
		})
	}

	// Rebuild the discriminated union from the flat row by `type`.
	private toInstrument(row: typeof paymentMethod.$inferSelect): PaymentInstrument {
		const base = {
			pmRef: row.pmRef,
			supportsOffSession: row.supportsOffSession,
			...(row.captureOrigin ? { captureOrigin: row.captureOrigin as CaptureOrigin } : {}),
			...(row.originGatewayTxId ? { originGatewayTxId: row.originGatewayTxId } : {}),
		}
		switch (row.type) {
			case PaymentMethodType.CARD:
				return {
					type: PaymentMethodType.CARD,
					...base,
					brand: row.brand ?? '',
					last4: row.last4 ?? '',
					expMonth: row.expMonth ?? 1,
					expYear: row.expYear ?? new Date().getFullYear(),
				}
			case PaymentMethodType.APPLE_PAY:
				return { type: PaymentMethodType.APPLE_PAY, ...base, network: row.network ?? '', last4: row.last4 ?? '' }
			case PaymentMethodType.GOOGLE_PAY:
				return { type: PaymentMethodType.GOOGLE_PAY, ...base, network: row.network ?? '', last4: row.last4 ?? '' }
			default:
				return {
					type: PaymentMethodType.CARD,
					...base,
					brand: row.brand ?? '',
					last4: row.last4 ?? '',
					expMonth: row.expMonth ?? 1,
					expYear: row.expYear ?? new Date().getFullYear(),
				}
		}
	}

	// Flatten the union into per-leaf nullable columns.
	private toPersistence(entity: PaymentMethod): typeof paymentMethod.$inferInsert {
		const i = entity.instrument
		const isCard = i.type === PaymentMethodType.CARD
		const isWallet = i.type === PaymentMethodType.APPLE_PAY || i.type === PaymentMethodType.GOOGLE_PAY
		return {
			id: entity.id.value,
			ownerId: entity.ownerId,
			platform: entity.platform,
			type: i.type,
			pmRef: i.pmRef,
			supportsOffSession: i.supportsOffSession,
			captureOrigin: i.captureOrigin ?? null,
			originGatewayTxId: i.originGatewayTxId ?? null,
			brand: isCard ? i.brand : null,
			last4: isCard || isWallet ? i.last4 : null,
			expMonth: isCard ? i.expMonth : null,
			expYear: isCard ? i.expYear : null,
			network: isWallet ? i.network : null,
			mandateAcceptedAt: entity.mandate.acceptedAt,
			mandateIp: entity.mandate.ip ?? null,
			mandateUserAgent: entity.mandate.userAgent ?? null,
			mandateConsentVersion: entity.mandate.consentVersion ?? null,
			status: entity.status,
			isDefault: entity.isDefault,
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
			version: entity.version,
		}
	}
}
