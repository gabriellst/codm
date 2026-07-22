import { injectable } from 'tsyringe-neo'
import { and, eq, inArray, isNotNull, lte, notInArray, or, sql, type SQL } from 'drizzle-orm'
import { DrizzleClient, saveWithOptimisticLock, tryCatchAsync } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { subscription } from '@template/contracts/db'

import { Subscription } from '../../entities'
import { SubscriptionRepository } from './SubscriptionRepository'
import { PlanName, SubscriptionStatus } from '@template/contracts-typescript/wire/enums'

@injectable()
export class DrizzleSubscriptionRepository extends SubscriptionRepository {
	constructor(private db: DrizzleClient) {
		super()
	}

	private client(tx?: Transaction): DrizzleClient {
		return (tx as DrizzleClient | undefined) ?? this.db
	}

	async findByOwnerId(ownerId: string, tx?: Transaction): Promise<Subscription | null> {
		const dbClient = this.client(tx)
		const result = await tryCatchAsync(async () => {
			const rows = await dbClient.select().from(subscription).where(eq(subscription.ownerId, ownerId)).limit(1)
			return rows[0]
		})
		// "Not found" is null; "failed" is throw — swallowing here once masked an outdated schema
		// as "no subscription exists" and almost let CreateSubscription overwrite an ACTIVE
		// subscription with an INCOMPLETE draft.
		if (!result.success) throw result.error
		if (!result.data) return null
		return this.toDomain(result.data)
	}

	async listByStatus(status: SubscriptionStatus, tx?: Transaction): Promise<Subscription[]> {
		const dbClient = this.client(tx)
		const result = await tryCatchAsync(() => dbClient.select().from(subscription).where(eq(subscription.status, status)))
		if (!result.success) throw result.error
		return result.data.map(row => this.toDomain(row))
	}

	async listRenewalDue(now: Date, tx?: Transaction): Promise<Subscription[]> {
		const dbClient = this.client(tx)
		const dueClause = or(
			and(
				eq(subscription.status, SubscriptionStatus.ACTIVE),
				isNotNull(subscription.currentPeriodEnd),
				lte(subscription.currentPeriodEnd, now),
			),
			and(eq(subscription.status, SubscriptionStatus.TRIALING), isNotNull(subscription.trialEnd), lte(subscription.trialEnd, now)),
		)
		const result = await tryCatchAsync(() => dbClient.select().from(subscription).where(dueClause))
		// Throw, never [] — swallowing made the billing clock "see zero renewals due" and complete
		// successfully, tick after tick, with a broken database. A job failure re-arms and is visible.
		if (!result.success) throw result.error
		return result.data.map(row => this.toDomain(row))
	}

	/**
	 * Version-guarded insert-or-update (mirrors ChargeRepository.save). On a fresh row it inserts; on an
	 * existing row it updates ONLY when the row's version still equals the one this entity was loaded with
	 * — a concurrent write (a targeted update below, or another save) bumps the version and makes this
	 * throw OPTIMISTIC_LOCK_CONFLICT (→ HTTP 409) instead of clobbering the newer row wholesale.
	 */
	async save(sub: Subscription, tx?: Transaction): Promise<Subscription> {
		const previousVersion = sub.version
		sub.incrementVersion()
		const row = this.toPersistence(sub)
		await saveWithOptimisticLock({
			db: this.client(tx),
			table: subscription,
			data: row,
			conflictTarget: subscription.ownerId,
			set: {
				engineSubscriptionId: sql`excluded.engine_subscription_id`,
				planName: sql`excluded.plan_name`,
				status: sql`excluded.status`,
				currentPeriodEnd: sql`excluded.current_period_end`,
				currentPeriodStart: sql`excluded.current_period_start`,
				trialEnd: sql`excluded.trial_end`,
				canceledAt: sql`excluded.canceled_at`,
				cancelAtPeriodEnd: sql`excluded.cancel_at_period_end`,
				scheduledPlanName: sql`excluded.scheduled_plan_name`,
				version: sql`excluded.version`,
				updatedAt: sql`excluded.updated_at`,
			},
			versionColumn: subscription.version,
			previousVersion,
		})
		return sub
	}

