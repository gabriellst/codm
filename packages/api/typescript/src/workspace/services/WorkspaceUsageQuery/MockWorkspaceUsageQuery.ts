import { injectable } from 'tsyringe-neo'
import { WorkspaceUsageQuery } from './WorkspaceUsageQuery'

/** Test double — no working issues by default. The WORKSPACE_IN_USE path overrides with a stub. */
@injectable()
export class MockWorkspaceUsageQuery extends WorkspaceUsageQuery {
	async hasWorkingIssues(_workspaceId: string): Promise<boolean> {
		return false
	}
}
