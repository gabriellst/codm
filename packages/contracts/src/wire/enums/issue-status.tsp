namespace TemplateContracts;

@doc("Lifecycle of an Issue (a unit of work with its own terminal session). NEEDS_INPUT → WORKING → COMPLETED. Richer than whatscode's ChatSessionStatus{ACTIVE,CLOSED}.")
enum IssueStatus {
  NEEDS_INPUT: "NEEDS_INPUT",
  WORKING: "WORKING",
  COMPLETED: "COMPLETED",
}
