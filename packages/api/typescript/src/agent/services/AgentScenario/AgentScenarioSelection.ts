import { injectable } from 'tsyringe-neo'
import type { AgentScenario, AgentScenarioAct, AgentScenarioId } from './AgentScenario'
import { AGENT_SCENARIOS, DEFAULT_AGENT_SCENARIO_ID } from './scenarios'

/**
 * WHICH roteiro the deterministic stand-in is currently performing.
 *
 * ### Why the selection is late-bound, when the Go side's is not
 * The channel gateway's scenario (`defaultE2eScenario()`, `internal/channel/overlay.go`) is fixed at
 * construction, and its own comment says nothing may mutate it afterwards. That is right THERE: what
 * it scripts — connecting, pairing, the seeded contact list — is behaviour a channel exhibits once,
 * at boot, before any spec can have an opinion. An agent's roteiro is the opposite: it is performed
 * per RUN, many times per boot, and which one is wanted is a property of the spec that is running,
 * not of the process. Baking it into boot would mean one daemon per roteiro.
 *
 * ### Why not an env key, which is the other obvious answer
 * `.env.example` is GENERATED from the env registry in `template.config.ts` for fresh clones, and
 * `tests/architecture/product-residue.test.ts` exists to keep harness concerns out of the product's
 * public surface. A `CODM_AGENT_SCENARIO` sitting in every clone's `.env.example` to serve a
 * promotional capture is precisely that residue. The `/_test/*` doors are the declared seam for
 * "something only the harness may ask for", and this is one.
 *
 * ### Why a class holding one field rather than a module-level `let`
 * A module-level mutable would be shared across every container in the process, including the child
 * containers `TestBed` builds per suite — so one suite's selection would leak into the next. Bound as
 * a container SINGLETON (`agent/registry.ts`), the selection has exactly the lifetime of the graph
 * that reads it.
 *
 * Bound in every env, not just `e2e`: the DOOR that writes it is `e2e`-only, so everywhere else this
 * is a constant that reports the default. A token bound in one column and absent in the others is how
 * a resolve throws in production for a reason nobody can see from the call site.
 */
@injectable()
export class AgentScenarioSelection {
	private selected: AgentScenarioId = DEFAULT_AGENT_SCENARIO_ID
	/** Where each agent's performance stands: the scene playing next, and the ones after it. */
	private performance = {
		orchestrator: rehearse(AGENT_SCENARIOS[DEFAULT_AGENT_SCENARIO_ID].orchestrator),
		work: rehearse(AGENT_SCENARIOS[DEFAULT_AGENT_SCENARIO_ID].work),
	}

	/** The roteiro being performed. Never `undefined` — the id set is closed and the map is total over it. */
	current(): AgentScenario {
		return AGENT_SCENARIOS[this.selected]
	}

	/** The id currently selected — what the door echoes back so a caller can assert it landed. */
	get currentId(): AgentScenarioId {
		return this.selected
	}

	/**
	 * Selecting a roteiro REWINDS it. A scenario handed out mid-performance would start from wherever
	 * the previous one happened to stop, which is the one way a script can be wrong that nobody would
	 * think to look for.
	 */
	select(id: AgentScenarioId): void {
		this.selected = id
		const scenario = AGENT_SCENARIOS[id]
		this.performance = { orchestrator: rehearse(scenario.orchestrator), work: rehearse(scenario.work) }
	}

	/** The next conversational act — the reply, then the answer about the finished issue. */
	nextOrchestratorAct(): AgentScenarioAct {
		return advance(this.performance.orchestrator)
	}

	/** The next working act — the one whose frames fill the console's terminal panel. */
	nextWorkAct(): AgentScenarioAct {
		return advance(this.performance.work)
	}
}

/** One agent's place in the script: the scene about to play, and whatever follows it. */
interface Performance {
	current: AgentScenarioAct
	pending: AgentScenarioAct[]
}

/** Set a sequence up to play from the top. Destructuring is what proves the first act exists. */
function rehearse(acts: readonly [AgentScenarioAct, ...AgentScenarioAct[]]): Performance {
	const [current, ...pending] = acts
	return { current, pending }
}

/**
 * Play the current scene and step forward — EXCEPT on the last one, which stays.
 *
 * That is what makes the one-act `default` roteiro behave exactly as the hard-coded stand-in did:
 * every turn of every spec sharing a daemon gets the same act, so no spec can advance another spec's
 * script. See `AgentScenario` for why running past the end of a script is expected at all.
 */
function advance(performance: Performance): AgentScenarioAct {
	const playing = performance.current
	const [next, ...rest] = performance.pending
	if (next) {
		performance.current = next
		performance.pending = rest
	}
	return playing
}
