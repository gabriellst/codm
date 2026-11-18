import { z } from '@codm/core-typescript'
import {
	ArtifactKind,
	ClassificationMethod,
	IrreversibleActionKind,
	IssueControlSource,
	IssueTimelineItemKind,
	RegretWindowOutcome,
	StopKind,
	StopResolution,
	TranscriptKind,
} from '@codm/contracts-typescript/wire/enums'
import type Z from 'zod'

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
	}),
	z.object({
		kind: z.literal(IssueTimelineItemKind.ARTIFACT),
		id,
		at,
		artifactId: z.uuid(),
		artifactKind: z.enum(ArtifactKind),
		name: z.string(),
	}),
	z.object({ kind: z.literal(IssueTimelineItemKind.STOP_RAISED), id, at, stopId: z.uuid(), stopKind: z.enum(StopKind), title: z.string() }),
	z.object({ kind: z.literal(IssueTimelineItemKind.STOP_RESOLVED), id, at, stopId: z.uuid(), resolution: z.enum(StopResolution) }),
	z.object({ kind: z.literal(IssueTimelineItemKind.COMPLETED), id, at }),
	z.object({ kind: z.literal(IssueTimelineItemKind.ARCHIVED), id, at }),
	// Pausa como comando (fase 2, item 2): who held the work, and from where — absent `by` when the
	// console session carried no profile name.
	z.object({ kind: z.literal(IssueTimelineItemKind.PAUSED), id, at, source: z.enum(IssueControlSource), by: z.string().optional() }),
	z.object({ kind: z.literal(IssueTimelineItemKind.RESUMED), id, at, source: z.enum(IssueControlSource), by: z.string().optional() }),
	// Janela de arrependimento (fase 2, item 3): the session waited before a push/merge/publish/deploy.
	z.object({ kind: z.literal(IssueTimelineItemKind.REGRET_WINDOW), id, at, ...RegretWindowSchema.shape }),
])
export type IssueTimelineItem = Z.output<typeof IssueTimelineItemSchema>
