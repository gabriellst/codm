namespace TemplateContracts;

@doc("The discriminant of an ask's answer (fase 3, item 3) — cross-boundary for the same reason LoopScheduleKind is: it discriminates the console's and the panel's answer union (and therefore the SDK member each validates against), the stop's recorded answer and the ask's default. OPTION: one of the ask's options, by id. TEXT: free text. DEFAULT: the deadline passed and the declared default applied — recorded on the stop by the deadline job only, never accepted from a person.")
enum AskAnswerKind {
  OPTION: "OPTION",
  TEXT: "TEXT",
  DEFAULT: "DEFAULT",
}
