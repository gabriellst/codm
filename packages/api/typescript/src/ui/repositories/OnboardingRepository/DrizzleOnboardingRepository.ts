// packages/api/typescript/src/ui/repositories/OnboardingRepository/DrizzleOnboardingRepository.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { DrizzleDatabaseDriver, tryCatchAsync, DrizzleTransaction } from '@codm/core-typescript'
import { onboardings } from '@codm/contracts/db'
import type { OnboardingStep } from '@codm/contracts-typescript/wire/enums'
import { Onboarding, OnboardingSchema } from '../../entities/Onboarding'
import { OnboardingRepository } from './OnboardingRepository'

@injectable()
export class DrizzleOnboardingRepository extends OnboardingRepository {
	constructor(private driver: DrizzleDatabaseDriver) {
		super()
	}

	async findByOwnerId(ownerId: string, tx?: DrizzleTransaction): Promise<Onboarding | undefined> {
		const dbc = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc.select().from(onboardings).where(eq(onboardings.ownerId, ownerId)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async save(entity: Onboarding, tx?: DrizzleTransaction): Promise<Onboarding> {
		entity.incrementVersion()
		const dbc = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			const data = this.toPersistence(entity)
			await dbc
				.insert(onboardings)
				.values(data)
				.onConflictDoUpdate({
					target: onboardings.id,
					set: {
						currentStep: data.currentStep,
						completedAt: data.completedAt,
						updatedAt: new Date(),
						version: data.version,
					},
				})
			return entity
		})
		if (!result.success) throw result.error
		return result.data
	}

	async delete(id: string, tx?: DrizzleTransaction): Promise<void> {
		const dbc = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			await dbc.delete(onboardings).where(eq(onboardings.id, id))
		})
		if (!result.success) throw result.error
	}

	private toDomain(row: typeof onboardings.$inferSelect): Onboarding {
		const parsed = OnboardingSchema.parse({
			ownerId: row.ownerId,
			currentStep: row.currentStep as OnboardingStep,
			completedAt: row.completedAt ?? undefined,
		})
		return new Onboarding({
			...parsed,
			id: row.id,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			version: row.version,
		})
	}

	private toPersistence(entity: Onboarding): typeof onboardings.$inferInsert {
		return {
			id: entity.id.value,
			ownerId: entity.ownerId,
			currentStep: entity.currentStep,
			completedAt: entity.completedAt ?? null,
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
			version: entity.version,
		}
	}
}
