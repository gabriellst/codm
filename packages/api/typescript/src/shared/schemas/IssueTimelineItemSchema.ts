import { z } from '@codm/core-typescript'
import {
	ArtifactKind,
	ClassificationMethod,
	IssueTimelineItemKind,
	StopKind,
	StopResolution,
	TranscriptKind,
} from '@codm/contracts-typescript/wire/enums'
import type Z from 'zod'

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
])
export type IssueTimelineItem = Z.output<typeof IssueTimelineItemSchema>
