import { z } from '@codm/core-typescript'
import type Z from 'zod'
import { StopResolution } from '@codm/contracts-typescript/wire/enums'

/**
 * The payload of the item a stop's resolution queues for its issue (`thread/handlers/ResumeIssueOnStopResolved`,
 * claim class `DECISION_ANSWER`) — DECLARED, so whoever claims it can tell which stop was resolved and how.
 *
 * `stopId` and `resolution` are fields (fase 4, S0c — revisão 2, crítico): before, the stop existed only inside the
 * dedup key (`resume:<stopId>`), and reading it back from there would be parsing a convention (Non-Negotiable 5).
 * The dedup key stays what it was — the idempotency of the fact, nothing else. Slice S11's dispatcher parses this
 * schema to decide whether the answer authorizes the workspace's publish command (`PUBLISH_AUTHORIZED_BY`).
 *
 * `issueId`/`threadId`/`key`/`title`/`text` are the steer shape every issue turn already renders.
 */
export const ResumeIssuePayloadSchema = z.object({
	issueId: z.string(),
	threadId: z.string(),
	key: z.string(),
	title: z.string(),
	/** What the resumed turn is told — the question, the answer, who answered. */
	text: z.string(),
	stopId: z.string(),
	resolution: z.enum(StopResolution),
})
export type ResumeIssuePayload = Z.output<typeof ResumeIssuePayloadSchema>
