import { z } from '@codm/core-typescript'
import {
	ArtifactKind,
	AskAnswerKind,
	ClassificationMethod,
	IrreversibleActionKind,
	IssueControlSource,
	IssueSignalLevel,
	IssueTimelineItemKind,
	NudgeSource,
	OutputRouting,
	PublishRunOutcome,
	RegretWindowOutcome,
	StopKind,
	StopResolution,
	SupervisorVerdict,
	SuspicionReason,
	TranscriptKind,
} from '@codm/contracts-typescript/wire/enums'
import type Z from 'zod'
import { AskOptionSchema } from '@shared/objects'

/**
 * One closed REGRET WINDOW (fase 2, item 3): which irreversible action waited, how it ended, and for how
 * long it was held (0 = cancelled before waiting). Shared because two contexts speak it: `agent` records
 * it as a fact (`agent.regret_window_closed`), and `issue` reads that fact back into the timeline — the
 * kind of action, never the command line, which can carry a credential.
 */
export const RegretWindowSchema = z.object({
	actionKind: z.enum(IrreversibleActionKind),
	outcome: z.enum(RegretWindowOutcome),
	waitedMs: z.number().int().nonnegative(),
})

/**
 * One run of a workspace's declared PUBLISH COMMAND (fase 4, item 6c): how it ended, its exit code when it
 * ran to an exit, and how long it took. Shared because two contexts speak it: `agent` records it as a fact
 * (`agent.publish.ran`), and `issue` reads that fact back into the timeline. NEVER the command line nor its
 * output — the timeline reaches the cloud panel, and an argument can carry a credential; the output stays in
 * the task's local terminal log, linked to this item by `issue_terminal_lines.timeline_item_id`.
 */
export const PublishRunSchema = z.object({
	outcome: z.enum(PublishRunOutcome),
	exitCode: z.number().int().optional(),
	/** Absent only when nobody saw the run end (`UNKNOWN`: the daemon stopped between the spawn and the record). */
	durationMs: z.number().int().nonnegative().optional(),
})

/**
 * Fase 5 — the three moments the autonomy work adds, each shared for the same reason as `PublishRunSchema`: `agent`
 * records it as a fact and `issue` reads that fact back into the timeline. The facts (`agent.issue.nudged`,
 * `agent.mailbox.retry_scheduled`, `agent.supervisor.reviewed`) compose these shapes, keyed on the issue
 * (`entity_id`), so the reader parses exactly what the producer wrote.
 *  - NUDGE: which nudge of the episode (1 declare, 2 finish the step and declare) and who sent it. The timeline item
 *    adds `outOf` — how many nudges an episode gets before the stall (`NUDGES_BEFORE_STALL`), declared by the reader so
 *    no screen hard-codes the "de 2".
 *  - RETRY: attempt n of max, and when the next one runs (ISO instant) — never the error's text.
 *  - SUPERVISOR REVIEW: why the supervisor looked and what it decided. Only an ACTED verdict reaches the timeline.
 */
export const NudgeMarkSchema = z.object({ ordinal: z.number().int().min(1), source: z.enum(NudgeSource) })
export const RetryScheduledSchema = z.object({
	attempt: z.number().int().min(1),
	maxAttempts: z.number().int().min(1),
	retryAt: z.string(),
})
export const SupervisorReviewSchema = z.object({ reason: z.enum(SuspicionReason), verdict: z.enum(SupervisorVerdict) })

const at = z.string()
/** Stable per item — the source row (event, entry, queue item, artifact, stop), so a list key never shifts. */
const id = z.string()

/**
 * One moment of an issue's life — the wire shape of an issue TIMELINE item. A DISCRIMINATED union on
 * `kind`: each kind carries only its own fields, and every renderer handles each member on its own
 * (Non-Negotiable 3), never an all-optional row.
 *
 * Shared because two contexts speak it: `issue` assembles it on the daemon (`GetIssueTimeline`), and the
 * cloud `panel` stores and serves it verbatim to the per-group web panel. One declaration, both sides.
 */
