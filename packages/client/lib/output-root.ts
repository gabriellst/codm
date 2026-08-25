import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Guard against mis-pathed generation. Every generator derives its output root from
 * `import.meta.dirname`, so a generator executed from a nested self-copy (a stray
 * `packages/client/packages/client/...` tree once shipped 3.4MB of gen output into the repo)
 * would silently write a nested dist tree instead of failing.
 *
 * Fail loud unless the resolved output root lives under `<repo>/packages/client/dist/`, where
 * `<repo>` is anchored independently by `template.config.ts` — only the real repo root has it;
 * a nested self-copy anchors to `packages/client/packages`, which does not.
 */
export function assertClientDistRoot(distRoot: string): string {
	const resolved = path.resolve(distRoot)
	const marker = `${path.sep}packages${path.sep}client${path.sep}dist${path.sep}`
	const idx = resolved.indexOf(marker)
	const repoRoot = idx === -1 ? undefined : resolved.slice(0, idx)
	if (repoRoot === undefined || !existsSync(path.join(repoRoot, 'template.config.ts'))) {
		throw new Error(
			`client generator output root does not resolve to <repo>/packages/client/dist: "${resolved}" ` +
				`(anchor ${repoRoot ? `"${path.join(repoRoot, 'template.config.ts')}" missing` : 'segment "packages/client/dist" not found'}) — ` +
				'are you running a nested self-copy of the generator? Delete the stray tree and run from packages/client.',
		)
	}
	return resolved
}
