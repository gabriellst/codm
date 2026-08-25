namespace TemplateContracts;

@doc("Why an Issue was archived. MANUAL (operator), AUTO_24H (scheduler sweep of COMPLETED issues older than 24h), THREAD_DETACHED (parent thread detached). Harmonized name (modeling called it ArchiveReason) — scoped to the issue lifecycle.")
enum IssueArchiveReason {
  MANUAL: "MANUAL",
  AUTO_24H: "AUTO_24H",
  THREAD_DETACHED: "THREAD_DETACHED",
}
