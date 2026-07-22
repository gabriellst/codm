namespace TemplateContracts;

@doc("Terminal coding-agent CLI a thread/issue runs against. Harmonized name (source modeling called it ProviderName) — aligns with the *Kind convention across the wire enums.")
enum ProviderKind {
  CLAUDE_CODE: "CLAUDE_CODE",
  CODEX: "CODEX",
  OPENCODE: "OPENCODE",
}
