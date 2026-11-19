// The declared PUBLISH COMMAND of a workspace (fase 4, item 6c) and what follows a successful run. Wire
// shapes the console's form (`PUT /workspaces/:workspaceId/publish-command`) and the issue's ask
// (`StopAsk.onPublished`) speak, so they live in `shared/objects` and are published as named components.
//
// SECURITY (Non-Negotiable 4 + spec "revisão 2"): the command itself may carry a credential in an argument,
// so it NEVER rides an MCP-exposed DTO — only the two console doors without `mcpScopes` carry it — and it
// never reaches the timeline, a fact or the cloud panel (those carry `PublishRunSchema`, in `shared/schemas`).
// No `.refine()`: the invariants (the command runs inside the workspace, without a shell) are the runner's.
import { z } from '@codm/core-typescript'
import { PublishFollowUpKind } from '@codm/contracts-typescript/wire/enums'
import type Z from 'zod'

/** The most arguments a publish command may have, executable included. */
export const PUBLISH_ARGV_MAX = 64
/** The longest single argument. */
export const PUBLISH_ARG_MAX = 4096

/**
 * A command as an ARGUMENT LIST, never a shell line: `argv[0]` is the executable and every other element
 * reaches it literally — no `sh -c`, no expansion, no quoting rules to get wrong.
 */
export const PublishCommandSchema = z.object({
	argv: z.array(z.string().min(1).max(PUBLISH_ARG_MAX)).min(1).max(PUBLISH_ARGV_MAX),
})
export type PublishCommand = Z.output<typeof PublishCommandSchema>

/** The longest summary a COMPLETE follow-up closes the task with. */
export const PUBLISH_SUMMARY_MAX = 2000

/**
 * What follows a SUCCEEDED publish run, as the ask declared it — a discriminated union on
 * `PublishFollowUpKind` (Non-Negotiable 3): complete the task with this summary, or tell the session.
 */
export const PublishFollowUpSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal(PublishFollowUpKind.COMPLETE), summary: z.string().trim().min(1).max(PUBLISH_SUMMARY_MAX) }),
	z.object({ kind: z.literal(PublishFollowUpKind.CONTINUE) }),
])
export type PublishFollowUp = Z.output<typeof PublishFollowUpSchema>
