import { z } from '@codedm/core-typescript'

/** The (ctx.ownerId, params.threadId) envelope every per-thread controller shares — declared ONCE. */
export const ThreadParam = z.object({ ctx: z.object({ ownerId: z.uuid() }), params: z.object({ threadId: z.uuid() }) })
