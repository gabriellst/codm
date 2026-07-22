import "./_base.tsp";

namespace TemplateContracts;

@doc("BC5 Issue Execution -> BC4 Thread & Routing -> BC1 Channel Gateway. An agent drafted a reply for an issue; carries the issue label so the gateway can prefix it on delivery. Descends whatscode ChatMessageEvent. The IssueLabel VO is flattened to labelIssueKey/labelThreadId (both required here — every agent reply is labeled).")
model AgentReplyDraftedEvent extends IntegrationEvent {
  name: "integration.agent.reply_drafted";
  issueId: string;
  threadId: string;
  labelIssueKey: string;
  labelThreadId: string;
  text: string;
}
