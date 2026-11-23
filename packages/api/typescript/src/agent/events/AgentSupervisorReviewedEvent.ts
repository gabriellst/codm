import { BaseDomainEvent, z } from '@codm/core-typescript'
import { SupervisorReviewSchema } from '@shared/schemas'
import { SupervisorFallback } from '../enums/SupervisorFallback'
import { SupervisorMode } from '../enums/SupervisorMode'

export const AgentSupervisorReviewedEventSchema = z.domainEvent({
	issueId: z.string(),
	// Why the supervisor looked and what it decided — the shape the issue timeline reads back (`SupervisorReviewSchema`).
	...SupervisorReviewSchema.shape,
	/** What the model said of its own verdict, 0–1 — absent when no verdict came back. */
	confidence: z.number().min(0).max(1).optional(),
	/** The mode the pass ran in — what makes `acted: false` read as "observed" rather than "refused". */
	mode: z.enum(SupervisorMode),
	/** Whether the verdict was carried out. Only an acted verdict reaches the timeline. */
	acted: z.boolean(),
	/** Why the verdict fell back to `LEAVE`, when it did — never the model's words nor an error's text. */
	fallback: z.enum(SupervisorFallback).optional(),
	/**
	 * `RESTART_WITH_NOTES` carried out (fase 5, S5): whether the task's session row got the restart request — `false`
	 * when the task has no session yet (its next turn is fresh anyway, so the request is ignored and said so here).
	 */
	sessionRestarted: z.boolean().optional(),
})

/**
 * The supervisor LOOKED at a suspect task and decided (fase 5, item 3) — written for EVERY verdict, acted or not: the
 * audit trail of a supervisor the owner chose to have act from the installation on (20/11). `entityId` is the issue.
 *
 * Three readers: the cooldown (the same `(issue, reason)` is not looked at again for an hour), the per-task daily
 * ceilings (counted over `acted: true`), and the timeline (`SUPERVISOR_REVIEWED`, acted only). It carries no free text:
 * the model answers with a verdict and a confidence, and nothing it writes is kept or passed on.
 */
export class AgentSupervisorReviewedEvent extends BaseDomainEvent<typeof AgentSupervisorReviewedEventSchema> {
	static override readonly name = 'agent.supervisor.reviewed' as const
	static readonly schema = AgentSupervisorReviewedEventSchema
}
