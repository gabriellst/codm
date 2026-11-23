namespace TemplateContracts;

@doc("The badge of the system's quota health (fase 4, item 7). OK: room in both windows. NEAR: at or above 70% of the learned weekly ceiling. HOLDING: new task turns are being held by the budget. REFUSED: the provider is refusing turns (usage limit).")
enum QuotaState {
  OK: "OK",
  NEAR: "NEAR",
  HOLDING: "HOLDING",
  REFUSED: "REFUSED",
}
