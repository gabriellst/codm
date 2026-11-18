import { describe, expect, it } from 'bun:test'
import { IrreversibleActionKind } from '@codm/contracts-typescript/wire/enums'
import { IRREVERSIBLE_ACTIONS, matchIrreversibleAction } from './irreversibleActions'

/**
 * THE TABLE OF IRREVERSIBLE COMMANDS (fase 2, item 3). Positives name their kind; negatives are the
 * near-misses a session runs all day and must never wait on.
 */
describe('matchIrreversibleAction', () => {
	it.each([
		['git push', IrreversibleActionKind.GIT_PUSH],
		['git push origin main', IrreversibleActionKind.GIT_PUSH],
		['git -C /repo push -u origin feat/x', IrreversibleActionKind.GIT_PUSH],
		['git --no-pager push', IrreversibleActionKind.GIT_PUSH],
		['cd repo && git push', IrreversibleActionKind.GIT_PUSH],
		['bash -c "git push origin main"', IrreversibleActionKind.GIT_PUSH],
		['git push --force', IrreversibleActionKind.GIT_FORCE_PUSH],
		['git push -f origin main', IrreversibleActionKind.GIT_FORCE_PUSH],
		['git push --force-with-lease origin feat', IrreversibleActionKind.GIT_FORCE_PUSH],
		['git push origin +main', IrreversibleActionKind.GIT_FORCE_PUSH],
		['gh pr merge 42 --squash --delete-branch', IrreversibleActionKind.PR_MERGE],
		['glab mr merge 7', IrreversibleActionKind.PR_MERGE],
		['gh release create v1.2.0 --notes "x"', IrreversibleActionKind.RELEASE],
		['npm publish', IrreversibleActionKind.PACKAGE_PUBLISH],
		['pnpm publish --access public', IrreversibleActionKind.PACKAGE_PUBLISH],
		['bun publish', IrreversibleActionKind.PACKAGE_PUBLISH],
		['yarn npm publish', IrreversibleActionKind.PACKAGE_PUBLISH],
		['cargo publish', IrreversibleActionKind.PACKAGE_PUBLISH],
		['twine upload dist/*', IrreversibleActionKind.PACKAGE_PUBLISH],
		['railway up', IrreversibleActionKind.DEPLOY],
		['railway redeploy --yes', IrreversibleActionKind.DEPLOY],
		['wrangler deploy', IrreversibleActionKind.DEPLOY],
		['npx wrangler pages deploy ./dist', IrreversibleActionKind.DEPLOY],
		['vercel --prod', IrreversibleActionKind.DEPLOY],
		['vercel deploy --prod', IrreversibleActionKind.DEPLOY],
		['netlify deploy --dir dist --prod', IrreversibleActionKind.DEPLOY],
		['fly deploy', IrreversibleActionKind.DEPLOY],
		['firebase deploy --only hosting', IrreversibleActionKind.DEPLOY],
		// Judged per command: the dry run before `&&` is harmless, the publish after it is not.
		['git push --dry-run && npm publish', IrreversibleActionKind.PACKAGE_PUBLISH],
	])('%s → %s', (command, kind) => {
		expect(matchIrreversibleAction(command)).toBe(kind)
	})

	it.each([
		['git status'],
		['git commit -m "prepare push"'],
		['git pull --rebase'],
		['git fetch origin'],
		['git push --dry-run'],
		['git push -n origin main'],
		['npm publish --dry-run'],
		['gh pr view 42'],
		['gh pr create --fill'],
		['gh release view v1'],
		['bun run build'],
		['vercel deploy'],
		['vercel env pull'],
		['netlify deploy --dir dist'],
		['wrangler dev'],
		['railway logs'],
		['./scripts/git-push-helper.sh --check'],
		['cat docs/npm-publish.md'],
	])('%s → not irreversible', command => {
		expect(matchIrreversibleAction(command)).toBeUndefined()
	})

	it('every kind of the contract has at least one pattern', () => {
		const covered = new Set(IRREVERSIBLE_ACTIONS.map(p => p.kind))
		expect([...covered].sort()).toEqual(Object.values(IrreversibleActionKind).sort())
	})

	it('the forced push is judged before the push — order is part of the table', () => {
		const kinds = IRREVERSIBLE_ACTIONS.map(p => p.kind)
		expect(kinds.indexOf(IrreversibleActionKind.GIT_FORCE_PUSH)).toBeLessThan(kinds.indexOf(IrreversibleActionKind.GIT_PUSH))
	})
})
