import { z } from '@codm/core-typescript'
import { AgentRunIdentityCtxSchema } from './AgentRunIdentity'

/**
 * The envelope of every tool an ISSUE speaks through (fase 3, item 1: `AskDecision`, `AskQuestion`,
 * `RequestFeedback`, `ReportProgress`) — declared once. `ctx` composes the run identity so Zod does not
 * strip it (its `issueId` is who is calling — the hold gate and the scope check); `params` name the issue
 * the call is about, which the MCP router compares against the run's claims.
 */
export const IssueDoorCtxSchema = z.object({ ownerId: z.uuid() }).extend(AgentRunIdentityCtxSchema.shape)
export const IssueDoorParamsSchema = z.object({ threadId: z.uuid(), issueId: z.uuid() })
