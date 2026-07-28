// The WIRING layer of the agent runtime: `ProviderKind` → `AgentRunner`.
//
// It is a SIBLING of `services/AgentRunner/`, not a file inside it, and the separation carries two
// invariants that would otherwise be comments:
//   - AC-4.5.3 — no class under `services/AgentRunner` names a `ProviderKind`. Naming them is this
//     directory's entire job, so it must not live there.
//   - `tests/architecture/pty-isolation.test.ts` allows `services/AgentRunner/**` to import
//     `node:child_process`. A factory nested under that path would inherit the permission by prefix
//     without needing it; as a sibling it stays subject to the rail like every other module.
export { AgentRunnerFactory, DefaultAgentRunnerFactory } from './AgentRunnerFactory'
export { FixedAgentRunnerFactory, StubAgentRunnerFactory, E2eAgentRunnerFactory } from './FixedAgentRunnerFactory'
