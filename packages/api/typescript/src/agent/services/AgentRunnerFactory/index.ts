// The WIRING layer of the agent runtime: `ProviderKind` → `AgentRunner`.
//
// It is a SIBLING of `services/AgentRunner/`, not a file inside it, and the separation carries two
// invariants that would otherwise be comments:
//   - AC-4.5.3 — no class under `services/AgentRunner` names a `ProviderKind`. Naming them is this
//     directory's entire job, so it must not live there.
//   - `tests/architecture/pty-isolation.test.ts` allows `services/AgentRunner/**` to import
//     `node:child_process`. A factory nested under that path would inherit the permission by prefix
//     without needing it; as a sibling it stays subject to the rail like every other module.
//
// CONSUMERS OUTSIDE THIS CONTEXT, READ THIS: the two lines below pull the runner IMPLEMENTATIONS, and
// their graph reaches `agent/mcp/exposure.ts` → `@ui/controllers`. A module in the `ui` context that
// needs only the abstract TOKEN must import it from `@agent/services/AgentRunnerFactory/AgentRunnerFactory`
// (the leaf), never from this barrel — otherwise the load cycles back into `ui` and the token is still
// in its TDZ when tsyringe reads the constructor metadata.
export { AgentRunnerFactory } from './AgentRunnerFactory'
export { DefaultAgentRunnerFactory } from './DefaultAgentRunnerFactory'
export { FixedAgentRunnerFactory, StubAgentRunnerFactory, E2eAgentRunnerFactory } from './FixedAgentRunnerFactory'
