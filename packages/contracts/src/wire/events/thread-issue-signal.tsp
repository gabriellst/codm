import "./_base.tsp";

namespace TemplateContracts;

@doc("BC5 Agent -> BC4 Thread & Routing (fase 3, item 1). Something an issue wants to say that is neither a stop nor its completion: a preview to look at (FEEDBACK — RequestFeedback) or what it did (PROGRESS — ReportProgress and the end of a turn). The thread's output policy decides, per group mode, whether it reaches the group, a per-person digest or only the panel/timeline. Produced only by the agent context (bridge PublishAgentIntegrationEvents), consumed only by the thread context.")
model ThreadIssueSignalEvent extends IntegrationEvent {
  name: "integration.thread.issue_signal";
  issueId: string;
  threadId: string;

  @doc("FEEDBACK or PROGRESS — the only two levels an issue says through this fact. DECISION/QUESTION travel as stops (integration.thread.stop_raised with `ask`), CLOSING comes from integration.issue.completed and BLOCK_NOTICE from the thread's own stops; the consumer refuses any other level.")
  level: IssueSignalLevel;

  @doc("The issue's own words (verbatim).")
  text: string;

  @doc("Artifacts the signal cites, by id — the thread reads each row through its declared artifact read and delivers it through its own artifact delivery, so no file descriptor travels here. Empty when it cites none.")
  artifactIds: string[];

  @doc("The one artifact a FEEDBACK sends to the group (the main preview); the others stay on the panel. Absent for PROGRESS.")
  mainArtifactId?: string;

  @doc("Who the issue is talking to (a thread participant id) — the key of the per-person digest. Absent ⇒ whoever wrote the message the issue came from.")
  addresseeId?: string;

  @doc("The id of the fact the issue said this in (the agent's own `agent.issue_spoke` event) — stable across redeliveries, so the consumer records the signal ONCE: it becomes the transcript entry's id. Optional only for facts published before it existed; absent ⇒ the consumer falls back to this event's own id.")
  signalId?: string;
}
