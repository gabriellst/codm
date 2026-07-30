---
name: agent
description: "Create an internal agent — a typed wrapper over the one-method AgentRunner seam that turns a business intention into ONE provider-CLI run. Use when a feature needs an LLM/coding-agent turn (classify an inbound message, work an issue). Dispatch hub — routes to the typescript variant by file extension."
---

# Agent

An **agent** is the citizen that owns *"what do we ask the model, and what do we let it do"*. It is
not a service and not a use case: a service has no model, and a use case orchestrates a transaction.
An agent translates one business intention into exactly one `AgentRunner.run()` request and declares
the tool scope that run may act through.

Three things belong to an agent and nothing else:

1. **the input contract** — a schema built with `z.agentInput({...})`, so the run envelope
   (`ownerId` / `threadId` / `cwd`, and `issueId` where one exists) is inherited rather than retyped;
2. **the prompt** — a `@injectable()` prompt builder in its own `prompt.ts`, so the day the prompt
   needs a repository read, the agent's shape does not change;
3. **the tool scope** — `tools`, the closed list of `codm__*` tools this run may call. Empty scope
   means the run declares nothing and carries no MCP config at all.

Four things explicitly do NOT: routing/threshold/fallback **policy** (that is a service — see
`IssueRouter`), the transaction (a use case), transport (the runner), and identity resolution (the
base class stamps it; there is no name→agent map).

## The one rule that generates most of the others

`Agent.run()` is a **concrete template method** on the base. The single point of variation is
`protected abstract buildRequest(input)`. An agent that overrides `run()` re-opens a second place to
mint a run token, which is why the token can be proven to be minted in exactly one file.

An agent with an `outputSchema` may expose **exactly one** public method, named for the business
purpose, whose body is `return this.collect(input)` — nothing more. An agent without an
`outputSchema` exposes nothing beyond the inherited `run()`.

## Language variants

| Backend | Playbook | Registry |
|---|---|---|
| TypeScript — `packages/api/typescript/` | [`typescript/SKILL.md`](./typescript/SKILL.md) | [`typescript/registry.yaml`](./typescript/registry.yaml) |

There is no Go variant: the agent runtime is TS-owned (the Go side runs the channel gateway and owns
no provider-CLI process).

## How dispatch works

`scripts/review.ts` classifies any file under `agents/**` as the `agent` artifact and loads
`agent/typescript/registry.yaml`. Scaffold with `bun cli agent <context> <Name>`.
