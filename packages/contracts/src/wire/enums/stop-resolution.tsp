namespace TemplateContracts;

@doc("How an operator resolves a stop. The resolution must match the stop kind (e.g. APPROVE/DENY only for APPROVAL_NEEDED); TAKE_OVER additionally pauses the thread for direct conversation.")
enum StopResolution {
  RETRY: "RETRY",
  REVIEW_AND_SEND: "REVIEW_AND_SEND",
  TAKE_OVER: "TAKE_OVER",
  APPROVE: "APPROVE",
  DENY: "DENY",
  // Fase 3: someone answered an ask (DECISION_REQUESTED / QUESTION_ASKED) — an option or free text,
  // recorded on the stop as its answer.
  ANSWER: "ANSWER",
  // Fase 3: a QUESTION_ASKED reached its deadline and the issue went on with its declared default.
  // Written only by the deadline job, never accepted from a route.
  DEFAULT_APPLIED: "DEFAULT_APPLIED",
  // Fase 5: the supervisor resumed a STALLED / SERVER_ERROR task once more, in AUTO, as the last nudge of
  // its episode. Written only by the supervisor job, never accepted from a route, the panel or MCP.
  AUTO_RETRY: "AUTO_RETRY",
}
