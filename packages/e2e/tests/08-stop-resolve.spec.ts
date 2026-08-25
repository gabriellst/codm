import { test } from '../utils/test'

/**
 * Canonical flow (d) — stop raised → needs-you callout → resolve.  HONEST SKIP.
 *
 * A stop is raised by the terminal engine mid-session (approval-required / auth-required), surfaced as
 * `integration.thread.stop_raised`, which flips the issue to NEEDS_INPUT and drives the "needs you"
 * callout; `resolveStop` clears it. The hermetic harness cannot RAISE a stop: the `real` AgentRunner is
 * swapped for a deterministic stub (E2eStubAgentRunner) whose `stream()` yields canned output then a
 * clean `exit 0` — it never emits an approval/auth stop event, and there is no other seam that
 * produces one without a live provider CLI. Rather than assert a state the booted stack can never
 * reach, this flow is skipped with cause.
 *
 * To un-skip: extend E2eStubAgentRunner to emit a stop runtime-event on a sentinel prompt token (and
 * add a `/v1/_test/gateway` action to trigger it), then assert NEEDS_INPUT → getNeedsYouPanel →
 * resolveStop → back to WORKING. Deferred — it changes the ingress seam's contract, out of scope for
 * the harness rewire.
 */
test('stop raised → needs-you callout → resolve', async () => {
	// biome-ignore lint/suspicious/noSkippedTests: intentional HONEST SKIP, see docstring above — the hermetic harness has no seam to raise a stop.
	test.skip(true, 'No hermetic stop-raising path: the e2e stub AgentRunner never emits an approval/auth stop (exit 0 only).')
})
