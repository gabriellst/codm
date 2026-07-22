namespace TemplateContracts;

@doc("OPEN is the only non-terminal status — a dispute opens and closes exactly once (WON | LOST).")
enum DisputeStatus {
  OPEN: "OPEN",
  WON: "WON",
  LOST: "LOST",
}
