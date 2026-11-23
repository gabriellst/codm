namespace TemplateContracts;

@doc("Why the effective number of task slots is what it is (fase 4, item 1). MAX: the configured maximum. MACHINE: free disk or memory pressure on this machine. BUDGET: the quota budget is holding new task turns.")
enum SlotLimit {
  MAX: "MAX",
  MACHINE: "MACHINE",
  BUDGET: "BUDGET",
}
