namespace TemplateContracts;

@doc("Which model an agent run asks the provider CLI for. Closed set on purpose (GOAL-agent-abstraction §4.2): `model?: string` is exactly the untyped convention the contract-before-implementation rule forbids — widening the set is a contract edit, never a new string at a call site. DEFAULT means OMIT the `--model` flag and let the CLI pick, which is why it is a member and not `undefined`.")
enum AgentModelId {
  DEFAULT: "DEFAULT",
  SONNET: "SONNET",
  OPUS: "OPUS",
  HAIKU: "HAIKU",
}