export const IssueTimelineItemSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal(IssueTimelineItemKind.CREATED), id, at, title: z.string() }),
	z.object({ kind: z.literal(IssueTimelineItemKind.TURN_STARTED), id, at }),
	z.object({
		kind: z.literal(IssueTimelineItemKind.MESSAGE),
		id,
		at,
		entryId: z.uuid(),
		transcriptKind: z.enum(TranscriptKind),
		text: z.string(),
		classification: z.enum(ClassificationMethod).optional(),
		/**
		 * What the issue said and where the output policy sent it (fase 3, item 2) — present on what an issue
		 * SAID (`level`) and where it went (`routing`: the group, a digest, or only the panel). Absent on every
		 * other message, and on rows the cloud stored before fase 3.
		 */
		level: z.enum(IssueSignalLevel).optional(),
		routing: z.enum(OutputRouting).optional(),
		/**
		 * The artifact this message delivered, when it delivered one — the ARTIFACT item shows the file, so a
		 * surface can fold the two into one. Optional: rows the cloud stored before it are still valid.
		 */
		artifactId: z.uuid().optional(),
	}),
	z.object({
		kind: z.literal(IssueTimelineItemKind.STEER),
		id,
		at,
		text: z.string(),
		deliveredAt: z.string().optional(),
		readAt: z.string().optional(),
		/** The automatic declaration reminder, not something a person sent. */
		reminder: z.boolean(),
		/**
		 * True when the queue gave up on the steer (poisoned) — it never reached the agent. Optional: rows the
		 * cloud stored before it are still valid (and read as not failed).
		 */
		failed: z.boolean().optional(),
	}),
	z.object({
		kind: z.literal(IssueTimelineItemKind.ARTIFACT),
		id,
		at,
		artifactId: z.uuid(),
		artifactKind: z.enum(ArtifactKind),
		name: z.string(),
	}),
	z.object({
		kind: z.literal(IssueTimelineItemKind.STOP_RAISED),
		id,
		at,
		stopId: z.uuid(),
		stopKind: z.enum(StopKind),
		title: z.string(),
		/**
		 * The ASK, when the stop is a decision or a question (fase 3): the code people quote, the question,
		 * its options and — for a question once delivered — when it goes on with its default. One object,
		 * present or absent as a whole. Optional also for compatibility: the cloud stores rows written by
		 * daemons that never sent it.
		 */
		ask: z.object({ code: z.string(), question: z.string(), options: z.array(AskOptionSchema), dueAt: z.string().optional() }).optional(),
	}),
	z.object({
		kind: z.literal(IssueTimelineItemKind.STOP_RESOLVED),
		id,
		at,
		stopId: z.uuid(),
		resolution: z.enum(StopResolution),
		/**
		 * What was answered (fase 3) — an option's label or the text, or the default it went on with
		 * (`kind: DEFAULT`). Never WHO answered: this item travels to the cloud panel, and the answerer is a
		 * WhatsApp address on this machine.
		 */
		answer: z.object({ kind: z.enum(AskAnswerKind), label: z.string() }).optional(),
	}),
	z.object({ kind: z.literal(IssueTimelineItemKind.COMPLETED), id, at }),
	z.object({ kind: z.literal(IssueTimelineItemKind.ARCHIVED), id, at }),
	// Pausa como comando (fase 2, item 2): who held the work, and from where — absent `by` when the
	// console session carried no profile name.
	z.object({ kind: z.literal(IssueTimelineItemKind.PAUSED), id, at, source: z.enum(IssueControlSource), by: z.string().optional() }),
	z.object({ kind: z.literal(IssueTimelineItemKind.RESUMED), id, at, source: z.enum(IssueControlSource), by: z.string().optional() }),
	// Janela de arrependimento (fase 2, item 3): the session waited before a push/merge/publish/deploy.
	z.object({ kind: z.literal(IssueTimelineItemKind.REGRET_WINDOW), id, at, ...RegretWindowSchema.shape }),
	// Lote (fase 4, item 5): item `n` of the conversation's batch `batchCode` (`L-31`) was sent to this issue.
	z.object({ kind: z.literal(IssueTimelineItemKind.BATCH_LINKED), id, at, batchCode: z.string(), n: z.number().int().min(1) }),
	// "Pode publicar" (fase 4, item 6c): the workspace's declared publish command ran — outcome only.
	z.object({ kind: z.literal(IssueTimelineItemKind.PUBLISH_RAN), id, at, ...PublishRunSchema.shape }),
	// Empurrão (fase 5, item 1): the task ended a turn without declaring anything and got nudge `ordinal` — shown in
	// place of the reminder's STEER.
	z.object({ kind: z.literal(IssueTimelineItemKind.NUDGED), id, at, ...NudgeMarkSchema.shape, outOf: z.number().int().min(1) }),
	// Nova tentativa (fase 5, item 2): a failed turn will be tried again — attempt `attempt` of `maxAttempts`, at `retryAt`.
	z.object({ kind: z.literal(IssueTimelineItemKind.RETRY_SCHEDULED), id, at, ...RetryScheduledSchema.shape }),
	// Supervisor (fase 5, item 3): it ACTED on the task — why it looked and what it decided (a verdict only
	// observed never reaches the timeline).
	z.object({ kind: z.literal(IssueTimelineItemKind.SUPERVISOR_REVIEWED), id, at, ...SupervisorReviewSchema.shape }),
])
export type IssueTimelineItem = Z.output<typeof IssueTimelineItemSchema>
