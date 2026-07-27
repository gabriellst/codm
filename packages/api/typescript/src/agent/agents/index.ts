// The internal agents of this context (GOAL-agent-abstraction §4.8) — ONE DIRECTORY PER AGENT
// (`{<Name>.ts, prompt.ts, types.ts, index.ts}`), mirroring the medscall layout.
//
// Both extend the base `Agent` in `types/Agent.ts` and inject the SAME one-method `AgentRunner`. They
// are DI CLASS tokens, bound to the same implementation in all three envs — there is deliberately no
// name→agent map and no factory (`AgentName` is identity for logs/spans/token claims, never a
// resolution key), which is what AC-5.3 greps for.
export * from './ClassifyIssueAgent'
export * from './IssueWorkAgent'
