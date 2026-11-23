namespace TemplateContracts;

@doc("What happens after a publish command succeeded, as the ask declared it (fase 4, item 6c) — the discriminant of StopAsk.onPublished. COMPLETE: the task is completed with the declared summary, with no session turn. CONTINUE: the session is told the outcome and goes on.")
enum PublishFollowUpKind {
  COMPLETE: "COMPLETE",
  CONTINUE: "CONTINUE",
}
