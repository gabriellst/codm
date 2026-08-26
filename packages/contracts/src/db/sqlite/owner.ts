import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { OwnerKind, OnboardingStep, ContactKind, ProviderKind } from '../../../generated/typescript/src/wire/enums'
import { enumCheck } from './_enum'

/**
 * Forma do rascunho persistido em `onboardings.state` — espelha `OnboardingDraftStateSchema`
 * (packages/api/typescript/src/ui/schemas/OnboardingDraftState.ts), a fonte de verdade em runtime.
 * Declarado estruturalmente aqui (não importado) porque `contracts` não pode depender de tipos da
 * camada api — mesmo raciocínio de `ThreadParticipant` em `thread.ts`.
 */
type OnboardingDraftState = {
	contactRef?: { channelId: string; externalId: string; displayName: string; kind: ContactKind }
	workspace?: { path?: string; existingWorkspaceId?: string }
	providers?: ProviderKind[]
}

/**
 * `owner` (pgSchema namespace) → `owner_*` table prefix. The generic tenancy axis:
 * every canonical row is scoped to an `owner_id`. SQLite-dialect mirror of
 * db/schema/owner.ts. Type map (decision (a)): uuid→text, timestamptz→integer
 * timestamp_ms, enum→text + CHECK.
 */
export const owners = sqliteTable(
	'owner_owners',
	{
		id: text('id').primaryKey(),

		name: text('name').notNull(),

		// OwnerKind wire enum (ORGANIZATION | INDIVIDUAL). text + CHECK.
		kind: text('kind').$type<OwnerKind>().notNull(),

		responsibleUserId: text('responsible_user_id').notNull(),
		pictureUrl: text('picture_url'),
		timezone: text('timezone'),

		isDisabled: integer('is_disabled', { mode: 'boolean' }).notNull().default(false),
		disabledReason: text('disabled_reason'),

		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
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
 * `owner_onboardings` — uma linha por operador (spec Decision 7, AC-3). Guarda a JORNADA, nunca o
 * mundo: a satisfação dos passos de setup é derivada por consulta de existência a cada leitura, e
 * pré-condição do sistema não é assunto do servidor.
 */
export const onboardings = sqliteTable(
	'owner_onboardings',
	{
		id: text('id').primaryKey(),

		// Uma linha por dono — o índice único é o que garante a AC-3.
		ownerId: text('owner_id').notNull(),

		// OnboardingStep wire enum. text + CHECK, mesma forma de `owner_owners.kind`.
		currentStep: text('current_step').$type<OnboardingStep>().notNull(),

		// O RASCUNHO — contactRef/workspace/providers coletados pelos passos WORKSPACE/CONTACT/AGENTS,
		// só materializados nos agregados de verdade (Workspace, Thread) no commit atômico de
		// `CompleteOnboarding` (spec 2026-08-26). NULL até o primeiro PATCH que carregue `state`; nunca
		// lido fora dessa transação de conclusão.
		state: text('state', { mode: 'json' }).$type<OnboardingDraftState>(),

		// NULL = não concluído. É o único fato que barra a API (spec Decision 10).
		completedAt: integer('completed_at', { mode: 'timestamp_ms' }),

		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		version: integer('version').notNull().default(1),
	},
	t => [
		enumCheck('owner_onboardings_current_step_check', t.currentStep, Object.values(OnboardingStep)),
		uniqueIndex('onboardings_owner_id_idx').on(t.ownerId),
	],
)
