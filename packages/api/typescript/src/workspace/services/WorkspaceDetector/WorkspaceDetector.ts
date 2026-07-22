import { WorkspaceBadge } from '@template/contracts-typescript/wire/enums'

/**
 * The result of probing a candidate folder: whether it exists, whether it is a directory, and the
 * detected trait badges (GIT / CLAUDE_PROJECT). Absolute-path dedupe + the WORKING-issue guard live
 * in the use cases; this service is pure FS/git detection.
 */
export interface WorkspaceInspection {
	exists: boolean
	isDirectory: boolean
	badges: WorkspaceBadge[]
}

/**
 * BC2 detection seam — the daemon runs OS filesystem/git probing here. A real implementation stats
 * the path and looks for `.git` + Claude-project markers; the test double returns canned traits so
 * no test touches the filesystem.
 */
export abstract class WorkspaceDetector {
	abstract inspect(path: string): Promise<WorkspaceInspection>
}
