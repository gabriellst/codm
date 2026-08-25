import { test } from '../utils/test'

/**
 * Canonical flow (f) — SSE live update (agents-running pill reacts without reload).  HONEST SKIP.
 *
 * The console subscribes to `GET /v1/ui/events` (ListenEvents, an SSE stream) and flips the
 * "agents-running" pill when a session opens/closes — no page reload. Reliably observing that pill in
 * the booted harness is not possible: the `real` AgentRunner is the deterministic stub, whose session
 * runs to `exit 0` synchronously, so the "running" window opens and closes within the same tick — there
 * is no controllable long-running session to hold the pill "on" long enough for an expect-poll to catch
 * it, and asserting a transient frame race would be inherently flaky. The SSE transport itself IS
 * exercised by the rest of the suite (the in-process ExternalMediator that ListenEvents observes is the
 * same one flow (b) drives end to end).
 *
 * To un-skip: give E2eStubAgentRunner a controllable "hold" mode (block `stream()` until a
 * `/v1/_test/gateway` release action), open a session, assert the pill turns on via the live SSE
 * stream, release, assert it turns off. Deferred — it needs a new stub capability + ingress action,
 * out of scope for the harness rewire.
 */
test('SSE live update — agents-running pill reacts without reload', async () => {
	test.skip(true, 'Stub session completes synchronously (exit 0) — no stable "running" window to observe on the SSE-driven pill.')
})
