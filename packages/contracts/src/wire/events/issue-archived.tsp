import "./_base.tsp";

namespace TemplateContracts;

@doc("BC5 Issue Execution -> BC4 Thread & Routing. An issue was archived (manually, by the 24h sweep, or because the thread was detached); updates the issue-list projections.")
model IssueArchivedEvent extends IntegrationEvent {
  name: "integration.issue.archived";
  issueId: string;
  threadId: string;
  reason: IssueArchiveReason;
}
