import "./_base.tsp";

namespace TemplateContracts;

@doc("Published when a task moves between workflow statuses. Drives the live List/Board view refresh via the ui SSE stream. workspaceId is REQUIRED — it is the SSE realtime tenancy filter key.")
model TaskStatusChangedEvent extends IntegrationEvent {
  name: "integration.shared.task.status_changed";
  workspaceId: string;
  taskId: string;
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
}
