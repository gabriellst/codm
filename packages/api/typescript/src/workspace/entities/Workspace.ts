import { AggregateRoot, z } from '@template/core-typescript'
import type Z from 'zod'
import { WorkspaceBadge } from '@template/contracts-typescript/wire/enums'

/**
 * `Workspace` (BC2 Workspace Registry) — a local project folder the operator registered, plus its
 * detected traits. A deliberately thin aggregate: the only invariant with teeth (absolute-path
 * uniqueness) is DB-enforced + checked in `AddWorkspace`; badge detection is a Service the daemon
 * runs (FS/git probing), never a domain rule. Removal-while-WORKING is an application guard in
 * `RemoveWorkspace`, not an entity method.
 */
export const WorkspaceSchema = z.object({
	// The single constant operator — the ownerId axis is preserved but collapsed.
	ownerId: z.uuid(),
	// Absolute path selected via the native folder picker. Unique per owner (dedupe on add).
	path: z.string().trim().min(1),
	// Detected traits (GIT / CLAUDE_PROJECT). A folder may carry both or none.
	badges: z.array(z.enum(WorkspaceBadge)),
	addedAt: z.date(),
})

export type WorkspaceProps = Z.infer<typeof WorkspaceSchema>

export class Workspace extends AggregateRoot<typeof WorkspaceSchema> {
	static override schema = WorkspaceSchema

	static create(data: { ownerId: string; path: string; badges: WorkspaceBadge[] }): Workspace {
		return new Workspace({
			ownerId: data.ownerId,
			path: data.path,
			badges: data.badges,
			addedAt: new Date(),
		})
	}
}

export interface Workspace extends WorkspaceProps {}
