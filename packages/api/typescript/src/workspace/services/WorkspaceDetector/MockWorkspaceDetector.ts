import { injectable } from 'tsyringe-neo'
import { WorkspaceBadge } from '@codm/contracts-typescript/wire/enums'
import { WorkspaceDetector, type WorkspaceInspection } from './WorkspaceDetector'

/**
 * Test double — a canned, existing git-backed folder by default. Tests that need PATH_NOT_FOUND /
 * PATH_NOT_A_DIRECTORY override the binding with a stub (`testBed.override`) returning the shape
 * they want. Never touches the filesystem.
 */
@injectable()
export class MockWorkspaceDetector extends WorkspaceDetector {
	async inspect(_path: string): Promise<WorkspaceInspection> {
		return { exists: true, isDirectory: true, badges: [WorkspaceBadge.GIT] }
	}
}
