namespace TemplateContracts;

@doc("Why work stopped, as a BLOCK_NOTICE says it (fase 3, item 2) — the key of 'one notice per cause'. Derived from the stop kind (or the provider pause), never stored. PROVIDER_LIMIT: the provider account hit its usage limit. PROVIDER_ERROR: the provider failed the turn. CLI_LOGIN: the agent CLI needs a new sign-in. STALLED: the issue stopped without saying what it needs, even after the reminder. CLASSIFICATION: a reply was blocked by classification. BUDGET_HELD (fase 4): the quota budget is holding new task turns before the provider refuses — announced only while the budget is enforced.")
enum BlockCause {
  PROVIDER_LIMIT: "PROVIDER_LIMIT",
  PROVIDER_ERROR: "PROVIDER_ERROR",
  CLI_LOGIN: "CLI_LOGIN",
  STALLED: "STALLED",
  CLASSIFICATION: "CLASSIFICATION",
  BUDGET_HELD: "BUDGET_HELD",
}
