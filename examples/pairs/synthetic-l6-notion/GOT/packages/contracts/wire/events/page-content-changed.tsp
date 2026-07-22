import "./_base.tsp";
import "../enums/page-change-kind.tsp";

namespace TemplateContracts;

@doc("Published by the page context whenever a page's content changes (page created, block added, or block edited). Drives live SSE updates for everyone viewing the page. workspaceId is the SSE tenancy key.")
model PageContentChangedEvent extends IntegrationEvent {
  name: "integration.shared.page.content_changed";

  @doc("Workspace that owns the page — REQUIRED tenancy scope for SSE fan-out.")
  workspaceId: string;

  @doc("The page whose content changed.")
  pageId: string;

  @doc("What kind of change occurred.")
  changeKind: PageChangeKind;
}
