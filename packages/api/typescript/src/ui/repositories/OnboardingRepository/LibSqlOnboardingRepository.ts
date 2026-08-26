// packages/api/typescript/src/ui/repositories/OnboardingRepository/LibSqlOnboardingRepository.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { LibSqlDatabaseDriver, tryCatchAsync, LibSqlTransaction } from '@codm/core-typescript'
import { onboardings } from '@codm/contracts/db'
import type { OnboardingStep } from '@codm/contracts-typescript/wire/enums'
import { Onboarding, OnboardingSchema } from '../../entities/Onboarding'
import { OnboardingRepository } from './OnboardingRepository'

@injectable()
export class LibSqlOnboardingRepository extends OnboardingRepository {
	constructor(private driver: LibSqlDatabaseDriver) {
		super()
	}

	async findByOwnerId(ownerId: string, tx?: LibSqlTransaction): Promise<Onboarding | undefined> {
		const dbc = tx ?? this.driver.db
		const result = await tryCatchAsync(async () => {
			const rows = await dbc.select().from(onboardings).where(eq(onboardings.ownerId, ownerId)).limit(1)
			return rows[0]
		})
		if (!result.success || !result.data) return undefined
		return this.toDomain(result.data)
	}

	async save(entity: Onboarding, tx?: LibSqlTransaction): Promise<Onboarding> {
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
						state: data.state,
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

	async delete(id: string, tx?: LibSqlTransaction): Promise<void> {
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
			state: row.state ?? {},
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
			state: entity.state,
			completedAt: entity.completedAt ?? null,
			createdAt: entity.createdAt,
			updatedAt: entity.updatedAt,
			version: entity.version,
		}
	}
}
