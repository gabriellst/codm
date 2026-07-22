namespace TemplateContracts;

@doc("Terminal-settling status of a gateway charge attempt.")
enum ChargeStatus {
  PENDING: "PENDING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
}
