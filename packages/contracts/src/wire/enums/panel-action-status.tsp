namespace TemplateContracts;

@doc("Where a panel action stands (fase 2, item 6b). PENDING: stored in the cloud, waiting for the daemon to pull and execute it. DONE / REFUSED: the daemon's outcome (REFUSED carries the error code). EXPIRED: no outcome arrived in time — the daemon was away, so the action was dropped rather than run late.")
enum PanelActionStatus {
  PENDING: "PENDING",
  DONE: "DONE",
  REFUSED: "REFUSED",
  EXPIRED: "EXPIRED",
}
