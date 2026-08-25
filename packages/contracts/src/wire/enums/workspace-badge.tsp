namespace TemplateContracts;

@doc("Detected trait of a registered workspace folder. GIT = a .git repository; CLAUDE_PROJECT = a Claude project marker. A workspace may carry both.")
enum WorkspaceBadge {
  GIT: "GIT",
  CLAUDE_PROJECT: "CLAUDE_PROJECT",
}
