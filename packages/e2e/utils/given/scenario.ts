import type { ApiSession } from './api'

/** The roteiros the daemon declares (`agent/services/AgentScenario/scenarios.ts`). */
export type AgentScenarioId = 'default' | 'demo-pt' | 'demo-en'

/**
 * Choose WHICH roteiro the deterministic stand-in runner performs from here on — the spec side of the
 * daemon's `/_test/agent/scenario` door (mounted only under CODM_ENV=e2e).
 *
 * The daemon owns every script it can play; this only picks one, and picking REWINDS it. Not part of
 * the generated SDK, so it goes through the operator client's raw request, exactly like the gateway
 * seam beside it.
 *
 * A spec that never calls this gets `default`, which is what every correctness spec has always seen.
 */
export async function selectAgentScenario(session: ApiSession, scenarioId: AgentScenarioId): Promise<void> {
	const res = await session.client<{ scenarioId: AgentScenarioId }>({
		method: 'POST',
		url: '/_test/agent/scenario',
		data: { scenarioId },
	})
	// The door echoes the holder's OWN state back, so this asserts the selection landed rather than
	// that the request was accepted — a distinction that matters when the next thing to run is a film.
	if (res.data.scenarioId !== scenarioId) {
		throw new Error(`agent scenario did not switch: asked for '${scenarioId}', daemon reports '${res.data.scenarioId}'`)
	}
}
