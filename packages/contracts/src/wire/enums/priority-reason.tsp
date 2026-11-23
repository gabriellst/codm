namespace TemplateContracts;

@doc("Why a task has the priority it has (fase 4, item 4). CLIENT_BUG: a bug a client is hitting — claimed ahead of every declared priority. DECLARED: the orchestrator declared the priority. DEFAULT: nobody declared one.")
enum PriorityReason {
  CLIENT_BUG: "CLIENT_BUG",
  DECLARED: "DECLARED",
  DEFAULT: "DEFAULT",
}
