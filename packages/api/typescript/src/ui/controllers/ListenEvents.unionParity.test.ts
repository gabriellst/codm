import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { REPO } from '../../../../../../template.config'

/**
 * The daemon's SSE controller composes the PRE-materialized union surface — it never joins the
 * manifests itself.
 *
 * ── WHY IT LIVES HERE AND NOT IN `tests/architecture/` ──────────────────────────────────────────
 *
 * It used to be the last `test()` of `tests/architecture/union-parity.test.ts`, and it was the one
 * leg of that rail that read a PRODUCT file by path
 * (`packages/api/typescript/src/ui/controllers/ListenEvents.ts`). Everything else in union-parity is
 * driven by the generated union manifests — "zero hand lists: declaring a new slot/variant in the
 * contract auto-extends every check" — so it travels to any product built on this template. This leg
 * did not: a fork without a `ui` context, or without an SSE surface, has no such controller, and the
 * read would ENOENT for a reason that has nothing to do with the union contract.
 *
 * The rule this repo applies to `givens` and to `PLACEMENT` applies to rails too: **a rail follows
 * its subject.** This one's subject is `ListenEvents.ts`, so it sits beside it and is pruned along
 * with the context that owns it — no allowlist, no stamp logic, nothing to remember.
 *
 * ── WHAT IT ACTUALLY GUARDS ─────────────────────────────────────────────────────────────────────
 *
 * The join primitives (`*PayloadSchema`, and any direct SDK import) must not reappear at the
 * controller layer. If they do, the controller has started re-deriving what the materialized surface
 * already gives it, and the two definitions can drift apart silently — the controller would keep
 * compiling while emitting a union the contract no longer describes.
 */

const ROOT = join(import.meta.dir, '..', '..', '..', '..', '..', '..')
const SDK_IMPORT_PREFIX = `from '${REPO.sdkPackage}`

describe('ListenEvents composes the pre-materialized union surface', () => {
	test('the daemon controller never joins manifests itself', () => {
		const listenEvents = readFileSync(join(ROOT, 'packages/api/typescript/src/ui/controllers/ListenEvents.ts'), 'utf-8')
		expect(listenEvents).toContain('materializedIntegrationEventSchemas')
		// The join primitives must not reappear at the controller layer.
		expect(listenEvents).not.toContain('PayloadSchema')
		expect(listenEvents).not.toContain(SDK_IMPORT_PREFIX)
	})
})
