namespace TemplateContracts;

@doc("How an issue's regret window ended (fase 2, item 3). PROCEEDED: nothing new arrived while it waited — the action went ahead. CANCELLED_BY_STEER: the issue had guidance its session had not read yet — the action was refused and the guidance is read next. CANCELLED_BY_PAUSE: the issue (or its conversation) was paused — the action was refused.")
enum RegretWindowOutcome {
  PROCEEDED: "PROCEEDED",
  CANCELLED_BY_STEER: "CANCELLED_BY_STEER",
  CANCELLED_BY_PAUSE: "CANCELLED_BY_PAUSE",
}
