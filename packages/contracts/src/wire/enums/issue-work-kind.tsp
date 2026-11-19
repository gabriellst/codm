namespace TemplateContracts;

@doc("What a task does (fase 4, item 6d) — declared when it is born, it chooses the model the task runs on. CHANGE: it changes something (code, content, configuration). DIAGNOSIS: it reads and reports without changing anything.")
enum IssueWorkKind {
  CHANGE: "CHANGE",
  DIAGNOSIS: "DIAGNOSIS",
}
