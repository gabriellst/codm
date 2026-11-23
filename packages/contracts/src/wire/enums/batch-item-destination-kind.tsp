namespace TemplateContracts;

@doc("Where one item of a batch (a message listing several requests) went (fase 4, item 5) — the discriminant of the destination union, one per item. NEW_ISSUE: a new task was forked for it. ATTACHED: it was sent to an existing task as guidance. ALREADY_LIVE: it is already done or live. DECLINED: it will not be done (with the reason). DEFERRED: it waits (with the reason and, maybe, until when). NEEDS_DECISION: a task needs someone's decision about it first.")
enum BatchItemDestinationKind {
  NEW_ISSUE: "NEW_ISSUE",
  ATTACHED: "ATTACHED",
  ALREADY_LIVE: "ALREADY_LIVE",
  DECLINED: "DECLINED",
  DEFERRED: "DEFERRED",
  NEEDS_DECISION: "NEEDS_DECISION",
}
