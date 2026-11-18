namespace TemplateContracts;

@doc("The kinds of moment an Issue's timeline shows, oldest first. Discriminant of the timeline item union: each kind carries its own fields. CREATED: the issue was forked. TURN_STARTED: a turn of its session began. MESSAGE: a transcript entry linked to the issue (what the agent said about it, or a reply that quoted it). STEER: guidance sent to it (with sent/delivered/read instants). ARTIFACT: a file, image, video or link it recorded. STOP_RAISED / STOP_RESOLVED: it asked for someone, and someone answered. COMPLETED: it declared itself done. ARCHIVED: it left the board. PAUSED / RESUMED: someone held its work (a WhatsApp control word or the console button), and someone let it continue. REGRET_WINDOW: before an irreversible action (a push, a merge, a publish, a deploy) the session waited a few seconds for new guidance, and either went ahead or was cancelled by a message or a pause.")
enum IssueTimelineItemKind {
  CREATED: "CREATED",
  TURN_STARTED: "TURN_STARTED",
  MESSAGE: "MESSAGE",
  STEER: "STEER",
  ARTIFACT: "ARTIFACT",
  STOP_RAISED: "STOP_RAISED",
  STOP_RESOLVED: "STOP_RESOLVED",
  COMPLETED: "COMPLETED",
  ARCHIVED: "ARCHIVED",
  PAUSED: "PAUSED",
  RESUMED: "RESUMED",
  REGRET_WINDOW: "REGRET_WINDOW",
}
