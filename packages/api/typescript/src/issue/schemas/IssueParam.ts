import { z } from '@codedm/core-typescript'

/** The (ctx.ownerId, params.issueId) envelope every per-issue controller shares — declared ONCE. */
export const IssueParam = z.object({ ctx: z.object({ ownerId: z.uuid() }), params: z.object({ issueId: z.uuid() }) })
