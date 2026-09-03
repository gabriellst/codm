namespace TemplateContracts;

@doc("Which model an agent run asks the provider CLI for. Closed set on purpose (GOAL-agent-abstraction §4.2): `model?: string` is exactly the untyped convention the contract-before-implementation rule forbids — widening the set is a contract edit, never a new string at a call site. DEFAULT means OMIT the `--model` flag and let the CLI pick, which is why it is a member and not `undefined`. The set is FLAT and not namespaced per provider: who offers what is a declared relation (`PROVIDER_MODELS` in api/typescript), gated so that a member nobody claims fails a test rather than resolving by prefix. EVERY MEMBER IS A CODENAME, NEVER A VERSION — SONNET, not `CLAUDE_4_5_SONNET`; TERRA, not `GPT_5_6_TERRA`. A codename names the TIER the operator is choosing (balanced, fast, frontier) and lets the version float: the latest build of that tier is what the run gets, resolved by the per-runner alias map (`CLAUDE_MODEL_ALIASES`, `CODEX_MODEL_ALIASES`) that is the only place a vendor slug is ever spelled. Versioned members were tried once and failed the same week they landed — codex's account-served list churned from `gpt-5.3-codex` to `gpt-5.6-terra` and the three pinned members became three guaranteed 400s — so a vendor bumping a tier is a ONE-LINE map edit here, never a contract edit plus a migration plus an SDK regen. A vendor that retires a CODENAME is the contract edit this enum exists to force.")
enum AgentModelId {
  DEFAULT: "DEFAULT",
  SONNET: "SONNET",
  OPUS: "OPUS",
  HAIKU: "HAIKU",
  TERRA: "TERRA",
  LUNA: "LUNA",
}
