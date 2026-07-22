import { pgSchema, uuid, text, timestamp, integer, boolean, index } from 'drizzle-orm/pg-core'
// Enum column type — single-sourced from the generated wire binding (type-only, erased at compile).
import type { OwnerKind } from '../../generated/typescript/src/wire/enums'

/**
 * `owner` is the generic tenancy schema — the single axis of multi-tenancy.
 *
 * An Owner is the tenant: every canonical row is scoped to an `owner_id`. The
 * aggregate is deliberately thin (id == ownerId, a `kind` discriminator, and the
 * `responsible_user_id` that answers for it); rich per-product identity lives in
 * a product profile or billing profile, never here.
 *
 * The base models a SINGLE responsible user per Owner (D2). Multi-user tenancy —
 * a User↔Owner join with a role per pair, plus email invitations — is a Tier-3
 * exemplar (the multi-user tenant example under `examples/`), not base schema.
 *
 * Tables:
 *   - `owners` — the tenant aggregate
 */
export const ownerSchema = pgSchema('owner')

export const owners = ownerSchema.table(
	'owners',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		// Human-readable tenant name (e.g. "Acme Co"). Mutable.
		name: text('name').notNull(),

		// Tenant discriminator — the OwnerKind wire enum (generic placeholder values
		// ORGANIZATION | INDIVIDUAL). Stored as text (repo convention, never pgEnum).
		kind: text('kind').$type<OwnerKind>().notNull(),

		// The single user who answers for this tenant (billing, ownership).
		responsibleUserId: uuid('responsible_user_id').notNull(),

		// Optional avatar/logo for the tenant.
		pictureUrl: text('picture_url'),

		// IANA timezone (e.g. "America/Sao_Paulo"). Optional on the thin aggregate.
		timezone: text('timezone'),

		// Soft-disable flag. Cascade-quarantines ingest + queries downstream.
		isDisabled: boolean('is_disabled').notNull().default(false),
		disabledReason: text('disabled_reason'),

		// Audit / optimistic concurrency.
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		version: integer('version').notNull().default(1),
	},
	t => ({
		// No global uniqueness on Owner name — only the id is canonical.
		isDisabledIdx: index('owners_is_disabled_idx').on(t.isDisabled),
		responsibleUserIdx: index('owners_responsible_user_id_idx').on(t.responsibleUserId),
	}),
)
