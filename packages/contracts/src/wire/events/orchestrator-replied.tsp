import "./_base.tsp";

namespace TemplateContracts;

@doc("BC5 Agent Runtime -> BC4 Thread & Routing. The thread's orchestrator produced a reply for the operator — either answering them directly or composing the outcome of a finished subagent into the voice of the conversation. BC4 owns what happens next (transcript entry, channel delivery) because only it holds the contact the thread is bound to. `replyToEntryId` is present when the reply should QUOTE a specific message: always for a composed issue result (anchored on the issue's origin), optionally in conversation.")
model OrchestratorRepliedEvent extends IntegrationEvent {
  name: "integration.orchestrator.replied";
  threadId: string;
  text: string;
  replyToEntryId?: string;
  issueId?: string;
}
