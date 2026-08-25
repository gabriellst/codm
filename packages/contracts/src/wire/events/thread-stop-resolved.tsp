import "./_base.tsp";

namespace TemplateContracts;

@doc("BC4 Thread & Routing -> consumers. A stop was resolved by the operator. TAKE_OVER additionally pauses the thread. Renamed from integration.issue.stop_resolved in B4 along with its owner; the payload gained `threadId` (which stop_raised always carried) so a consumer no longer has to look up issue -> thread to know which conversation changed, and `issueId` became optional because a thread-level stop has none.")
model ThreadStopResolvedEvent extends IntegrationEvent {
  name: "integration.thread.stop_resolved";
  stopId: string;
  issueId?: string;
  threadId: string;
  resolution: StopResolution;
}