	async activate(ownerId: string, currentPeriodEnd?: Date | null, tx?: Transaction): Promise<void> {
		const set: Partial<typeof subscription.$inferInsert> = { status: SubscriptionStatus.ACTIVE, updatedAt: new Date() }
		if (currentPeriodEnd !== undefined) set.currentPeriodEnd = currentPeriodEnd
		await this.applyUpdate(ownerId, set, tx, notInArray(subscription.status, [...Subscription.TERMINAL_STATUSES]))
	}

	async markPastDue(ownerId: string, tx?: Transaction): Promise<void> {
		await this.applyUpdate(
			ownerId,
			{ status: SubscriptionStatus.PAST_DUE, updatedAt: new Date() },
			tx,
			notInArray(subscription.status, [...Subscription.TERMINAL_STATUSES]),
		)
	}

	async cancel(ownerId: string, tx?: Transaction): Promise<void> {
		// Idempotent + guarded like activate/markPastDue: only a non-terminal subscription transitions to
		// CANCELED, so a re-delivered cancel (or a cancel racing another terminal transition) can't
		// overwrite an existing terminal row's canceledAt.
		await this.applyUpdate(
			ownerId,
			{ status: SubscriptionStatus.CANCELED, canceledAt: new Date(), updatedAt: new Date() },
			tx,
			notInArray(subscription.status, [...Subscription.TERMINAL_STATUSES]),
		)
	}

	async finalizeCancellation(ownerId: string, tx?: Transaction): Promise<boolean> {
		const dbClient = this.client(tx)
		// Conditional in SQL so a ResumeSubscription committed since the clock's snapshot (which cleared
		// cancel_at_period_end / canceled_at) is NOT re-cancelled — READ COMMITTED re-evaluates the WHERE
		// at update time. Does NOT touch canceledAt → the request-time value is preserved.
		const rows = await dbClient
			.update(subscription)
			// Bump version like the other targeted updates (see applyUpdate) so a concurrent find→save detects it.
			.set({ status: SubscriptionStatus.CANCELED, version: sql`${subscription.version} + 1`, updatedAt: new Date() })
			.where(
				and(
					eq(subscription.ownerId, ownerId),
					eq(subscription.cancelAtPeriodEnd, true),
					isNotNull(subscription.canceledAt),
					notInArray(subscription.status, [...Subscription.TERMINAL_STATUSES]),
				),
			)
			.returning({ ownerId: subscription.ownerId })
		return rows.length > 0
	}

	async changePlan(ownerId: string, planName: PlanName, tx?: Transaction): Promise<void> {
		await this.applyUpdate(ownerId, { planName, updatedAt: new Date() }, tx)
	}

	async setScheduledPlan(ownerId: string, planName: PlanName | null, tx?: Transaction): Promise<void> {
		await this.applyUpdate(ownerId, { scheduledPlanName: planName, updatedAt: new Date() }, tx)
	}

	async finalizeCancellationMany(ownerIds: string[], tx?: Transaction): Promise<string[]> {
		if (ownerIds.length === 0) return []
		const dbClient = this.client(tx)
		// Same conditional WHERE as finalizeCancellation, over the whole set — rows a ResumeSubscription
		// un-scheduled since the sweep's snapshot simply don't match and are skipped, per row.
		const rows = await dbClient
			.update(subscription)
			.set({ status: SubscriptionStatus.CANCELED, version: sql`${subscription.version} + 1`, updatedAt: new Date() })
			.where(
				and(
					inArray(subscription.ownerId, ownerIds),
					eq(subscription.cancelAtPeriodEnd, true),
					isNotNull(subscription.canceledAt),
					notInArray(subscription.status, [...Subscription.TERMINAL_STATUSES]),
				),
			)
			.returning({ ownerId: subscription.ownerId })
		return rows.map(row => row.ownerId)
	}

