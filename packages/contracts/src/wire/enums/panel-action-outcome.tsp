namespace TemplateContracts;

@doc("What the daemon did with a panel action (fase 2, item 6b), reported on its next pull. DONE: executed as the member who asked. REFUSED: not executed — the outcome carries the error code (the member lost the release grant, the issue was not pausable, the stop was already answered…).")
enum PanelActionOutcome {
  DONE: "DONE",
  REFUSED: "REFUSED",
}
