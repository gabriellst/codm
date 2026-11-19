namespace TemplateContracts;

@doc("Where a batch stands (fase 4, item 5). INCOMPLETE: some item still has no destination — no receipt goes out. RECORDED: every item has exactly one destination and the receipt went out.")
enum BatchStatus {
  INCOMPLETE: "INCOMPLETE",
  RECORDED: "RECORDED",
}
