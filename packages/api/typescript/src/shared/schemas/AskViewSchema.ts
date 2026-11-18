import { z } from '@codm/core-typescript'
import { AskAnswerKind, StopKind } from '@codm/contracts-typescript/wire/enums'
import { ASK_OPTIONS_MAX, AskOptionSchema } from '@shared/objects'
import type Z from 'zod'

/**
 * HOW a person answers an ask (fase 3) — one button per option, or a text box when the ask offers none
 * (`StopAsk.options` empty means "answer in your own words"). A discriminated union, so a surface renders
 * the variant it is handed and never a form with every field optional (Non-Negotiable 3).
 */
export const AskReplySchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal(AskAnswerKind.OPTION), options: z.array(AskOptionSchema).min(1).max(ASK_OPTIONS_MAX) }),
	z.object({ kind: z.literal(AskAnswerKind.TEXT) }),
])
export type AskReply = Z.output<typeof AskReplySchema>

/**
 * An OPEN ask as a person sees it where they can answer it — the console's Needs-you card and the cloud
 * panel. Discriminated by the stop kind: a decision says whether only someone who may release answers it; a
 * question says what it goes on with, and when (absent until the message carrying it was delivered — the
 * clock starts there).
 *
 * Built on the daemon from the stop (`thread/utils/askView.ts`), so the console and the panel can never
 * disagree on what an ask offers. It carries NO address — neither the addressee nor who answered — because
 * it travels to the cloud: the code people quote, the question, and how to answer.
 */
export const AskViewSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal(StopKind.DECISION_REQUESTED),
		/** The code people quote back — `APP-12 · D1`. */
		code: z.string(),
		question: z.string(),
		reply: AskReplySchema,
		/** The answer authorizes something (publish, irreversible, client data): only someone who may release answers it. */
		releaseRequired: z.boolean(),
	}),
	z.object({
		kind: z.literal(StopKind.QUESTION_ASKED),
		code: z.string(),
		question: z.string(),
		reply: AskReplySchema,
		/** What the issue goes on with when nobody answers in time, as people read it. */
		defaultLabel: z.string(),
		/** When it goes on with the default — ISO instant; absent until the group received the question. */
		dueAt: z.string().optional(),
	}),
])
export type AskView = Z.output<typeof AskViewSchema>
