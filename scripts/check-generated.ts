// scripts/check-generated.ts — the generated-in-sync gate (declarative-repo plan, F1b).
//
// Committed generated output (contracts wire bindings, the SDK dist, openapi.json) is an INEVITABLE
// redeclaration of its sources — so it is GATED: this script regenerates and fails if the committed
// copy drifted. The drift class bit the repo three times in one week (stale kubb hooks from purged
// domains, orphaned 7-value Language trees, a nested packages/client/packages accident).
//
// Usage: `bun check:generated` — regenerates (contracts codegen + bun sdk) then `git diff` on the
// generated roots; exit 1 with the dirty file list on drift. Run in CI and before releases. NOTE:
// intentionally NOT an architecture-rail test — a full regen is ~60s and would tax every bun test.
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { REPO } from '../template.config'

const ROOT = resolve(import.meta.dirname, '..')
const run = (cmd: string, cwd = ROOT) => execSync(cmd, { cwd, stdio: 'inherit' })

// The committed generated roots — derived from the workspace contract. A stamped copy's manifest
// declares only KEPT workspaces (create-template manifest closure), so absent roots drop out here
// instead of resolving to ghost paths.
const PKG: Partial<Record<keyof typeof REPO.packageRoots, string>> = REPO.packageRoots
const GENERATED_ROOTS = [
	PKG.contractsGenTs,
	PKG.contractsGenGo,
	PKG.clientTsDist && `${PKG.clientTsDist}/src`,
	PKG.apiTs && `${PKG.apiTs}/public/docs/openapi.json`,
	PKG.apiGo && `${PKG.apiGo}/public/docs/openapi.json`,
].filter((p): p is string => typeof p === 'string')

console.log('[check:generated] regenerating contracts wire bindings…')
// `codegen:wire` is the AGGREGATE the stamping relation maintains — create-template prunes the
// per-language scripts for deselected backends, so naming them here would crash a stamped copy.
run('bun run tsp:compile && bun run codegen:wire', resolve(ROOT, REPO.packageRoots.contracts))
console.log('[check:generated] regenerating SDK (openapi + kubb)…')
run('bun sdk')

const diff = execSync(`git status --porcelain -- ${GENERATED_ROOTS.join(' ')}`, { cwd: ROOT })
	.toString()
	.trim()
if (diff) {
	console.error('\n✗ committed generated output is OUT OF SYNC with its sources:')
	console.error(
		diff
			.split('\n')
			.map(l => `  ${l}`)
			.join('\n'),
	)
	console.error('\nCommit the regenerated output (or fix the source that drifted).')
	process.exit(1)
}
console.log('✓ generated output in sync (contracts bindings, SDK dist, openapi.json)')
