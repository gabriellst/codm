// The ASK of an issue (fase 3, "emagrecer o grupo") — a decision or a question it puts to the group, and
// the answers to it. Wire shapes, not entities: the console (`POST /stops/:stopId/answer`), the cloud panel
// (`ANSWER_ASK`), the agent's tools (`AskDecision` / `AskQuestion`) and the `ask` of
// `integration.thread.stop_raised` all speak them, so they live in `shared/objects` — the barrel
// `registerSchemas` publishes as named OpenAPI components (one `AskAnswer` for every endpoint, never a
// per-endpoint copy).
//
// SECURITY (Non-Negotiable 4): registered means the full field set is public. Nothing here is sensitive,
// and on purpose there is NO `.refine()`: the cross-field invariants (option ids unique, a default that
// names an existing option, a question must carry a default, an effect escalates to a decision) are the
// domain's — the `StopAsk` value object of the `thread` context enforces them — and keeping these schemas
// plain is also what lets the tools' input schemas compose them with `.pick()` / `.extend()`.
import { z } from '@codm/core-typescript'
import { AskAnswerKind, AskEffect } from '@codm/contracts-typescript/wire/enums'
import type Z from 'zod'

/** The most options an ask may offer — a WhatsApp message lists them one per line. */
export const ASK_OPTIONS_MAX = 6
export const ASK_QUESTION_MAX = 1000
export const ASK_OPTION_LABEL_MAX = 200
/** The longest free-text answer (or text default). */
export const ASK_TEXT_MAX = 2000

const optionId = z.string().trim().min(1).max(40)
const answerText = z.string().trim().min(1).max(ASK_TEXT_MAX)

/** One choice of an ask: a stable id the answer names, and the label people read. */
export const AskOptionSchema = z.object({
	id: optionId,
	label: z.string().trim().min(1).max(ASK_OPTION_LABEL_MAX),
})
export type AskOption = Z.output<typeof AskOptionSchema>

// The two members every answer-shaped union is made of — declared once, composed below.
const optionChoice = z.object({ kind: z.literal(AskAnswerKind.OPTION), optionId })
const textChoice = z.object({ kind: z.literal(AskAnswerKind.TEXT), text: answerText })

/**
 * What a question goes on with when nobody answers by its deadline — a discriminated union, never
 * `defaultOptionId | defaultText` as two optionals (Non-Negotiable 3).
 */
export const AskDefaultSchema = z.discriminatedUnion('kind', [optionChoice, textChoice])
export type AskDefault = Z.output<typeof AskDefaultSchema>

/**
 * What an issue asks. `default` is the question's (absent on a decision); `effects` is DECLARED by the
 * issue — empty when the answer authorizes nothing — and any effect makes it a decision answerable only by
 * someone who may release. `options` is empty when the answer is free text.
 */
export const StopAskSchema = z.object({
	question: z.string().trim().min(1).max(ASK_QUESTION_MAX),
	options: z.array(AskOptionSchema).max(ASK_OPTIONS_MAX),
	default: AskDefaultSchema.optional(),
	effects: z.array(z.enum(AskEffect)),
	/** The thread participant the issue is talking to — absent ⇒ whoever wrote the message it came from. */
	addresseeId: z.string().min(1).optional(),
})
export type StopAsk = Z.output<typeof StopAskSchema>

/** A PERSON's answer to an ask — what the console and the panel accept. */
export const AskAnswerSchema = z.discriminatedUnion('kind', [optionChoice, textChoice])
export type AskAnswer = Z.output<typeof AskAnswerSchema>

/**
 * The answer RECORDED on the stop: a person's, or the default that applied when the deadline passed.
 * `DEFAULT` is written only by the deadline job; no route accepts this schema as input.
 */
export const StopAnswerSchema = z.discriminatedUnion('kind', [
	optionChoice,
	textChoice,
	z.object({ kind: z.literal(AskAnswerKind.DEFAULT), default: AskDefaultSchema }),
])
export type StopAnswer = Z.output<typeof StopAnswerSchema>
