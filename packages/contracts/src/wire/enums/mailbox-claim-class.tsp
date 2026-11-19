namespace TemplateContracts;

@doc("What a queued item IS, declared by its producer (fase 4, items 4 and 6b) — a column of the shared agent_mailbox table, read by the claim order and by steer coalescing instead of any payload key or dedup-key prefix. DECISION_ANSWER: the resume of a task after someone answered or resolved its stop. INTERRUPT: the 'agora' (now) steer that cuts a running turn. STEER: guidance for a task. WORK: a new task's first turn. REMINDER: the automatic declaration reminder. RESULT: a task's outcome for the orchestrator to compose. OPERATOR: a message addressed to the orchestrator.")
enum MailboxClaimClass {
  DECISION_ANSWER: "DECISION_ANSWER",
  INTERRUPT: "INTERRUPT",
  STEER: "STEER",
  WORK: "WORK",
  REMINDER: "REMINDER",
  RESULT: "RESULT",
  OPERATOR: "OPERATOR",
}
