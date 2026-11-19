namespace TemplateContracts;

@doc("Who sent an automatic nudge to a task that ended its turn without declaring anything (fase 5, item 1). RECONCILER: the stalled-issue sweep (nudges 1 and 2 of an episode). SUPERVISOR: the small-model supervisor resuming a blocked task — always counted as the last nudge of the episode.")
enum NudgeSource {
  RECONCILER: "RECONCILER",
  SUPERVISOR: "SUPERVISOR",
}
