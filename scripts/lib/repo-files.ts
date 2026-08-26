// scripts/lib/repo-files.ts — the repo's file corpus, as a gate must see it.
//
// `git ls-files` alone lists only TRACKED files. Every scanner built on it under-reports for the
// entire window in which the work is untracked — which is exactly the window an agent is writing
// new code in. Measured on the mira bootstrap (friction #55): `registry-scan` reported a clean
// tree while nine real violations sat in untracked files; the same nine surfaced the moment the
// first commit landed. A gate that goes quiet precisely while you are authoring is worse than no
// gate, because the silence reads as approval.
//
// `--cached --others --exclude-standard` is the whole fix: tracked PLUS untracked, with
// .gitignore still honored — so build outputs, node_modules and `.claude/worktrees/` stay out
// exactly as before. On a clean tree the two spellings return the identical set (measured here:
// 3656 = 3656), which is why the defect was invisible until someone scanned mid-authoring.

import { execFileSync } from 'node:child_process'

/**
 * Repo-relative paths of every file git would consider part of the working tree: tracked files
 * plus untracked-but-not-ignored ones. Pass `pathspecs` to narrow (same syntax as `git ls-files`).
 *
 * Deleted-but-still-tracked paths are filtered out by `--exclude-standard` semantics only for the
 * untracked side, so callers that read the files must still tolerate a missing path.
 */
export function repoFiles(cwd: string, pathspecs: readonly string[] = []): string[] {
	const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', ...pathspecs], {
		cwd,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	})
	// `--cached --others` can list the same path twice when a tracked file also appears untracked
	// (case-insensitive filesystems); dedupe so callers never scan a file twice.
	return [...new Set(out.split('\n').filter(Boolean))].sort()
}
