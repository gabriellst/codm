/**
 * The wire name of a tool the CodeDM MCP server exposes.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * THIS WAS A UNION OF FOUR HAND-WRITTEN LITERALS AND THEY WERE UNREACHABLE. Fase 1 froze four
 * `codedm`-prefixed spellings — one per declaration — and documented them as *"the value IS the wire
 * name the model calls"*. (The literals themselves are deliberately not repeated here: AC-6.17(a)
 * keeps them out of `src` so nobody copies a dead name into a new call site. The one surviving
 * occurrence is the regression assertion in the accumulator's test, which AC-6.17(d) requires.)
 * Under GENERATED tools that promise is
 * unattainable: `@kubb/plugin-mcp`'s `serverGenerator` registers `name: operation.getOperationId()`
 * and the name never passes through `resolveName` or `transformers` (PROVEN — with a
 * `transformers.name` the emitted FILES were renamed while the registration stayed
 * `server.registerTool("RecordArtifact", …)`). Keeping the literals would have left `--allowedTools`
 * naming tools that do not exist and the model holding nothing — a SILENT failure, which is the exact
 * class of defect this phase exists to eliminate.
 *
 * So the name is now DERIVED. There is no list here to keep in step with anything: a tool name is
 * whatever the emitter derived from the controller class, and that class's own `static mcpScopes` is
 * the single place its scope is declared.
 *
 * THE AC-1.6 INVARIANT DID NOT DIE — IT CHANGED CARRIER, and that transfer is the design amendment's
 * conscious regression, recorded here because this is where AC-1.6 is read. It used to be "no tool
 * schema has an identity field", which made declaring against the WRONG issue INEXPRESSIBLE. A tool
 * generated from a controller inherits that controller's `issueId`/`threadId`, so the invariant is now
 * "DIVERGENT IDENTITY IS REJECTED" — implemented in `mcp/identity.ts`, enforced per call by
 * `mcp/door.ts`, and measured by the cross-issue attempt test without which this phase does not
 * close.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * A tool's WIRE name — the spelling an MCP client uses when calling, e.g.
 * `mcp__<server key>__TransitionIssueStatus`. Built in exactly one place, `mcp/wire.ts#wireToolName`,
 * from `MCP_SERVER_KEY` and the derived operationId.
 *
 * `string` rather than a closed union ON PURPOSE: the set is derived from the manifest at emit time,
 * so pinning it here would be a SECOND declaration of a value-set that already has an owner — stale
 * the day a controller joins a scope, and stale silently.
 *
 * The alias survives (rather than every signature saying `string`) because it carries meaning:
 * `Agent.tools` and `AgentMcpInvocation.allowedTools` hold WIRE names, not operationIds, and the two
 * differ by the `mcp__<server key>__` prefix the CLIENT adds.
 */
export type AgentToolName = string
