// The scripted run's ROTEIRO — declared data, and the holder that says which one is being performed.
//
// A LEAF on purpose. Nothing here imports a runner, a driver or a controller: it is the vocabulary the
// stand-in interprets and the door selects, so both sides can depend on it without depending on each
// other. That is also what lets `agent/controllers/` import the selection without pulling
// `services/AgentRunner`'s barrel — which reaches `agent/mcp/exposure.ts` → `@ui/controllers` and
// would cycle the `ui` context back into a context that must not know it exists.
export type {
	AgentScenario,
	AgentScenarioAct,
	AgentScenarioArtifactRef,
	AgentScenarioBeat,
	AgentScenarioDeclaration,
	AgentScenarioId,
} from './AgentScenario'
export { AGENT_SCENARIO_IDS } from './AgentScenario'
export { AGENT_SCENARIOS, DEFAULT_AGENT_SCENARIO_ID, DEMO_PR_URL, E2E_REPLY_LINE } from './scenarios'
export { AgentScenarioSelection } from './AgentScenarioSelection'
