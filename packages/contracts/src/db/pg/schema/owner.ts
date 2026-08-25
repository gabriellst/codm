import { pgSchema, text, integer, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { OwnerKind, OnboardingStep } from '../../../../generated/typescript/src/wire/enums'
import { enumCheck } from './_enum'

/**
 * `owner_*` no dialeto **pg** — o eixo genérico de tenancy: toda linha canônica é escopada a um
 * `owner_id`.
 *
 * Este contexto é **cloud-only** na `PLACEMENT` (ADR 0002), e é por isso que ele aparece neste
 * tronco. A cópia SQLite em `db/schema/owner.ts` continua existindo porque o daemon local ainda
 * carrega a forma para leitura — mas quem ESCREVE `owner` é a nuvem.
 */

/** O namespace nativo do contexto — ver o docblock de `auth.ts` para o porquê da T1.9. */
export const ownerSchema = pgSchema('owner')

export const owners = ownerSchema.table(
	'owners',
	{
		id: text('id').primaryKey(),

		name: text('name').notNull(),

		// OwnerKind wire enum (ORGANIZATION | INDIVIDUAL). text + CHECK.
		kind: text('kind').$type<OwnerKind>().notNull(),

		responsibleUserId: text('responsible_user_id').notNull(),
		pictureUrl: text('picture_url'),
		timezone: text('timezone'),

		isDisabled: boolean('is_disabled').notNull().default(false),
		disabledReason: text('disabled_reason'),

		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		version: integer('version').notNull().default(1),
	},
	t => [
		enumCheck('owner_owners_kind_check', t.kind, Object.values(OwnerKind)),
		index('owners_is_disabled_idx').on(t.isDisabled),
		index('owners_responsible_user_id_idx').on(t.responsibleUserId),
	],
)

/**
 * `owner_onboardings` — uma linha por operador. Guarda a JORNADA, nunca o mundo: a satisfação dos
 * passos de setup é derivada por consulta de existência a cada leitura, e pré-condição do sistema
 * não é assunto do servidor.
 */
export const onboardings = ownerSchema.table(
	'onboardings',
	{
		id: text('id').primaryKey(),

		// Uma linha por dono — o índice único é o que garante a AC-3.
		ownerId: text('owner_id').notNull(),

		// OnboardingStep wire enum. text + CHECK, mesma forma de `owner_owners.kind`.
		currentStep: text('current_step').$type<OnboardingStep>().notNull(),

		// NULL = não concluído. É o único fato que barra a API.
		completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),

		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		version: integer('version').notNull().default(1),
	},
	t => [
		enumCheck('owner_onboardings_current_step_check', t.currentStep, Object.values(OnboardingStep)),
		uniqueIndex('onboardings_owner_id_idx').on(t.ownerId),
	],
)
