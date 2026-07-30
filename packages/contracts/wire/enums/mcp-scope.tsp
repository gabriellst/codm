namespace TemplateContracts;

@doc("Which declared MCP tool surface a credential opens. The value is the WIRE spelling — it is the path segment of the JSON-RPC door (/v1/mcp/<value>), the synthetic OpenAPI tag (mcp:<value>) the Kubb tag filter matches on, and the directory the per-scope generated server is emitted into. Changing a value renames all three at once.")
enum McpScope {
  ISSUE_HANDLING: "issue-handling",
  ORCHESTRATION: "orchestration",
  SYSTEM: "system",
}