	async applyScheduledPlanMany(ownerIds: string[], tx?: Transaction): Promise<{ ownerId: string; planName: PlanName }[]> {
		if (ownerIds.length === 0) return []
		const dbClient = this.client(tx)
		// Self-referential: the row's CURRENT scheduled_plan_name is the source (never a snapshot from
		// the sweep), and the IS NOT NULL condition makes a concurrently-cancelled schedule a per-row
		// skip — READ COMMITTED re-evaluates the WHERE at update time (same idiom as
		// finalizeCancellation). Non-terminal guard mirrors the targeted updaters.
		const rows = await dbClient
			.update(subscription)
			.set({
				planName: sql`${subscription.scheduledPlanName}`,
				scheduledPlanName: null,
				version: sql`${subscription.version} + 1`,
				updatedAt: new Date(),
			})
			.where(
				and(
					inArray(subscription.ownerId, ownerIds),
					isNotNull(subscription.scheduledPlanName),
					notInArray(subscription.status, [...Subscription.TERMINAL_STATUSES]),
				),
			)
			.returning({ ownerId: subscription.ownerId, planName: subscription.planName })
		// Literal-union mirror → enum cast (see toDomain).
		return rows.map(row => ({ ownerId: row.ownerId, planName: row.planName as unknown as PlanName }))
	}

	private async applyUpdate(
		ownerId: string,
		set: Partial<typeof subscription.$inferInsert>,
		tx?: Transaction,
		extraWhere?: SQL,
	): Promise<void> {
		const dbClient = this.client(tx)
		const where = extraWhere ? and(eq(subscription.ownerId, ownerId), extraWhere) : eq(subscription.ownerId, ownerId)
		// Bump version on EVERY targeted update too — otherwise a raw update (activate/markPastDue/…)
		// changes the row WITHOUT moving the counter, and a concurrent find→save with the same stale
		// version would pass its optimistic guard and clobber this change. Version monotonicity across
		// BOTH write styles is what makes the guard actually protect the row.
		await dbClient
			.update(subscription)
			.set({ ...set, version: sql`${subscription.version} + 1` })
			.where(where)
	}

	private toDomain(row: typeof subscription.$inferSelect): Subscription {
		// Rehydrate via the CONSTRUCTOR (not the `create` domain factory) so the row's stored `version`
		// reaches the entity — version is a BaseEntity infra prop, kept out of the domain factory's API.
		// Mirrors ChargeRepository.toDomain / the canonical rehydration pattern.
		return new Subscription({
			id: row.ownerId, // the entity id IS the ownerId (PK is owner_id)
			engineSubscriptionId: row.engineSubscriptionId,
			// Literal-union mirror → enum casts (see DrizzleChargeRepository.toDomain).
			planName: row.planName as unknown as PlanName,
			status: row.status as unknown as SubscriptionStatus,
			currentPeriodEnd: row.currentPeriodEnd ?? null,
			currentPeriodStart: row.currentPeriodStart ?? null,
			trialEnd: row.trialEnd ?? null,
			canceledAt: row.canceledAt ?? null,
			cancelAtPeriodEnd: row.cancelAtPeriodEnd ?? false,
			scheduledPlanName: (row.scheduledPlanName ?? null) as PlanName | null,
			version: row.version,
		})
	}

	private toPersistence(sub: Subscription): typeof subscription.$inferInsert {
		return {
			// The subscription's id IS the ownerId (the `billing_subscriptions` PK is `owner_id`).
			ownerId: sub.id.value,
			engineSubscriptionId: sub.engineSubscriptionId,
			planName: sub.planName,
			status: sub.status,
			currentPeriodEnd: sub.currentPeriodEnd,
			currentPeriodStart: sub.currentPeriodStart,
			trialEnd: sub.trialEnd,
			canceledAt: sub.canceledAt,
			cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
			scheduledPlanName: sub.scheduledPlanName,
			version: sub.version,
		}
	}
}
