import "./_base.tsp";

namespace TemplateContracts;

@doc("BC2 Workspace Registry -> BC4 Thread & Routing / BC5 Issue Execution. A workspace folder was removed; downstream contexts invalidate references to it.")
model WorkspaceRemovedEvent extends IntegrationEvent {
  name: "integration.workspace.removed";
  workspaceId: string;
  path: string;
}
