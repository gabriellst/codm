/**
 * Side-effecting EARLY boot guard — imported by src/index.ts BEFORE the composition root.
 *
 * `CODEDM_E2E=true` flips two hermetic test seams in the `real` binding column (shared/registry.ts):
 *   1. the ExternalMediator drops from RedisExternalMediator to the in-process EventEmitter2Mediator
 *      (no cross-process transport — the Go gateway is simulated at the integration-event seam), and
 *   2. the test-only ingress controller (TestIngressController) is mounted, letting a spec publish a
 *      gateway integration event over HTTP.
 *
 * Both are for the Playwright harness only. Booting a PRODUCTION daemon with the flag set would run
 * the operator's real stack with an in-process mediator (silently cutting it off from the Go gateway)
 * AND expose an unauthenticated event-injection endpoint. Refuse it loudly — fail CLOSED — rather than
 * let a stray env var degrade production. Every other environment (dev, test, e2e) is permitted.
 */
import { Config } from '@codedm/core-typescript'

if (process.env.CODEDM_E2E === 'true' && Config.env.NODE_ENV === 'production') {
	throw new Error(
		'CODEDM_E2E=true is refused under NODE_ENV=production — it binds an in-process ExternalMediator and ' +
			'mounts an unauthenticated test ingress endpoint, both hermetic-test-only seams. Unset CODEDM_E2E to boot production.',
	)
}
