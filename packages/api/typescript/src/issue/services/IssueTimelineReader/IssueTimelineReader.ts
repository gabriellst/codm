import type { IssueTimelineItem } from '@shared/schemas'

/**
 * ONE ISSUE'S TIMELINE, as another context may read it (fase 5, item 3 — the supervisor looks at the last moments of
 * a suspect task before deciding). The assembly (`assembleIssueTimeline`, `issue/utils`) is this context's — a surface
 * other contexts may not import — so this service is the door to it; the console and the panel keep calling the
 * assembly directly from inside the context.
 */
export abstract class IssueTimelineReader {
	/** Everything that happened to the issue, oldest first — the same items the console and the panel show. */
	abstract timelineOf(issueId: string, title: string): Promise<IssueTimelineItem[]>
}
