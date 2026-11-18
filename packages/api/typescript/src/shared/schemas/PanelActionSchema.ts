import { z } from '@codm/core-typescript'
import {
	PanelActionKind,
	PanelActionOutcome as PanelActionOutcomeEnum,
	StopKind,
	StopResolution,
} from '@codm/contracts-typescript/wire/enums'
import type Z from 'zod'
import { AskAnswerSchema } from '@shared/objects'
import { AskViewSchema } from './AskViewSchema'

/** The longest instruction a person may send an issue from the panel. */
export const PANEL_STEER_MAX = 2000

const issueId = z.uuid()

/**
 * What an identified person asks for on the cloud panel (fase 2, item 6b) — a DISCRIMINATED union on
 * `kind` (Non-Negotiable 3): each kind carries only its own fields. The page builds one member per
 * button, the cloud validates and stores it verbatim, and the daemon executes it per member.
 *
 * Shared because three parties speak it: the cloud `panel` (controller + store), the daemon `thread`
 * (which executes what the roster pull hands it) and the page. One declaration, every side.
 */
export const PanelActionBodySchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal(PanelActionKind.PAUSE), issueId }),
	z.object({ kind: z.literal(PanelActionKind.RESUME), issueId }),
	z.object({ kind: z.literal(PanelActionKind.STEER), issueId, text: z.string().trim().min(1).max(PANEL_STEER_MAX) }),
	z.object({ kind: z.literal(PanelActionKind.ANSWER_STOP), issueId, stopId: z.uuid(), resolution: z.enum(StopResolution) }),
	// Fase 3 — answering an issue's ask (a decision or a question) with one of its options or free text:
	// the same `AskAnswer` the console posts, so every door speaks one answer.
	z.object({ kind: z.literal(PanelActionKind.ANSWER_ASK), issueId, stopId: z.uuid(), answer: AskAnswerSchema }),
])
export type PanelActionBody = Z.output<typeof PanelActionBodySchema>

/** An action as the cloud hands it to the daemon: who asked (opaque member id), where, and what. */
export const PanelActionDeliverySchema = z.object({
	actionId: z.uuid(),
	threadId: z.uuid(),
	memberId: z.string(),
	action: PanelActionBodySchema,
})
export type PanelActionDelivery = Z.output<typeof PanelActionDeliverySchema>

/**
 * What the daemon did with an action — reported on its next pull. REFUSED carries the error CODE only
 * (never the message, which can carry ids).
 */
export const PanelActionOutcomeSchema = z.object({
	actionId: z.uuid(),
	status: z.enum(PanelActionOutcomeEnum),
	code: z.string().max(80).optional(),
})
export type PanelActionOutcome = Z.output<typeof PanelActionOutcomeSchema>

/**
 * An OPEN stop of one issue that the panel may answer, with the answers it admits there — computed on the
 * daemon from the thread's own per-kind table, so the cloud never re-derives it.
 *
 * `ask` (fase 3): the stop is an issue's decision or question — its code, the question, how to answer it
 * (`ANSWER_ASK`) and, for a decision, whether only someone who may release answers it. The same view the
 * console's Needs-you card shows, built on the daemon; it carries no address. Optional: a stop without an
 * ask has none, and the cloud deploys first, so a roster from an older daemon still validates.
 */
export const PanelOpenStopSchema = z.object({
	stopId: z.uuid(),
	issueId: z.uuid(),
	kind: z.enum(StopKind),
	resolutions: z.array(z.enum(StopResolution)).max(8),
	ask: AskViewSchema.optional(),
})
export type PanelOpenStop = Z.output<typeof PanelOpenStopSchema>
