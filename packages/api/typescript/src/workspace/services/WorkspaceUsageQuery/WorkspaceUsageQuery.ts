/**
 * BC2 → BC5 read seam: is any issue currently WORKING on this workspace? `RemoveWorkspace` uses it
 * to enforce the `WORKSPACE_IN_USE` guard. Modeled as a read Service (not a cross-context use-case
 * call) — it reads the issue/thread tables directly, keeping the write-model boundary intact.
 */
export abstract class WorkspaceUsageQuery {
	abstract hasWorkingIssues(workspaceId: string): Promise<boolean>
}
