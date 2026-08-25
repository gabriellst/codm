namespace TemplateContracts;

@doc("What a mailbox item schedules a turn FOR. THREAD = the thread's orchestrator (the persistent conversation the operator talks to); ISSUE = one issue's subagent. The two share one queue because they are the same primitive — a serialized turn per target — and different targets run in parallel. Naming the target rather than the agent keeps the queue ignorant of what an agent is.")
enum MailboxTargetKind {
  THREAD: "THREAD",
  ISSUE: "ISSUE",
}
