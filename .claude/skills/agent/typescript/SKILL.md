---
name: agent-typescript
description: "TypeScript playbook for the `agent` citizen — the Agent base class, buildRequest, prompt builders, tool scope, DI registration, and testing against a stubbed runner."
---

# Agent — TypeScript

Lives in `packages/api/typescript/src/<context>/agents/<Name>Agent/`, **one directory per agent**:

```
agents/<Name>Agent/
├── <Name>Agent.ts   # the class: NAME, inputSchema, outputSchema?, tools, buildRequest
├── prompt.ts        # @injectable() <Name>PromptBuilder — system()/user()
├── types.ts         # <Name>InputSchema via z.agentInput({...}); the outputSchema if any
└── index.ts         # barrel
```

Scaffold: `bun cli agent <context> <Name>` (creates the four files + the colocated test and wires
`agents/index.ts`).

## The base class

`<context>/types/Agent.ts`:

- `static readonly NAME: AgentName` — declared on the base, **assigned** by each agent
  (`static override readonly NAME = AgentName.X`). Identity only: logs, spans, run-token claims.
  Never a resolution key.
- `run(input)` — **concrete template method**. It spreads `buildRequest(input)` and stamps the agent
  identity (and, once the MCP server exists, the `mcp` invocation carrying the minted run token).
  **Never override it.**
- `protected abstract buildRequest(input)` — the ONE variation point. Returns the request **without**
  `mcp` and **without** `agentName`.
- `protected collect(input)` — drains `run()` to its single `finished` event and returns the
  validated `output`. Not a second transport: it is a helper over the same iteration.
- `protected collectFailure(message)` — override it to give `collect()`'s failures a code from your
  context's error vocabulary. The seam never throws mid-drain; naming the failure is this layer's job.
- `input` / `output` — phantom fields (definite-assignment, never written). Write `this['input']`
  instead of restating `Z.output<typeof XSchema> & AgentInputEnvelope`.

## The input schema

Always `z.agentInput({ ...your fields })`. The verb extends `BaseAgentInputSchema`, so the envelope
is present **by construction** and the generic constraint (`AgentInputSchemaConstraint`) holds without
a cast. Restating `ownerId` / `threadId` / `cwd` is a bad practice, and so is declaring an input that
drops them — you physically cannot with the verb.

`cwd` is the **absolute workspace path**, resolved by the caller. Never `process.cwd()`.

## The tool scope

`readonly tools: readonly AgentToolName[] = []` on the base. Declaring a non-empty scope is what makes
the base attach an `AgentMcpInvocation` to the request — the invariant is `request.mcp` present ⟺
`tools.length > 0`. Two consequences:

- Never condition a use case on `request.mcp`. The request is assembled inside the agent and the use
  case cannot see it. The observable predicate is the **tool scope of the agent you injected**.
- Never instruct the model (in the prompt) to call a tool that is not in the declared scope.

## DI

Register in `<context>/registry.ts` via `expandBindings`, as a **class token**, in all three envs, with
`useClass` (transient):

```ts
{ token: ClassifyIssuePromptBuilder, mock: { useClass: ClassifyIssuePromptBuilder }, real: { useClass: ClassifyIssuePromptBuilder } },
{ token: ClassifyIssueAgent,         mock: { useClass: ClassifyIssueAgent },         real: { useClass: ClassifyIssueAgent } },
```

Transient rather than singleton because an agent holds no state of its own — only a reference to the
singleton `AgentRunner`. A singleton would capture whichever runner existed at first construction, and
that binding is exactly what the per-env DI seam and `TestBed.override` swap.

There is **no** `AgentRegistry`, no `getAgent(name)`, no `agentsByName` map. Resolution is
`container.resolve(IssueWorkAgent)` — a rename then fails at compile time instead of at runtime.

## Who may invoke an agent

- A **handler** or a **job** — always allowed.
- A **use case**, when the decision has to be consumed inside its own transaction. `ClassifyMessage`
  is the standing example, and the divergence is deliberate and documented.
- A **controller** — never.
- The **MCP router** — never. It serves a tool call by dispatching a use case.

When an agent's output needs policy applied to it (a confidence floor, a fallback, an id minted), that
policy is a **service** next to the agent, not code inside it. The service injects the agent.

## Testing

Never a real CLI, ever — that is a property of the DI env, not of test discipline. Construct the agent
directly with a stubbed `AgentRunner` that records requests and yields canned events:

- assert `buildRequest`'s output through `runner.requests[0]` (cwd, messages, model, session,
  outputSchema, `mcp` absent);
- assert the base stamped `agentName` — proving `buildRequest` did not;
- assert that a transport `stop` and a `failed` terminal record both surface as your NAMED error, not
  as a thrown parse error.
