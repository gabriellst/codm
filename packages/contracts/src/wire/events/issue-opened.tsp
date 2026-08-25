import "./_base.tsp";

namespace TemplateContracts;

@doc("BC5 Issue Execution -> BC4 Thread & Routing. A new issue was opened (unique key per thread); triggers the terminal session spawn and a transcript/status update.")
model IssueOpenedEvent extends IntegrationEvent {
  name: "integration.issue.opened";
  issueId: string;
  threadId: string;
  key: string;
  title: string;
  provider: ProviderKind;
}
