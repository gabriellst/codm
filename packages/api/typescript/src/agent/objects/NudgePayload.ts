import { z } from '@codm/core-typescript'
import type Z from 'zod'
import { NudgeSource } from '@codm/contracts-typescript/wire/enums'

/**
 * HOW MANY NUDGES A QUIET TURN GETS before the sweep raises the visible block (fase 5, item 1): nudge 1 asks it to
 * declare, nudge 2 to finish the step it stopped in and then declare. The supervisor's resume counts as the last one
 * (`ordinal = NUDGES_BEFORE_STALL`), so a quiet turn after it is a `STALLED` straight away — never a new pair.
 */
export const NUDGES_BEFORE_STALL = 2

/**
 * WHICH NUDGE an automatic reminder is (fase 5, item 1) — declared in the payload of the item whose claim class is
 * `REMINDER`. WHAT the item is lives in the column (`claim_class`); its detail lives here, never in the dedup key.
 *  - `ordinal` — 1 (declare) or 2 (finish the step, then declare); the supervisor's resume is always the last one.
 *  - `rootItemId` — the consumed item whose silent turn opened the episode; absent on reminders migrated by 0038.
 *  - `source` — the reconciler or the supervisor.
 */
export const NudgePayloadSchema = z.object({
	nudge: z.object({
		ordinal: z.number().int().positive(),
		rootItemId: z.string().optional(),
		source: z.enum(NudgeSource),
	}),
})
export type NudgePayload = Z.output<typeof NudgePayloadSchema>
