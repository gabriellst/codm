import 'reflect-metadata'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

/**
 * NODE_ENV IS PART OF THE HARNESS CONTRACT — assert it before anything else evaluates.
 *
 * `bun test` sets `NODE_ENV=test` on its own (measured). The root `.env` sets
 * `NODE_ENV=development`, and an inherited value WINS over bun's default — so this suite had two
 * different meanings depending on where it was launched from:
 *
 *   bun test        (from packages/app/react)  → NODE_ENV=test         → 270 pass, 6.95s
 *   bun run test    (nx, launched at the root) → NODE_ENV=development  → 267 pass / 3 FAIL, 15.9s
 *
 * Measured 2026-08-18 by bisecting the root `.env`: `VITE_API_URL` alone changes nothing;
 * `NODE_ENV=development` alone reproduces all three failures and the 2.3× slowdown. React,
 * Storybook's `composeStories` and msw all branch on `NODE_ENV`, so a dev-mode module graph is
 * simply a different program under test.
 *
 * This was previously diagnosed as a "load-sensitive flake" (the failures move between runs, and one
 * of them lands within milliseconds of a timeout, which is a very convincing disguise). It is not
 * flaky: it is deterministic and single-cause. The cure is to make the environment explicit
 * (`project.json` pins `NODE_ENV=test` for the target) and to make its violation LOUD here — one
 * sentence naming the cause, instead of three unrelated-looking assertion failures that send the
 * reader hunting through Storybook and msw.
 */
if (process.env.NODE_ENV !== 'test') {
	throw new Error(
		`[tests/setup] NODE_ENV is "${process.env.NODE_ENV}", expected "test".\n` +
			`This suite is only meaningful under NODE_ENV=test — React/Storybook/msw resolve a different\n` +
			`module graph otherwise, and exactly 3 story tests fail with unrelated-looking errors.\n` +
			`Almost certainly the root .env (NODE_ENV=development) was inherited by this process; the nx\n` +
			`target pins NODE_ENV=test for this reason. If you launched bun test by hand from the repo\n` +
			`root, run it from packages/app/react or prefix it with NODE_ENV=test.`,
	)
}

/**
 * A DOM for the console's tests, registered as a bun PRELOAD (see `bunfig.toml`) so it exists before
 * any module — React's included — is evaluated.
 *
 * Why a DOM at all, when four of the five existing suites are happy without one: the console's
 * real-time layer is not a pure function. `useServerEventSource` re-dispatches every SSE frame as a
 * `document` CustomEvent and `useServerEvents` subscribes with `document.addEventListener`, so the
 * only way to assert "the frame arrived and the right query went stale" is to let a component mount,
 * dispatch the event the transport would dispatch, and watch what happens. Asserting the mapping
 * function alone would leave exactly the seam that has broken here before: a subscription to a name
 * that never fires is invisible to a test of the map.
 *
 * `reflect-metadata` is FIRST, above even the DOM registration: the integration harness
 * (`@codm/api-typescript/testing`, spec Decision 5) dynamically imports backend context modules whose
 * classes carry tsyringe-neo decorators — those are evaluated at import time, so the polyfill must
 * already be installed before ANY test file (which may import the harness) is evaluated.
 */
GlobalRegistrator.register()

/**
 * THE INTEGRATION HARNESS'S PORT, chosen HERE and not inside the harness itself (spec Decision 5/6 —
 * see the wiring note in `packages/api/typescript/tests/support/integration-server.ts`, point 2).
 *
 * `@codm/core-typescript`'s `Config` is parsed EAGERLY at module-evaluation time
 * (`Config = { env: EnvSchema.parse(process.env) }`), and ES-module import hoisting means the FIRST
 * static import of that package anywhere in a test file's module graph (often `@test/support/given`,
 * pulled in before `./support/integration-harness`) freezes `Config.env.API_PORT` before any runtime
 * code in that file gets a chance to set it. This PRELOAD is the one place guaranteed to run before
 * every test file's module graph is evaluated — so the port is selected here, once per `bun test`
 * process, whether or not the file under test ever touches the harness (an unused env var is
 * harmless). A random high port avoids colliding with a `bun dev` daemon's default (3030).
 */
process.env.API_PORT ??= String(30000 + Math.floor(Math.random() * 20000))
process.env.NODE_ENV ??= 'test'

/**
 * React only runs `act()` for real when it is told it is in a test environment; without this it warns
 * "the current testing environment is not configured to support act(...)" and does NOT flush effects —
 * which would leave a subscription test green because nothing ever subscribed.
 */
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
