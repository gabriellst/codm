import { injectable } from 'tsyringe-neo'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { WorkspaceBadge } from '@template/contracts-typescript/wire/enums'
import { WorkspaceDetector, type WorkspaceInspection } from './WorkspaceDetector'

/**
 * Real BC2 detector — probes the operator's filesystem. A `.git` directory earns the GIT badge; a
 * `CLAUDE.md` file or `.claude` directory earns CLAUDE_PROJECT. Bound only in `real` — tests use
 * `MockWorkspaceDetector` so the suite never touches disk.
 */
@injectable()
export class SystemWorkspaceDetector extends WorkspaceDetector {
	async inspect(path: string): Promise<WorkspaceInspection> {
		const top = await this.safeStat(path)
		if (!top) return { exists: false, isDirectory: false, badges: [] }
		if (!top.isDirectory()) return { exists: true, isDirectory: false, badges: [] }

		const badges: WorkspaceBadge[] = []
		if (await this.exists(join(path, '.git'))) badges.push(WorkspaceBadge.GIT)
		if ((await this.exists(join(path, 'CLAUDE.md'))) || (await this.exists(join(path, '.claude')))) {
			badges.push(WorkspaceBadge.CLAUDE_PROJECT)
		}
		return { exists: true, isDirectory: true, badges }
	}

	private async safeStat(path: string): Promise<import('node:fs').Stats | undefined> {
		try {
			return await stat(path)
		} catch {
			return undefined
		}
	}

	private async exists(path: string): Promise<boolean> {
		return (await this.safeStat(path)) !== undefined
	}
}
